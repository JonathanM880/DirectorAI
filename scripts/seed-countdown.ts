/**
 * seed-countdown.ts
 *
 * Staging script for the DirectorAI live-stream countdown demo.
 * Populates the Supabase database with a channel, scheduled countdown
 * posts, a dummy AI asset post, and historical audit-log entries so
 * the live publishing engine has real data to process during the demo.
 *
 * Usage:
 *   npx ts-node scripts/seed-countdown.ts
 *   -- or --
 *   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npx ts-node scripts/seed-countdown.ts
 *
 * Environment variables (required):
 *   SUPABASE_URL               – Project URL  (e.g. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY  – Service-role secret (bypasses RLS)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Bring in types from the shared barrel – strictly no ad-hoc shapes.
import type {
  ScheduledPostRecord,
  AssetRecord,
  AuditLogRecord,
  Channel,
  SocialPlatform,
  PostStatus,
  PublishErrorCode,
} from '../packages/types/index';

// ---------------------------------------------------------------------------
// 0. Bootstrap – environment & Supabase client
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Set it in .env or export it before running this script.`,
    );
  }
  return value;
}

// Load .env automatically if present (no prod risk – this is a dev script).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: `${__dirname}/../.env` });
} catch {
  // dotenv is optional; env vars may already be injected by CI / shell.
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Target user – must match the account you are logged into in the UI.
// RLS uses auth.uid(), so all seeded rows must belong to this exact user.
// ---------------------------------------------------------------------------
const TARGET_EMAIL = 'user_a_ma1i7@example.com';

// ---------------------------------------------------------------------------
// 1. Resolve a real user ID from the database
// ---------------------------------------------------------------------------

/**
 * Looks up TARGET_EMAIL in auth.users via the Admin API and returns their
 * real UUID. Also upserts the matching `users_profile` row so the FK chain
 *   channels.user_id → public.users_profile.id
 * is satisfied even when the UI onboarding flow has not yet run.
 *
 * Throws a clear, actionable error when the account cannot be found.
 */
