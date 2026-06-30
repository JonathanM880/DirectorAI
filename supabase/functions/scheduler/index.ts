/**
 * supabase/functions/scheduler/index.ts
 *
 * DirectorAI – Production Scheduling Engine (Supabase Edge Function)
 *
 * Triggered periodically by pg_cron (or any authenticated POST call).
 * Fetches all due scheduled posts, publishes each to the appropriate platform,
 * updates the database accordingly, and returns a structured JSON summary.
 *
 * Environment variables required (set in Supabase Dashboard → Project Settings → Edge Functions):
 *   SUPABASE_URL              – Project REST URL (injected automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY – Service-role secret (injected automatically by Supabase)
 *   TELEGRAM_BOT_TOKEN        – Global bot token from @BotFather (optional; falls back to Vault)
 *   CRON_SECRET               – Shared secret validated in the Authorization header
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  Deno.serve()                                                   │
 *   │    └── handleRequest()          ← auth guard, cron entry point  │
 *   │          └── runTick()          ← orchestrates a single run     │
 *   │                ├── resetStalePublishingPosts()                  │
 *   │                ├── fetchDuePosts()                              │
 *   │                └── processPost() × N                           │
 *   │                      ├── markPublishing()   (optimistic lock)   │
 *   │                      ├── resolveBotToken()  (env → Vault)       │
 *   │                      ├── publishToTelegram()                    │
 *   │                      │     ├── buildTelegramPayload()           │
 *   │                      │     └── callTelegramApi()                │
 *   │                      ├── markPublished() / markRetrying()       │
 *   │                      │     / markFailed()                       │
 *   │                      └── writeAuditLog()                        │
 *   └─────────────────────────────────────────────────────────────────┘
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// § 1 · Configuration constants
// ─────────────────────────────────────────────────────────────────────────────

/** Posts stuck in 'publishing' longer than this are reset to 'scheduled'. */
const STALE_PUBLISH_MS = 5 * 60_000; // 5 minutes

/** Base delay for exponential back-off on the first retry attempt (1 minute). */
const RETRY_BACKOFF_BASE_MS = 60_000;

/** Hard cap on exponential back-off (1 hour). */
const RETRY_BACKOFF_MAX_MS = 3_600_000;

/** Maximum number of posts processed in a single tick (prevents runaway execution). */
const BATCH_LIMIT = 100;

// ─────────────────────────────────────────────────────────────────────────────
// § 2 · Types
// ─────────────────────────────────────────────────────────────────────────────

/** Represents a row in `scheduled_posts` joined with its parent `channels` row. */
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
  /** Joined from the `channels` table via `channels!inner(...)`. */
  channels: {
    id: string;
    platform: string;
    channel_identifier: string; // e.g. "@my_channel" or a numeric chat ID
    user_id: string;
  };
}

/** Structured result of a single Telegram publish attempt. */
interface PublishOutcome {
  success: boolean;
  platformMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** If true, the error is transient and the post should be re-queued. */
  retryable?: boolean;
}

/** Shape of the raw Telegram Bot API response. */
interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number; chat: { id: number } };
  error_code?: number;
  description?: string;
}

