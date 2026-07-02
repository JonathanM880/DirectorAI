/**
 * publish-engine.ts
 *
 * Local polling worker that acts as the backend publishing engine.
 * Mirrors the tick() algorithm from supabase/functions/scheduler/scheduling-engine.ts
 * and the Telegram logic from supabase/functions/_shared/publisher/telegram.publisher.ts.
 *
 * Usage:
 *   npx tsx scripts/publish-engine.ts
 *
 * Required env vars (read from .env automatically):
 *   SUPABASE_URL               – Project URL
 *   SUPABASE_SERVICE_ROLE_KEY  – Service-role secret (bypasses RLS)
 *   TELEGRAM_BOT_TOKEN         – Bot token from @BotFather
 *
 * The TELEGRAM_BOT_TOKEN can also be stored in Supabase Vault under the key
 * "telegram_bot_token". The engine will try both sources.
 */

// ── Bootstrap ────────────────────────────────────────────────────────────────

try {
  require('dotenv').config({ path: `${__dirname}/../.env` });
} catch {
  // dotenv optional – env vars may already be set
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const SUPABASE_URL              = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// Bot token: prefer env var, fall back to Vault lookup per-channel at runtime
const BOT_TOKEN_FROM_ENV = process.env['TELEGRAM_BOT_TOKEN'] ?? null;

const POLL_INTERVAL_MS  = 10_000;      // 10 seconds
const STALE_PUBLISH_MS  = 5 * 60_000; // 5 minutes
const RETRY_BACKOFF_MS  = 60_000;      // 1 minute base (doubles each attempt)

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Types ────────────────────────────────────────────────────────────────────

interface DbPost {
  id: string;
  user_id: string;
  channel_id: string;
  text_content: string | null;
  media_asset_ids: string[];
  media_type: 'photo' | 'video' | 'audio' | 'document' | null;
  scheduled_at: string;
  status: string;
  retry_count: number;
  max_retries: number;
  platform_message_id: string | null;
  published_at: string | null;
  next_retry_at: string | null;
  recurrence_rule_id: string | null;
  parent_post_id: string | null;
  created_at: string;
  updated_at: string;
  channels: {
    id: string;
    platform: string;
    channel_identifier: string;
    user_id: string;
  };
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number; chat: { id: number } };
  error_code?: number;
  description?: string;
}