async function resolveUserId(): Promise<string> {
  console.log(`  …  Looking up "${TARGET_EMAIL}" in auth.users …`);

  // listUsers does not support server-side email filtering, so we fetch in
  // pages until we find the match (typically the account list is tiny in dev).
  let page = 1;
  const perPage = 50;
  let authUser: { id: string; email?: string; user_metadata: Record<string, unknown> } | undefined;

  while (!authUser) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(
        `auth.admin.listUsers failed: ${error.message}\n` +
          'Ensure SUPABASE_SERVICE_ROLE_KEY is set correctly.',
      );
    }

    const match = data.users.find(
      (u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase(),
    );

    if (match) {
      authUser = match;
      break;
    }

    // No more pages to scan.
    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  if (!authUser) {
    throw new Error(
      `User with email ${TARGET_EMAIL} not found.\n` +
        'Log into the UI first to create the account.',
    );
  }

  console.log(`  ✓  Found user: ${authUser.id} <${TARGET_EMAIL}>`);

  // ── Ensure users_profile row exists (FK anchor for all other tables) ──────
  const { error: upsertError } = await supabase
    .from('users_profile')
    .upsert(
      {
        id: authUser.id,
        email: authUser.email ?? TARGET_EMAIL,
        display_name:
          (authUser.user_metadata?.['full_name'] as string | undefined) ?? 'Demo User',
        timezone: 'America/Mexico_City',
        plan_id: 'starter',
        onboarding_completed: false,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  if (upsertError) {
    // Non-fatal if the profile already exists with different constraints;
    // log and continue – downstream inserts will surface any real FK error.
    console.warn(
      `  ⚠  users_profile upsert warning: ${upsertError.message}\n` +
        '      Proceeding – profile row likely already exists.',
    );
  } else {
    console.log('  ✓  users_profile row ensured.');
  }

  return authUser.id;
}

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------

/** Returns an ISO-8601 timestamp offset by `offsetMinutes` from now. */
function nowPlusMinutes(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

/** Returns an ISO-8601 timestamp offset by `offsetMinutes` BEFORE now. */
function nowMinusMinutes(offsetMinutes: number): string {
  return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
}

/**
 * Thin wrapper around a Supabase insert that:
 *  - Throws on error so the script aborts early.
 *  - Logs success for visibility.
 */
async function insert<T extends object>(
  table: string,
  rows: T | T[],
): Promise<void> {
  const payload = Array.isArray(rows) ? rows : [rows];
  const { error } = await supabase.from(table).insert(payload as never[]);
  if (error) {
    throw new Error(`Insert into "${table}" failed: ${error.message} (${error.code})`);
  }
  const count = payload.length;
  console.log(`  \u2713  Inserted ${count} row${count === 1 ? '' : 's'} into "${table}"`);
}

// ---------------------------------------------------------------------------
// 3. Row builders – typed against @director-ai/types interfaces
// ---------------------------------------------------------------------------

// ── Channel ─────────────────────────────────────────────────────────────────

/**
 * DB row shape for the `channels` table.
 * Mirrors the {@link Channel} interface with snake_case column names.
 */
interface ChannelRow {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  name: string;
  channel_identifier: string;
  is_active: boolean;
  created_at: string;
}

function buildChannel(userId: string, channelId: string): ChannelRow {
  const ch: Channel = {
    id: channelId,
    userId,
    platform: 'telegram',
    name: 'grupitoepiquito (demo)',
    channelIdentifier: '@grupitoepiquito',
    isActive: true,
    createdAt: new Date(),
  };

  return {
    id: ch.id,
    user_id: ch.userId,
    platform: ch.platform,
    name: ch.name,
    channel_identifier: ch.channelIdentifier,
    is_active: ch.isActive,
    created_at: ch.createdAt.toISOString(),
  };
}

// ── Scheduled posts ──────────────────────────────────────────────────────────

/**
 * DB row shape for the `scheduled_posts` table.
 * Mirrors {@link ScheduledPostRecord} with snake_case column names.
 */
interface ScheduledPostRow {
  id: string;
  user_id: string;
  channel_id: string;
  text_content?: string;
  media_asset_ids: string[];
  media_type?: 'photo' | 'video' | 'audio' | 'document';
  scheduled_at: string;
  status: PostStatus;
  retry_count: number;
  max_retries: number;
  platform_message_id?: string;
  published_at?: string;
  next_retry_at?: string;
  recurrence_rule_id?: string;
  parent_post_id?: string;
  created_at: string;
  updated_at: string;
}

function recordToRow(record: ScheduledPostRecord): ScheduledPostRow {
  return {
    id: record.id,
    user_id: record.userId,
    channel_id: record.channelId,
    text_content: record.textContent,
    media_asset_ids: record.mediaAssetIds,
    media_type: record.mediaType,
    scheduled_at: (record.scheduledAt as Date).toISOString(),
    status: record.status,
    retry_count: record.retryCount,
    max_retries: record.maxRetries,
    platform_message_id: record.platformMessageId,
    published_at: record.publishedAt?.toISOString(),
    next_retry_at: record.nextRetryAt?.toISOString(),
    recurrence_rule_id: record.recurrenceRuleId,
    parent_post_id: record.parentPostId,
    created_at: (record.createdAt as Date).toISOString(),
    updated_at: (record.updatedAt as Date).toISOString(),
  };
}

// Countdown texts in chronological order (soonest first)
const COUNTDOWN_TEXTS: string[] = [
  '\uD83C\uDFA4 Empezamos stream en 30 minutos!',
  '\u23F3 Empezamos en 25 minutos...',
  '\uD83D\uDD14 Empezamos en 15...',
  '\uD83D\uDEA8 Faltan 5!',
  '\uD83D\uDD34 Empezando en 1 minuto!',
];

function buildCountdownPosts(
  userId: string,
  channelId: string,
  countdownPostIds: string[],
): ScheduledPostRow[] {
  return countdownPostIds.map((id, index) => {
    const record: ScheduledPostRecord = {
      id,
      userId,
      channelId,
      textContent: COUNTDOWN_TEXTS[index],
      mediaAssetIds: [],
      scheduledAt: new Date(nowPlusMinutes(index + 1)), // +1 min, +2 min, ..., +5 min
      status: 'scheduled',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return recordToRow(record);
  });
}

function buildAiImagePost(
  userId: string,
  channelId: string,
  aiPostId: string,
  aiAssetId: string,
): ScheduledPostRow {
  const record: ScheduledPostRecord = {
    id: aiPostId,
    userId,
    channelId,
    textContent: '\uD83D\uDE80 \u00a1Entra ya al stream!',
    mediaAssetIds: [aiAssetId],
    mediaType: 'photo',
    // Last in sequence: +6 minutes from now
    scheduledAt: new Date(nowPlusMinutes(6)),
    status: 'scheduled',
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return recordToRow(record);
}

// Historical posts (past)
function buildHistoricalPublishedPost(
  userId: string,
  channelId: string,
  id: string,
  text: string,
  minsAgo: number,
  platformMessageId: string,
): ScheduledPostRow {
  const publishedAt = new Date(nowMinusMinutes(minsAgo));
  const record: ScheduledPostRecord = {
    id,
    userId,
    channelId,
    textContent: text,
    mediaAssetIds: [],
    scheduledAt: new Date(publishedAt.getTime() - 60_000), // scheduled 1 min before
    status: 'published',
    retryCount: 0,
    maxRetries: 3,
    platformMessageId,
    publishedAt,
    createdAt: new Date(publishedAt.getTime() - 120_000),
    updatedAt: publishedAt,
  };
  return recordToRow(record);
}

function buildHistoricalFailedPost(
  userId: string,
  channelId: string,
  id: string,
  minsAgo: number,
): ScheduledPostRow {
  const failedAt = new Date(nowMinusMinutes(minsAgo));
  const record: ScheduledPostRecord = {
    id,
    userId,
    channelId,
    textContent: '\u26A0\uFE0F Este mensaje fall\u00F3 al publicarse (demo de error)',
    mediaAssetIds: [],
    scheduledAt: new Date(failedAt.getTime() - 60_000),
    status: 'failed',
    retryCount: 3,
    maxRetries: 3,
    createdAt: new Date(failedAt.getTime() - 120_000),
    updatedAt: failedAt,
  };
  return recordToRow(record);
}

// ── Asset ────────────────────────────────────────────────────────────────────

/**
 * DB row shape for the `assets` table.
 * Mirrors {@link AssetRecord} with snake_case column names.
 */
interface AssetRow {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  folder: string;
  tags: string[];
  source: 'user_upload' | 'ai_generated';
  generation_prompt?: string;
  ai_model?: string;
  created_at: string;
}

function buildAiAsset(userId: string, aiAssetId: string): AssetRow {
  const record: AssetRecord = {
    id: aiAssetId,
    userId,
    filename: 'stream-banner-ai.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 0, // placeholder – actual file not uploaded (AI module pending)
    storagePath: 'ai-generated/stream-banner-ai.jpg',
    folder: 'ai-generated',
    tags: ['stream', 'banner', 'demo'],
    source: 'ai_generated',
    generationPrompt: 'Vibrant live-stream banner for @grupitoepiquito, dark neon aesthetic',
    aiModel: 'pending',
    createdAt: new Date(),
  };

  return {
    id: record.id,
    user_id: record.userId,
    filename: record.filename,
    mime_type: record.mimeType,
    size_bytes: record.sizeBytes,
    storage_path: record.storagePath,
    folder: record.folder,
    tags: record.tags,
    source: record.source,
    generation_prompt: record.generationPrompt,
    ai_model: record.aiModel,
    created_at: record.createdAt.toISOString(),
  };
}

// ── Audit log ────────────────────────────────────────────────────────────────

/**
 * DB row shape for the `audit_log` table.
 * Mirrors {@link AuditLogRecord} with snake_case column names.
 */
interface AuditLogRow {
  id: string;
  user_id: string;
  post_id: string;
  action: AuditLogRecord['action'];
  platform: SocialPlatform;
  platform_message_id?: string;
  error_code?: PublishErrorCode;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

function auditRecordToRow(record: AuditLogRecord): AuditLogRow {
  return {
    id: record.id,
    user_id: record.userId,
    post_id: record.postId,
    action: record.action,
    platform: record.platform,
    platform_message_id: record.platformMessageId,
    error_code: record.errorCode,
    metadata: record.metadata,
    occurred_at: (record.occurredAt as Date).toISOString(),
  };
}

function buildPublishedAuditEntry(
  userId: string,
  id: string,
  postId: string,
  platformMessageId: string,
  minsAgo: number,
): AuditLogRow {
  const record: AuditLogRecord = {
    id,
    userId,
    postId,
    action: 'published',
    platform: 'telegram',
    platformMessageId,
    metadata: { seeded: true, demo: 'live-stream-countdown' },
    occurredAt: new Date(nowMinusMinutes(minsAgo)),
  };
  return auditRecordToRow(record);
}

function buildFailedAuditEntry(
  userId: string,
  id: string,
  postId: string,
  minsAgo: number,
): AuditLogRow {
  const record: AuditLogRecord = {
    id,
    userId,
    postId,
    action: 'failed',
    platform: 'telegram',
    errorCode: 'NETWORK_ERROR' as PublishErrorCode,
    metadata: {
      seeded: true,
      demo: 'live-stream-countdown',
      errorDetail: 'Connection timed out after 3 attempts',
    },
    occurredAt: new Date(nowMinusMinutes(minsAgo)),
  };
  return auditRecordToRow(record);
}

// ---------------------------------------------------------------------------
// 4. Main seed routine
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551   DirectorAI \u2013 Live Stream Countdown Seed Script     \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n');
  console.log(`Targeting: ${SUPABASE_URL}\n`);

  // ── Pre-flight: resolve a real user ID ──────────────────────────────────
  console.log('\u25B6 Pre-flight \u2013 Resolving existing user ID ...');
  const userId = await resolveUserId();

  // ── Generate all UUIDs now that we have a valid userId ─────────────────
  const channelId = randomUUID();
  const aiAssetId = randomUUID();
  const countdownPostIds: string[] = Array.from({ length: 5 }, () => randomUUID());
  const aiPostId = randomUUID();
  const histPublished1Id = randomUUID();
  const histPublished2Id = randomUUID();
  const histFailedId = randomUUID();
  const auditPub1Id = randomUUID();
  const auditPub2Id = randomUUID();
  const auditFailId = randomUUID();

  // Step 1: Channel
  console.log('\n\u25B6 Step 1 / 5 \u2013 Inserting Telegram channel ...');
  await insert('channels', buildChannel(userId, channelId));

  // Step 2: Dummy AI asset (must exist before AI post references it)
  console.log('\n\u25B6 Step 2 / 5 \u2013 Inserting AI-generated asset placeholder ...');
  await insert('assets', buildAiAsset(userId, aiAssetId));

  // Step 3: Countdown + AI image posts
  console.log('\n\u25B6 Step 3 / 5 \u2013 Inserting 6 scheduled posts (5 countdown + 1 AI image) ...');
  const futurePosts: ScheduledPostRow[] = [
    ...buildCountdownPosts(userId, channelId, countdownPostIds),
    buildAiImagePost(userId, channelId, aiPostId, aiAssetId),
  ];
  await insert('scheduled_posts', futurePosts);

  // Step 4: Historical posts
  console.log('\n\u25B6 Step 4 / 5 \u2013 Inserting 3 historical posts (2 published, 1 failed) ...');
  const platformMsgId1 = `tg_demo_${Date.now()}_1`;
  const platformMsgId2 = `tg_demo_${Date.now()}_2`;

  const historicalPosts: ScheduledPostRow[] = [
    buildHistoricalPublishedPost(
      userId,
      channelId,
      histPublished1Id,
      '\u2705 Stream confirmado para esta tarde! No se lo pierdan.',
      90, // 90 minutes ago
      platformMsgId1,
    ),
    buildHistoricalPublishedPost(
      userId,
      channelId,
      histPublished2Id,
      '\uD83D\uDCE2 Recuerden activar las notificaciones del canal.',
      45, // 45 minutes ago
      platformMsgId2,
    ),
    buildHistoricalFailedPost(
      userId,
      channelId,
      histFailedId,
      20, // 20 minutes ago
    ),
  ];
  await insert('scheduled_posts', historicalPosts);

  // Step 5: Audit log entries
  console.log('\n\u25B6 Step 5 / 5 \u2013 Inserting 3 audit log entries ...');
  const auditEntries: AuditLogRow[] = [
    buildPublishedAuditEntry(userId, auditPub1Id, histPublished1Id, platformMsgId1, 90),
    buildPublishedAuditEntry(userId, auditPub2Id, histPublished2Id, platformMsgId2, 45),
    buildFailedAuditEntry(userId, auditFailId, histFailedId, 20),
  ];
  await insert('audit_log', auditEntries);

  // Summary
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551                  Seed complete! \u2705                   \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  console.log('\nSeeded identifiers (save these for debugging):');
  console.log(`  Owner user ID : ${userId}`);
  console.log(`  Channel ID    : ${channelId}`);
  console.log(`  AI Asset ID   : ${aiAssetId}`);
  console.log('  Countdown posts (in order):');
  countdownPostIds.forEach((id, i) => {
    const mins = i + 1;
    console.log(`    [+${mins} min]  ${id}  "${COUNTDOWN_TEXTS[i]}"`);
  });
  console.log(`  AI Image post [+6 min]: ${aiPostId}`);
  console.log(`\n  Historical published : ${histPublished1Id}`);
  console.log(`  Historical published : ${histPublished2Id}`);
  console.log(`  Historical failed    : ${histFailedId}`);
  console.log('\nThe cron engine will pick up posts as their scheduledAt windows open.\n');
}

// ---------------------------------------------------------------------------
// 5. Entry point
// ---------------------------------------------------------------------------

seed().catch((err: unknown) => {
  console.error('\n\u274C Seed failed:\n', err instanceof Error ? err.message : err);
  process.exit(1);
});