/** JSON body returned by this Edge Function on every invocation. */
interface ExecutionSummary {
  tickStartedAt: string;
  tickFinishedAt: string;
  postsFound: number;
  succeeded: number;
  retryQueued: number;
  failed: number;
  processedIds: string[];
  succeededIds: string[];
  retryIds: string[];
  failedIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 · Telegram helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escapes HTML entities that would break Telegram's Markdown parser.
 * Mirrors TelegramPublisher.applyMarkdownFormatting().
 */
function applyMarkdownFormatting(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Returns the correct Telegram Bot API method name for the given media type.
 * Mirrors TelegramPublisher.getEndpoint().
 */
function getTelegramEndpoint(mediaType?: string | null): string {
  switch (mediaType) {
    case 'photo':    return 'sendPhoto';
    case 'video':    return 'sendVideo';
    case 'audio':    return 'sendAudio';
    case 'document': return 'sendDocument';
    default:         return 'sendMessage';
  }
}

/**
 * Constructs the Telegram Bot API request body for a given post.
 * Mirrors TelegramPublisher.buildPayload().
 */
function buildTelegramPayload(post: DbPost, chatId: string, mediaUrl: string | null): Record<string, unknown> {
  const base = { chat_id: chatId };
  const text = applyMarkdownFormatting(post.text_content ?? '');

  switch (post.media_type) {
    case 'photo':
      return { ...base, photo:    mediaUrl, caption: text, parse_mode: 'Markdown' };
    case 'video':
      return { ...base, video:    mediaUrl, caption: text, parse_mode: 'Markdown' };
    case 'audio':
      return { ...base, audio:    mediaUrl, caption: text, parse_mode: 'Markdown' };
    case 'document':
      return { ...base, document: mediaUrl, caption: text, parse_mode: 'Markdown' };
    default:
      return { ...base, text, parse_mode: 'Markdown', disable_web_page_preview: true };
  }
}

/**
 * Converts a Telegram API error code + description into a structured PublishOutcome.
 * Mirrors TelegramPublisher.mapApiError().
 */
function mapTelegramError(errorCode?: number, description?: string): PublishOutcome {
  if (errorCode === 401) {
    return {
      success:      false,
      errorCode:    'INVALID_TOKEN',
      errorMessage: description ?? 'Invalid Telegram bot token',
      retryable:    false,
    };
  }
  if (errorCode && errorCode >= 500) {
    return {
      success:      false,
      errorCode:    'NETWORK_ERROR',
      errorMessage: description ?? 'Telegram server error (5xx)',
      retryable:    true,
    };
  }
  if (!errorCode) {
    return {
      success:      false,
      errorCode:    'NETWORK_ERROR',
      errorMessage: description ?? 'Network error or timeout',
      retryable:    true,
    };
  }
  // All other 4xx errors (e.g. 400 Bad Request, 403 Forbidden)
  return {
    success:      false,
    errorCode:    'CONTENT_REJECTED',
    errorMessage: description ?? `Telegram API error: ${errorCode}`,
    retryable:    false,
  };
}

/**
 * Performs the actual HTTP call to the Telegram Bot API.
 * Throws on network-level errors; never throws on API-level errors.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// § 4 · Token resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the Telegram Bot token for a given user.
 *
 * Priority:
 *   1. TELEGRAM_BOT_TOKEN environment variable (global, fastest path)
 *   2. Supabase Vault via `vault_get_secret` RPC (per-user credential store)
 *
 * Returns null if no token can be found through either method.
 */
async function resolveBotToken(
  supabase: SupabaseClient,
  userId: string,
  globalToken: string | null,
): Promise<string | null> {
  if (globalToken) return globalToken;

  console.log(`[scheduler] Vault lookup for user ${userId.slice(0, 8)}…`);
  const { data, error } = await supabase.rpc('vault_get_secret', {
    p_user_id:  userId,
    p_key_name: 'telegram_bot_token',
  });

  if (error) {
    console.error(`[scheduler] Vault lookup error for user ${userId.slice(0, 8)}: ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5 · Database helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically flips a post's status from 'scheduled' → 'publishing'.
 * The `.eq('status', 'scheduled')` clause acts as an optimistic lock:
 * if two concurrent workers race, only one will succeed.
 * Returns true if this worker won the lock.
 */
async function markPublishing(supabase: SupabaseClient, postId: string): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'publishing', updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('status', 'scheduled');

  if (error) {
    console.error(`[scheduler] markPublishing error for ${postId.slice(0, 8)}: ${error.message}`);
    return false;
  }
  return true;
}

/** Updates a successfully published post with its final status and Telegram message ID. */
async function markPublished(
  supabase: SupabaseClient,
  postId: string,
  platformMessageId: string,
  publishedAt: Date,
): Promise<void> {
  const { error } = await supabase
    .from('scheduled_posts')
    .update({
      status:              'published',
      platform_message_id: platformMessageId,
      published_at:        publishedAt.toISOString(),
      updated_at:          new Date().toISOString(),
    })
    .eq('id', postId);

  if (error) {
    console.error(`[scheduler] markPublished error for ${postId.slice(0, 8)}: ${error.message}`);
  }
}

/**
 * Schedules a post for retry using exponential back-off.
 * Back-off formula: min(RETRY_BACKOFF_BASE_MS × 2^attempt, RETRY_BACKOFF_MAX_MS)
 */
async function markRetrying(
  supabase: SupabaseClient,
  postId: string,
  currentRetryCount: number,
  now: Date,
): Promise<void> {
  const backoffMs = Math.min(
    RETRY_BACKOFF_BASE_MS * Math.pow(2, currentRetryCount),
    RETRY_BACKOFF_MAX_MS,
  );
  const nextRetryAt = new Date(now.getTime() + backoffMs).toISOString();

  const { error } = await supabase
    .from('scheduled_posts')
    .update({
      status:        'retrying',
      retry_count:   currentRetryCount + 1,
      next_retry_at: nextRetryAt,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', postId);

  if (error) {
    console.error(`[scheduler] markRetrying error for ${postId.slice(0, 8)}: ${error.message}`);
  }
}

/** Marks a post as permanently failed. */
async function markFailed(supabase: SupabaseClient, postId: string): Promise<void> {
  const { error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', postId);

  if (error) {
    console.error(`[scheduler] markFailed error for ${postId.slice(0, 8)}: ${error.message}`);
  }
}

/**
 * Resets posts that have been stuck in 'publishing' for longer than STALE_PUBLISH_MS.
 * This guards against worker crashes that leave posts in a zombie state.
 */
async function resetStalePublishingPosts(supabase: SupabaseClient, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - STALE_PUBLISH_MS).toISOString();

  const { error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'scheduled', updated_at: now.toISOString() })
    .eq('status', 'publishing')
    .lte('updated_at', cutoff);

  if (error) {
    console.error(`[scheduler] resetStalePublishingPosts error: ${error.message}`);
  } else {
    console.log(`[scheduler] Stale publishing posts reset (cutoff: ${cutoff})`);
  }
}

/**
 * Fetches all posts that are due for publication right now.
 * Joins with `channels` to get the platform identifier in a single query.
 * Also filters by users who have an active subscription.
 */
async function fetchDuePosts(
  supabase: SupabaseClient,
  now: Date,
): Promise<DbPost[] | null> {
  const { data: posts, error: queryError } = await supabase
    .from('scheduled_posts')
    .select(`
      *,
      channels!inner(id, platform, channel_identifier, user_id)
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (queryError) {
    console.error(`[scheduler] fetchDuePosts query error: ${queryError.message}`);
    return null;
  }

  return (posts as DbPost[]) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6 · Audit log
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts an immutable audit log entry for every publish outcome.
 * Failures here are logged but never rethrown — audit logging must not
 * affect the primary publishing flow.
 */
async function writeAuditLog(
  supabase: SupabaseClient,
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

  if (error) {
    console.error(`[scheduler] audit_log insert failed for post ${post.id.slice(0, 8)}: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7 · Per-post publish orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publishes a single post to Telegram.
 * Returns a structured outcome regardless of success or failure.
 */
async function publishToTelegram(
  supabase: SupabaseClient,
  post: DbPost,
  globalToken: string | null,
): Promise<PublishOutcome> {
  const token = await resolveBotToken(supabase, post.user_id, globalToken);

  if (!token) {
    return {
      success:      false,
      errorCode:    'INVALID_TOKEN',
      errorMessage: 'telegram_bot_token not set. Configure TELEGRAM_BOT_TOKEN env var or store it in Supabase Vault.',
      retryable:    false,
    };
  }

  let mediaUrl: string | null = null;
  const firstAssetId = post.media_asset_ids?.[0];

  if (firstAssetId) {
    const { data: assetData, error: assetError } = await supabase
      .from('assets')
      .select('storage_path')
      .eq('id', firstAssetId)
      .single();

    if (!assetError && assetData?.storage_path) {
      const { data } = supabase.storage.from('assets').getPublicUrl(assetData.storage_path);
      if (data && typeof data.publicUrl === 'string') {
        mediaUrl = String(data.publicUrl).trim();
      }
    }
  }

  const chatId   = post.channels.channel_identifier;
  const endpoint = getTelegramEndpoint(post.media_type);
  const payload  = buildTelegramPayload(post, chatId, mediaUrl);

  try {
    const response = await callTelegramApi(token, endpoint, payload);

    if (response.ok && response.result?.message_id) {
      return {
        success:           true,
        platformMessageId: response.result.message_id.toString(),
      };
    }
    return mapTelegramError(response.error_code, response.description);
  } catch (err: unknown) {
    // Network-level failure (DNS, timeout, etc.)
    return mapTelegramError(undefined, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Processes a single DbPost through the full publish lifecycle:
 *   1. Optimistic lock (markPublishing)
 *   2. Platform dispatch
 *   3. Status update + audit log
 *
 * Errors within this function are caught so the batch continues processing.
 * Returns a string indicating the outcome bucket: 'succeeded' | 'retried' | 'failed' | 'skipped'.
 */
async function processPost(
  supabase: SupabaseClient,
  post: DbPost,
  now: Date,
  globalToken: string | null,
): Promise<'succeeded' | 'retried' | 'failed' | 'skipped'> {
  const shortId  = post.id.slice(0, 8);
  const platform = post.channels.platform;

  // ── Guard: only Telegram is supported today ──────────────────────────────
  if (platform !== 'telegram') {
    console.warn(`[scheduler] [${shortId}] Platform "${platform}" is not supported — marking failed.`);
    await markFailed(supabase, post.id);
    await writeAuditLog(supabase, post, 'failed', {
      errorCode:    'PLATFORM_OUTAGE',
      errorMessage: `Platform "${platform}" is not currently supported`,
    });
    return 'failed';
  }

  // ── Optimistic lock — prevents double-publishing under concurrent workers ─
  const locked = await markPublishing(supabase, post.id);
  if (!locked) {
    console.warn(`[scheduler] [${shortId}] Lock not acquired — already claimed by another worker. Skipping.`);
    return 'skipped';
  }

  // Log successful activation (publishing)
  await writeAuditLog(supabase, post, 'publishing', {
    detail: 'Post activated for publishing'
  });

  console.log(
    `[scheduler] [${shortId}] Publishing → ${platform} ${post.channels.channel_identifier} | ` +
    `"${(post.text_content ?? '').slice(0, 80).replace(/\n/g, ' ')}"`,
  );

  // ── Dispatch ──────────────────────────────────────────────────────────────
  let outcome: PublishOutcome;
  try {
    outcome = await publishToTelegram(supabase, post, globalToken);
  } catch (unexpectedErr: unknown) {
    // Should never reach here — publishToTelegram is fully wrapped — but safety net.
    const msg = unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr);
    console.error(`[scheduler] [${shortId}] Unexpected publish error: ${msg}`);
    await markFailed(supabase, post.id);
    await writeAuditLog(supabase, post, 'failed', { errorCode: 'UNKNOWN', errorMessage: msg });
    return 'failed';
  }

  const publishedAt = new Date();

  // ── Handle success ────────────────────────────────────────────────────────
  if (outcome.success && outcome.platformMessageId) {
    await markPublished(supabase, post.id, outcome.platformMessageId, publishedAt);
    await writeAuditLog(supabase, post, 'published', {
      platformMessageId: outcome.platformMessageId,
      publishedAt:       publishedAt.toISOString(),
    });
    console.log(
      `[scheduler] [${shortId}] ✅ Successfully published post ID ${post.id} — ` +
      `Telegram message_id=${outcome.platformMessageId}`,
    );
    return 'succeeded';
  }

  // ── Handle retryable failure ──────────────────────────────────────────────
  if (outcome.retryable && post.retry_count < post.max_retries) {
    await markRetrying(supabase, post.id, post.retry_count, now);
    await writeAuditLog(supabase, post, 'retried', {
      errorCode:    outcome.errorCode,
      errorMessage: outcome.errorMessage,
      attempt:      post.retry_count + 1,
      maxRetries:   post.max_retries,
    });
    console.warn(
      `[scheduler] [${shortId}] ⚠️  Retrying post ID ${post.id} ` +
      `(attempt ${post.retry_count + 1}/${post.max_retries}): ` +
      `${outcome.errorCode} — ${outcome.errorMessage}`,
    );
    return 'retried';
  }

  // ── Handle permanent failure ──────────────────────────────────────────────
  await markFailed(supabase, post.id);
  await writeAuditLog(supabase, post, 'failed', {
    errorCode:    outcome.errorCode,
    errorMessage: outcome.errorMessage,
    retryCount:   post.retry_count,
    maxRetries:   post.max_retries,
  });
  console.error(
    `[scheduler] [${shortId}] ❌ Failed to publish post ID ${post.id}: ` +
    `${outcome.errorCode} — ${outcome.errorMessage} ` +
    `(retryable=${outcome.retryable}, retries exhausted: ${post.retry_count}/${post.max_retries})`,
  );
  return 'failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8 · Main tick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes one complete scheduling tick.
 * This is the primary business logic entry point called on every cron invocation.
 */
async function runTick(supabase: SupabaseClient, globalToken: string | null): Promise<ExecutionSummary> {
  const tickStartedAt = new Date();
  console.log(`[scheduler] ── Tick started at ${tickStartedAt.toISOString()} ──`);

  // Step 1: Heal any posts orphaned by a previous crashed worker.
  await resetStalePublishingPosts(supabase, tickStartedAt);

  // Step 2: Fetch all posts due for publication right now.
  const posts = await fetchDuePosts(supabase, tickStartedAt);

  if (posts === null) {
    // fetchDuePosts already logged the error; propagate as a fatal tick failure.
    throw new Error('Failed to fetch due posts from the database.');
  }

  console.log(`[scheduler] Found ${posts.length} pending post(s) to process.`);

  // Step 3: Process each post individually. One post's failure never aborts the batch.
  const succeededIds: string[] = [];
  const retryIds: string[]     = [];
  const failedIds: string[]    = [];
  const processedIds: string[] = [];

  for (const post of posts) {
    processedIds.push(post.id);

    try {
      const result = await processPost(supabase, post, tickStartedAt, globalToken);
      if (result === 'succeeded')    succeededIds.push(post.id);
      else if (result === 'retried') retryIds.push(post.id);
      else if (result === 'failed')  failedIds.push(post.id);
      // 'skipped' is intentionally excluded from all outcome buckets
    } catch (err: unknown) {
      // Truly unexpected — processPost itself is a catch-all, so this is a last resort.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] [${post.id.slice(0, 8)}] Unhandled exception in processPost: ${msg}`);
      failedIds.push(post.id);
    }
  }

  const tickFinishedAt = new Date();
  const durationMs     = tickFinishedAt.getTime() - tickStartedAt.getTime();

  const summary: ExecutionSummary = {
    tickStartedAt:  tickStartedAt.toISOString(),
    tickFinishedAt: tickFinishedAt.toISOString(),
    postsFound:     posts.length,
    succeeded:      succeededIds.length,
    retryQueued:    retryIds.length,
    failed:         failedIds.length,
    processedIds,
    succeededIds,
    retryIds,
    failedIds,
  };

  console.log(
    `[scheduler] ── Tick complete in ${durationMs}ms ──  ` +
    `found=${summary.postsFound} | ✅ succeeded=${summary.succeeded} | ` +
    `⚠️  retried=${summary.retryQueued} | ❌ failed=${summary.failed}`,
  );

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9 · Request handler & Deno.serve entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the incoming request and dispatches to runTick().
 *
 * Security model:
 *   - Only POST requests are accepted (GET/HEAD return 405).
 *   - When CRON_SECRET is set, the Authorization header must match exactly.
 *     When CRON_SECRET is not set (e.g. local development), auth is bypassed.
 *
 * HTTP status codes returned:
 *   200 – Tick completed (inspect body for per-post outcomes)
 *   401 – Missing or invalid Authorization header
 *   405 – Method not allowed
 *   500 – Fatal error prevented tick from running
 */
async function handleRequest(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    console.warn(`[scheduler] Rejected ${req.method} request — only POST is accepted.`);
    return json({ error: 'Method Not Allowed. This endpoint only accepts POST requests.' }, 405);
  }

  // ── Auth guard ────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[scheduler] Rejected request — invalid or missing Authorization header.');
      return json({ error: 'Unauthorized.' }, 401);
    }
  } else {
    console.warn('[scheduler] CRON_SECRET is not set — skipping authorization check (dev mode).');
  }

  // ── Bootstrap Supabase client ─────────────────────────────────────────────
  const supabaseUrl            = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[scheduler] FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
    return json({ error: 'Server misconfiguration: missing Supabase credentials.' }, 500);
  }

  // The service role key bypasses Row Level Security — mandatory for a backend cron job.
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Global Telegram token — used for all users unless they have a per-user Vault entry.
  const globalToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? null;

  if (globalToken) {
    console.log('[scheduler] TELEGRAM_BOT_TOKEN loaded from environment.');
  } else {
    console.log('[scheduler] TELEGRAM_BOT_TOKEN not in env — will perform per-user Vault lookup.');
  }

  // ── Execute tick ──────────────────────────────────────────────────────────
  try {
    const summary = await runTick(supabase, globalToken);
    return json(summary, 200);
  } catch (fatalErr: unknown) {
    const message = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    console.error(`[scheduler] FATAL tick error: ${message}`);
    return json(
      {
        error:      'Internal Server Error — scheduling tick failed fatally.',
        details:    message,
        occurredAt: new Date().toISOString(),
      },
      500,
    );
  }
}

// ── Deno Edge Function entrypoint ─────────────────────────────────────────────
Deno.serve(handleRequest);