interface PublishOutcome {
  success: boolean;
  platformMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

// ── Telegram API helpers ─────────────────────────────────────────────────────

/** Mirrors TelegramPublisher.applyMarkdownFormatting() */
function applyMarkdownFormatting(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;');
}

/** Mirrors TelegramPublisher.getEndpoint() */
function getEndpoint(mediaType?: string | null): string {
  switch (mediaType) {
    case 'photo':    return 'sendPhoto';
    case 'video':    return 'sendVideo';
    case 'audio':    return 'sendAudio';
    case 'document': return 'sendDocument';
    default:         return 'sendMessage';
  }
}

/** Mirrors TelegramPublisher.buildPayload() */
function buildPayload(post: DbPost, chatId: string): Record<string, unknown> {
  const base = { chat_id: chatId };
  const text = applyMarkdownFormatting(post.text_content ?? '');

  switch (post.media_type) {
    case 'photo':
      return { ...base, photo:    post.media_asset_ids?.[0], caption: text, parse_mode: 'Markdown' };
    case 'video':
      return { ...base, video:    post.media_asset_ids?.[0], caption: text, parse_mode: 'Markdown' };
    case 'audio':
      return { ...base, audio:    post.media_asset_ids?.[0], caption: text, parse_mode: 'Markdown' };
    case 'document':
      return { ...base, document: post.media_asset_ids?.[0], caption: text, parse_mode: 'Markdown' };
    default:
      return { ...base, text, parse_mode: 'Markdown', disable_web_page_preview: true };
  }
}

/** Mirrors TelegramPublisher.mapApiError() */
function mapApiError(errorCode?: number, description?: string): PublishOutcome {
  if (errorCode === 401) {
    return { success: false, errorCode: 'INVALID_TOKEN',    errorMessage: description ?? 'Invalid Telegram bot token',    retryable: false };
  }
  if (errorCode && errorCode >= 500) {
    return { success: false, errorCode: 'NETWORK_ERROR',    errorMessage: description ?? 'Telegram server error',         retryable: true  };
  }
  if (!errorCode) {
    return { success: false, errorCode: 'NETWORK_ERROR',    errorMessage: description ?? 'Network error or timeout',      retryable: true  };
  }
  return   { success: false, errorCode: 'CONTENT_REJECTED', errorMessage: description ?? `Telegram API error: ${errorCode}`, retryable: false };
}

/** Mirrors TelegramPublisher.callTelegramApi() */
async function callTelegramApi(
  token: string,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<TelegramApiResponse> {
  const url = `https://api.telegram.org/bot${token}/${endpoint}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return res.json() as Promise<TelegramApiResponse>;
}

/**
 * Resolve the Telegram bot token for a given user.
 * Priority: TELEGRAM_BOT_TOKEN env var → Supabase Vault RPC.
 */
async function resolveBotToken(userId: string): Promise<string | null> {
  if (BOT_TOKEN_FROM_ENV) return BOT_TOKEN_FROM_ENV;

  const { data, error } = await supabase.rpc('vault_get_secret', {
    p_user_id:  userId,
    p_key_name: 'telegram_bot_token',
  });

  if (error || !data) return null;
  return data as string;
}

/** Send one post to Telegram. Returns a structured outcome. */
async function publishToTelegram(post: DbPost): Promise<PublishOutcome> {
  const token = await resolveBotToken(post.user_id) ?? '';

  const chatId   = post.channels.channel_identifier; // e.g. "@grupitoepiquito"
  const endpoint = getEndpoint(post.media_type);
  const payload  = buildPayload(post, chatId);

  try {
    const response = await callTelegramApi(token, endpoint, payload);

    if (response.ok && response.result?.message_id) {
      return { success: true, platformMessageId: response.result.message_id.toString() };
    }
    return mapApiError(response.error_code, response.description);
  } catch (err: unknown) {
    return mapApiError(undefined, err instanceof Error ? err.message : String(err));
  }
}

// ── Database helpers ─────────────────────────────────────────────────────────

/** Optimistic lock: atomically flip status from 'scheduled' → 'publishing'. */
async function markPublishing(postId: string): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'publishing' })
    .eq('id', postId)
    .eq('status', 'scheduled');
  return !error;
}

async function markPublished(postId: string, platformMessageId: string, publishedAt: Date): Promise<void> {
  await supabase
    .from('scheduled_posts')
    .update({ status: 'published', platform_message_id: platformMessageId, published_at: publishedAt.toISOString() })
    .eq('id', postId);
}

async function markFailed(postId: string): Promise<void> {
  await supabase.from('scheduled_posts').update({ status: 'failed' }).eq('id', postId);
}

async function markRetrying(postId: string, currentRetryCount: number, now: Date): Promise<void> {
  // Exponential backoff: 1 min × 2^attempt, capped at 1 hour
  const backoffMs = Math.min(RETRY_BACKOFF_MS * Math.pow(2, currentRetryCount), 3_600_000);
  await supabase
    .from('scheduled_posts')
    .update({
      status:        'retrying',
      retry_count:   currentRetryCount + 1,
      next_retry_at: new Date(now.getTime() + backoffMs).toISOString(),
    })
    .eq('id', postId);
}

async function resetStalePublishingPosts(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_PUBLISH_MS).toISOString();
  const { error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'scheduled' })
    .eq('status', 'publishing')
    .lte('updated_at', cutoff);
  if (error) console.error('[engine] Failed to reset stale posts:', error.message);
}

async function writeAuditLog(
  post: DbPost,
  action: 'published' | 'failed' | 'retried',
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id:             post.user_id,
    post_id:             post.id,
    action,
    platform:            post.channels.platform,
    platform_message_id: (metadata['platformMessageId'] as string | undefined) ?? null,
    error_code:          (metadata['errorCode'] as string | undefined) ?? null,
    metadata,
    occurred_at:         new Date().toISOString(),
  });
  if (error) console.error('[engine] audit_log insert failed:', error.message);
}

// ── Core tick ────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const now = new Date();

  // 1. Reset stale 'publishing' posts (stuck > 5 min)
  await resetStalePublishingPosts(now);

  // 2. Query all due posts, joined with channels so we get channel_identifier + platform
  //    Note: the Edge Function also filters by active subscriptions – skipped here
  //    so the demo works without a Stripe subscription row.
  const { data: posts, error: queryError } = await supabase
    .from('scheduled_posts')
    .select(`
      *,
      channels!inner(id, platform, channel_identifier, user_id)
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (queryError) {
    console.error('[engine] Query error:', queryError.message);
    return;
  }

  if (!posts || posts.length === 0) {
    process.stdout.write('.');
    return;
  }

  console.log(`\n[engine] ${new Date().toLocaleTimeString()} — ${posts.length} post(s) due`);

  // 3. Process each post
  for (const row of posts as DbPost[]) {
    const shortId  = row.id.slice(0, 8);
    const platform = row.channels.platform;

    if (platform !== 'telegram') {
      console.warn(`[engine] [${shortId}] Platform "${platform}" not supported — marking failed`);
      await markFailed(row.id);
      await writeAuditLog(row, 'failed', { errorCode: 'PLATFORM_OUTAGE', errorMessage: `Platform "${platform}" not supported` });
      continue;
    }

    // Optimistic lock — prevents double-publishing if two workers race
    const locked = await markPublishing(row.id);
    if (!locked) {
      console.warn(`[engine] [${shortId}] Already grabbed by another worker — skipping`);
      continue;
    }

    // Log successful activation (publishing)
    await writeAuditLog(row, 'publishing', { detail: 'Post activated for publishing' });

    console.log(`[engine] [${shortId}] → ${platform} ${row.channels.channel_identifier} | "${(row.text_content ?? '').slice(0, 60)}"`);

    const outcome      = await publishToTelegram(row);
    const publishedAt  = new Date();

    if (outcome.success && outcome.platformMessageId) {
      await markPublished(row.id, outcome.platformMessageId, publishedAt);
      await writeAuditLog(row, 'published', { platformMessageId: outcome.platformMessageId, publishedAt: publishedAt.toISOString() });
      console.log(`[engine] [${shortId}] ✅ Published — Telegram message_id=${outcome.platformMessageId}`);
    } else if (outcome.retryable && row.retry_count < row.max_retries) {
      await markRetrying(row.id, row.retry_count, now);
      await writeAuditLog(row, 'retried', { errorCode: outcome.errorCode, errorMessage: outcome.errorMessage, attempt: row.retry_count + 1 });
      console.warn(`[engine] [${shortId}] ⚠️  Retrying (${row.retry_count + 1}/${row.max_retries}): ${outcome.errorMessage}`);
    } else {
      await markFailed(row.id);
      await writeAuditLog(row, 'failed', { errorCode: outcome.errorCode, errorMessage: outcome.errorMessage });
      console.error(`[engine] [${shortId}] ❌ Failed (${outcome.errorCode}): ${outcome.errorMessage}`);
    }
  }
}

// ── Polling loop ─────────────────────────────────────────────────────────────

let running = true;

async function loop(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║      DirectorAI – Local Publish Engine               ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Targeting : ${SUPABASE_URL}`);
  console.log(`Bot token : ${BOT_TOKEN_FROM_ENV ? '✓ loaded from TELEGRAM_BOT_TOKEN env var' : '⚠ not in env — will query Vault per-user'}`);
  console.log(`Poll rate : every ${POLL_INTERVAL_MS / 1000}s  |  dots = idle\n`);

  while (running) {
    try {
      await tick();
    } catch (err: unknown) {
      console.error('[engine] Unhandled tick error:', err instanceof Error ? err.message : err);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('\n[engine] Shutdown complete.');
}

process.on('SIGINT',  () => { console.log('\n[engine] SIGINT received. Stopping after this tick…'); running = false; });
process.on('SIGTERM', () => { console.log('\n[engine] SIGTERM received. Stopping after this tick…'); running = false; });

loop().catch((err: unknown) => {
  console.error('[engine] Fatal:', err);
  process.exit(1);
});
