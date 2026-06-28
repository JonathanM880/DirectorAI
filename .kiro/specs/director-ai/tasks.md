# Implementation Plan: DirectorAI

## Overview

This plan implements the DirectorAI full-stack content automation SaaS platform across 7 phases. Work flows from foundational infrastructure (database schema, RLS, auth) through the four design modules (Infrastructure & Security, Content Factory, Orchestration & Publishing, Data Intelligence), then the Angular frontend shell and feature views, and finally integration and end-to-end tests. Property-based tests using `fast-check` are embedded within their relevant phases.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 0,
      "label": "Foundation",
      "tasks": ["0.1"]
    },
    {
      "wave": 1,
      "label": "Infrastructure & Security",
      "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"]
    },
    {
      "wave": 2,
      "label": "Content Factory",
      "tasks": ["2.1", "2.2", "2.3"]
    },
    {
      "wave": 3,
      "label": "Orchestration & Publishing",
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"]
    },
    {
      "wave": 4,
      "label": "Data Intelligence",
      "tasks": ["4.1", "4.2", "4.3"]
    },
    {
      "wave": 5,
      "label": "Frontend Core Shell",
      "tasks": ["5.1", "5.2", "5.3", "5.4"]
    },
    {
      "wave": 6,
      "label": "Frontend Feature Views",
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"]
    },
    {
      "wave": 7,
      "label": "Integration & End-to-End Tests",
      "tasks": ["7.1", "7.2", "7.3", "7.4"]
    }
  ],
  "dependencies": {
    "1.1": ["0.1"],
    "1.2": ["1.1"],
    "1.3": ["1.1"],
    "1.4": ["1.1", "1.3"],
    "1.5": ["1.1", "1.3"],
    "2.1": ["1.3", "1.4", "1.5"],
    "2.2": ["2.1"],
    "2.3": ["2.1"],
    "3.1": ["1.1"],
    "3.2": ["3.1", "1.4"],
    "3.3": ["3.1", "1.1", "1.3"],
    "3.4": ["3.3"],
    "3.5": ["3.2", "3.3"],
    "3.6": ["3.3", "3.5"],
    "3.7": ["1.1", "1.3"],
    "4.1": ["3.3", "1.1"],
    "4.2": ["1.1", "1.3"],
    "4.3": ["1.2", "3.3", "3.5"],
    "5.1": ["0.1"],
    "5.2": ["5.1", "1.3"],
    "5.3": ["5.1"],
    "5.4": ["5.2", "5.3"],
    "6.1": ["5.4", "4.1", "4.2"],
    "6.2": ["5.4", "2.1", "2.2"],
    "6.3": ["5.4", "1.5"],
    "6.4": ["5.4", "3.3"],
    "6.5": ["5.4", "4.1"],
    "6.6": ["5.4", "3.4", "3.5"],
    "6.7": ["5.4", "3.7", "1.4"],
    "7.1": ["3.3", "3.2", "4.1", "4.2"],
    "7.2": ["3.7"],
    "7.3": ["1.2"],
    "7.4": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"]
  }
}
```


## Tasks

- [x] 0.1 Project scaffold and tooling setup
  - [x] 0.1.1 Initialise Angular 17 SPA under `frontend/` using the Angular CLI (`ng new director-ai-frontend --standalone --routing --style=scss`)
  - [x] 0.1.2 Configure TypeScript `strict` mode, `paths` aliases (`@/core`, `@/shared`, `@/features`), and `baseUrl` in both `tsconfig.json` files
  - [x] 0.1.3 Initialise Supabase project configuration (`supabase init`), link it to a hosted Supabase staging project, and add `supabase/` directory to repo; do not rely on a local database for integration validation
  - [x] 0.1.4 Install and configure `vitest` + `@vitest/coverage-v8` as the test runner for Edge Functions; add `vitest.config.ts`
  - [x] 0.1.5 Install and configure `fast-check@^3.x` for property-based testing; verify import resolves in a sample test file
  - [x] 0.1.6 Install frontend dev dependencies: `@testing-library/angular`, `jest-environment-jsdom`; wire `jest.config.ts`; do not use MSW or local mocked API layers for provider integrations
  - [x] 0.1.7 Add `eslint` + `@angular-eslint` + `prettier` configs; add lint and format scripts to `package.json`
  - [x] 0.1.8 Create `.env.example` listing all required environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`); confirm `.env` is in `.gitignore`
  - [x] 0.1.9 Create shared TypeScript type barrel `packages/types/index.ts` exporting all interfaces from the design document (`ScheduledPost`, `PublishResult`, `Asset`, `AuthResult`, etc.)


- [x] 1.1 Database schema and migrations
  -[x] 1.1.1 Create migration `001_create_users_profile.sql`: table `users_profile` with columns `id UUID PK FK auth.users`, `email TEXT`, `display_name TEXT`, `avatar_url TEXT`, `timezone TEXT NOT NULL DEFAULT 'UTC'`, `onboarding_completed BOOLEAN DEFAULT FALSE`, `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
  - [x] 1.1.2 Create migration `002_create_channels.sql`: table `channels` with columns `id UUID PK`, `user_id UUID FK users_profile.id`, `platform TEXT NOT NULL`, `name TEXT NOT NULL`, `channel_identifier TEXT NOT NULL`, `is_active BOOLEAN DEFAULT TRUE`, `created_at TIMESTAMPTZ DEFAULT now()`; add unique constraint on `(user_id, platform, channel_identifier)`
  - [x] 1.1.3 Create migration `003_create_assets.sql`: table `assets` with columns `id UUID PK`, `user_id UUID FK`, `filename TEXT`, `mime_type TEXT`, `size_bytes BIGINT`, `storage_path TEXT`, `folder TEXT DEFAULT '/'`, `tags TEXT[]`, `source TEXT CHECK IN ('user_upload','ai_generated')`, `generation_prompt TEXT`, `ai_model TEXT`, `created_at TIMESTAMPTZ DEFAULT now()`
  - [x] 1.1.4 Create migration `004_create_recurrence_rules.sql`: table `recurrence_rules` with columns `id UUID PK`, `user_id UUID FK`, `frequency TEXT CHECK IN ('daily','weekly','monthly')`, `interval INTEGER DEFAULT 1`, `days_of_week INTEGER[]`, `end_date TIMESTAMPTZ`, `max_occurrences INTEGER`, `created_at TIMESTAMPTZ DEFAULT now()`
  - [x] 1.1.5 Create migration `005_create_scheduled_posts.sql`: table `scheduled_posts` with all columns from the `ScheduledPostRecord` design model, including `status TEXT CHECK IN ('draft','scheduled','publishing','published','retrying','failed','cancelled')`, `retry_count INTEGER DEFAULT 0`, `max_retries INTEGER DEFAULT 3`, `next_retry_at TIMESTAMPTZ`, `recurrence_rule_id UUID FK recurrence_rules.id`, `parent_post_id UUID FK scheduled_posts.id`
  - [x] 1.1.6 Create migration `006_create_audit_log.sql`: table `audit_log` with columns `id UUID PK DEFAULT gen_random_uuid()`, `user_id UUID FK`, `post_id UUID`, `action TEXT`, `platform TEXT`, `platform_message_id TEXT`, `error_code TEXT`, `metadata JSONB DEFAULT '{}'`, `occurred_at TIMESTAMPTZ DEFAULT now() NOT NULL`; add `CHECK (occurred_at IS NOT NULL)`

  - [x] 1.1.8 Create migration `008_create_notifications.sql`: table `notifications` with columns `id UUID PK`, `user_id UUID FK`, `type TEXT`, `severity TEXT`, `title TEXT`, `message TEXT`, `metadata JSONB`, `read BOOLEAN DEFAULT FALSE`, `created_at TIMESTAMPTZ DEFAULT now()`
  - [x] 1.1.9 Add performance indexes: `scheduled_posts(status, scheduled_at)`, `scheduled_posts(user_id, scheduled_at)`, `audit_log(user_id, occurred_at)`, `notifications(user_id, read)`, `assets(user_id, folder)`
  - [x] 1.1.10 Run `supabase db push` against remote instance; verify all migrations apply cleanly with zero errors


- [x] 1.2 Row Level Security policies
  - [x] 1.2.1 Enable RLS on all tables: `ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY` (repeat for `channels`, `assets`, `scheduled_posts`, `audit_log`, `notifications`, `recurrence_rules`) — satisfies Req 12.1
  - [x] 1.2.2 Create SELECT/INSERT/UPDATE/DELETE policies for `users_profile` restricting access to rows where `id = auth.uid()` — satisfies Req 12.2
  - [x] 1.2.3 Create full CRUD policies for `channels`, `assets`, `scheduled_posts`, `recurrence_rules`, `notifications`: all policies restrict to `user_id = auth.uid()` — satisfies Req 12.2
  - [x] 1.2.4 Create `audit_log` policies: INSERT allowed for `service_role` only; SELECT allowed for `user_id = auth.uid()`; explicitly DENY UPDATE and DENY DELETE for all roles including `service_role` — satisfies Req 11.2
  - [x] 1.2.5 Write migration `009_rls_policies.sql` containing all policy DDL; run against remote/hosted Supabase instance
  - [x] 1.2.6 Write unit tests asserting user A cannot SELECT a row owned by user B for each protected table — satisfies Req 12.2, Req 12.3

- [x] 1.3 AuthService implementation
  - [x] 1.3.1 Create `supabase/functions/_shared/auth.service.ts` implementing the `AuthService` interface: `signUp`, `signIn`, `signInWithOAuth`, `signOut`, `resetPassword`, `getSession`, `getUser`, `onAuthStateChange`
  - [x] 1.3.2 Implement `signUp`: call `supabase.auth.signUp({ email, password })`; map response to `AuthResult`; return non-null `session` on success — satisfies Req 1.1
  - [x] 1.3.3 Implement `signIn`: call `supabase.auth.signInWithPassword`; return `AuthResult` with non-null `session` and `user` on success, non-null `error` and null `session` on credential failure — satisfies Req 1.2, Req 1.3
  - [x] 1.3.4 Implement `signInWithOAuth` for Google provider: call `supabase.auth.signInWithOAuth({ provider: 'google' })`; trigger redirect — satisfies Req 1.5
  - [x] 1.3.5 Implement `resetPassword`: call `supabase.auth.resetPasswordForEmail`; send time-limited OTP link — satisfies Req 1.4
  - [x] 1.3.6 Implement `signOut`: call `supabase.auth.signOut()`; verify `SIGNED_OUT` event is emitted — satisfies Req 1.6
  - [x] 1.3.7 Implement session auto-refresh: subscribe to `onAuthStateChange`; on `TOKEN_REFRESHED` event update local session — satisfies Req 1.7
  - [x] 1.3.8 Implement `getSession`: return active session or null — satisfies Req 1.8
  - [x] 1.3.9 Create `frontend/src/app/core/services/auth.service.ts` Angular service wrapping shared auth logic; expose `authState$` as an `Observable<Session | null>`
  - [x] 1.3.10 Write unit tests: successful sign-up returns non-null session, invalid credentials return null session + non-null error, signOut triggers SIGNED_OUT, getSession returns active session


- [x] 1.4 KeyVaultService implementation
  - [x] 1.4.1 Create `supabase/functions/_shared/key-vault.service.ts` implementing the `KeyVaultService` interface
  - [x] 1.4.2 Implement `storeKey(userId, keyName, value)`: encrypt the key value via Supabase Vault (`vault.create_secret`) with `pgcrypto` AES-256; associate with `userId` and `keyName` — satisfies Req 2.1
  - [x] 1.4.3 Implement `getKey(userId, keyName)`: callable only from Edge Functions (server-side); decrypt and return raw key value from Vault — satisfies Req 2.2
  - [x] 1.4.4 Implement `rotateKey(userId, keyName, newValue)`: update the vault secret so subsequent `getKey` calls return `newValue` — satisfies Req 2.4
  - [x] 1.4.5 Implement `deleteKey(userId, keyName)`: remove vault secret; verify `listKeyNames` no longer returns the key — satisfies Req 2.5
  - [x] 1.4.6 Implement `listKeyNames(userId)`: query vault metadata to return key names for `userId` only; never return another user's keys — satisfies Req 2.6
  - [x] 1.4.7 Implement audit logging in `storeKey`, `rotateKey`, `deleteKey`: INSERT into `audit_log` capturing `action`, `keyName`, `userId`, `occurred_at` — satisfies Req 2.7, Req 11.5
  - [x] 1.4.8 Confirm no Edge Function exposes `getKey` responses to the Angular frontend; return only key names from frontend-facing endpoints — satisfies Req 2.3
  - [x] 1.4.9 Write unit tests: `storeKey` then `getKey` returns correct value; `rotateKey` updates value; `deleteKey` removes from `listKeyNames`; `listKeyNames` is scoped to `userId`

- [x] 1.5 AssetStorageService implementation
  - [x] 1.5.1 Create `supabase/functions/_shared/asset-storage.service.ts` implementing the `AssetStorageService` interface
  - [x] 1.5.2 Implement MIME type validation in `upload`: reject unsupported types with a descriptive error — satisfies Req 3.2
  - [x] 1.5.3 Implement size-limit validation in `upload`: images ≤ 20 MB, video ≤ 200 MB, audio ≤ 50 MB, PDF ≤ 50 MB; throw `AssetTooLargeError` with `maxBytes` and `actualBytes` on violation — satisfies Req 3.3
  - [x] 1.5.4 On successful validation, upload file to Supabase Storage bucket `assets/${userId}/`; insert `AssetRecord` into `assets` table; return `Asset` with correct `mimeType`, `sizeBytes`, `userId` — satisfies Req 3.1
  - [x] 1.5.5 Implement `getSignedUrl(assetId, expiresIn = 3600)`: call Supabase Storage `createSignedUrl`; verify returned URL is non-empty and TTL ≥ `expiresIn` — satisfies Req 3.4
  - [x] 1.5.6 Implement `listAssets(userId, filter)`: query `assets` WHERE `user_id = userId`; apply filter predicates; never return another user's assets — satisfies Req 3.5, Req 3.8
  - [x] 1.5.7 Implement `deleteAsset(assetId)`: remove file from Supabase Storage and DELETE row from `assets`; verify asset absent in subsequent `listAssets` — satisfies Req 3.6
  - [x] 1.5.8 Implement `moveAsset(assetId, targetFolder)`: UPDATE `folder` column; return updated `Asset` — satisfies Req 3.7
  - [x] 1.5.9 Write `AssetTooLargeError` and `UnsupportedMimeTypeError` classes with appropriate fields
  - [x] 1.5.10 Write unit tests: supported upload succeeds, unsupported MIME rejected, oversized image rejected, signed URL non-empty, `listAssets` scoped to `userId`, `deleteAsset` removes from list


- [x] 2.1 GenAIService core generation
  - [x] 2.1.1 Create `supabase/functions/_shared/gen-ai.service.ts` implementing the `GenAIService` interface
  - [x] 2.1.4 Implement OpenRouter call in `generateCopy`: build system prompt from `platform` + `tone`; call `openRouterClient.chatCompletions`; map response to `GeneratedCopy` with non-empty `content`, valid `platform`, and positive `tokensUsed` — satisfies Req 4.1
  - [x] 2.1.5 After successful generation, persist content as an `Asset` record with `source = 'ai_generated'` — satisfies Req 4.8
  - [x] 2.1.6 Implement `generateImage(request)`: call OpenRouter image generation endpoint; return `GeneratedImage` with non-empty `url` and original `prompt` preserved — satisfies Req 4.2
  - [x] 2.1.7 Implement `brainstorm(request)`: call OpenRouter with `count = N`; parse response into exactly `N` content ideas; return `BrainstormResult` — satisfies Req 4.3
  - [x] 2.1.9 Write tests: direct OpenRouter integration tests verify successful generation, returned structure, and asset persistence with `ai_generated` source

- [x] 2.2 GenAIService streaming and regeneration
  - [x] 2.2.1 Implement `streamGenerate(request, onChunk)`: open a streaming request to OpenRouter; invoke `onChunk` callback at least once per SSE token chunk with a non-empty string — satisfies Req 4.6
  - [x] 2.2.3 Implement `regenerate(assetId, instructions?)`: load original asset from `AssetStorageService`; construct a new `CopyRequest` with optional instruction modifications; call `generateCopy` and return the new `GeneratedAsset` — satisfies Req 4.7
  - [x] 2.2.4 Write unit tests: `streamGenerate` calls `onChunk` at least once with non-empty string; `regenerate` returns a new asset distinct from the original



- [x] 3.1 SocialMediaPublisher interface and publisher registry
  - [x] 3.1.1 Create `supabase/functions/_shared/publisher/social-media-publisher.interface.ts` declaring the `SocialMediaPublisher` interface with methods: `publish`, `delete`, `edit`, `getCapabilities`, `validatePost` — satisfies Req 5.1
  - [x] 3.1.2 Create `PublisherRegistry` class with `register(platform, publisher)` and `get(platform)` methods; ensure `SchedulingEngine` only interacts with `SocialMediaPublisher` interface, never concrete classes — satisfies Property 6
  - [x] 3.1.3 Implement the `validatePost(post)` happy path: if `post.content.text` length ≤ `capabilities.maxTextLength` and `mediaType` is supported, return `{ valid: true, errors: [] }` — satisfies Req 5.2
  - [x] 3.1.4 Implement the violation path of `validatePost`: if any constraint is violated, return `{ valid: false, errors: [descriptive message] }` — satisfies Req 5.3
  - [x] 3.1.5 Implement the duplicate-publish guard: if `publish` is called on a post where `post.status === 'published'`, return `PublishResult` with `error.code === 'CONTENT_REJECTED'` without calling any platform API — satisfies Req 5.7
  - [x] 3.1.6 Write unit tests: valid post returns `valid = true`; text-too-long returns `valid = false` with message; unsupported media returns `valid = false`; already-published post triggers `CONTENT_REJECTED`


- [x] 3.2 TelegramPublisher implementation
  - [x] 3.2.1 Create `supabase/functions/_shared/publisher/telegram.publisher.ts` implementing `SocialMediaPublisher` with `platform = 'telegram'`
  - [x] 3.2.2 Implement `getCapabilities()`: return `PlatformCapabilities` with `maxTextLength: 4096`, `supportsImages: true`, `supportsVideo: true`, `supportsAudio: true`, `supportsPDFs: true`, `supportsCarousel: false`, `supportsScheduledEdit: false` — satisfies Req 5.8
  - [x] 3.2.3 Implement `publish(post, channel)`: extract `telegram_bot_token` from `channel.credentials`; build `TelegramSendPayload` via private `buildPayload(post)`; make exactly one HTTP call to Telegram Bot API; return `PublishResult` with `success: true` and non-empty `platformMessageId` on success — satisfies Req 5.4
  - [x] 3.2.4 Implement error mapping in `mapApiError(error)`: HTTP 5xx or network timeout → `{ code: 'NETWORK_ERROR', retryable: true }`; HTTP 401 → `{ code: 'INVALID_TOKEN', retryable: false }` — satisfies Req 5.5, Req 5.6
  - [x] 3.2.5 Implement `buildPayload(post)`: select `sendMessage`, `sendPhoto`, `sendVideo`, `sendAudio`, or `sendDocument` based on `post.content.mediaType`; apply Telegram Markdown formatting
  - [x] 3.2.6 Implement `delete` and `edit` via Telegram `deleteMessage` / `editMessageText` API endpoints
  - [x] 3.2.7 Write tests: pure unit tests cover payload construction, error mapping helpers, and `getCapabilities`; direct Telegram Bot API integration tests against a private test channel verify success returns `platformMessageId`, invalid token maps to non-retryable 401, and retryable provider/network failures are handled correctly

- [x] 3.3 SchedulingEngine core implementation
  - [x] 3.3.1 Create `supabase/functions/scheduler/index.ts` as the cron Edge Function entry point; wire to `SchedulingEngine.tick()`
  - [x] 3.3.2 Implement `schedulePost(request)`: validate `request.scheduledAt > now()` — reject with validation error if in past (satisfies Req 6.2); validate `channelId` belongs to `userId`; persist `ScheduledPost` with `status = 'scheduled'`; assert `post.scheduledAt > post.createdAt` — satisfies Req 6.1, Req 6.4
  - [x] 3.3.3 Implement `tick()` per Algorithm 1 in the design: query `scheduled_posts WHERE status='scheduled' AND scheduled_at <= now()` using `FOR UPDATE SKIP LOCKED` (satisfies Req 6.12); set status to `'publishing'` before dispatching (satisfies Req 13.3); call `validatePost` before `publisher.publish` (satisfies Req 6.7); build and return `DispatchSummary` asserting `processed === succeeded + failed + retryQueued` — satisfies Req 6.6
  - [x] 3.3.4 Implement stale `publishing` post cleanup at start of `tick()`: reset any post stuck in `status = 'publishing'` for more than 5 minutes back to `status = 'scheduled'` — satisfies Req 13.4
  - [x] 3.3.5 Implement `cancelPost(postId)`: validate `post.status === 'scheduled'`; update to `status = 'cancelled'` — satisfies Req 6.8
  - [x] 3.3.6 Implement `reschedulePost(postId, newScheduledAt)`: validate `newScheduledAt > now()`; update `scheduledAt`; return updated `ScheduledPost` — satisfies Req 6.9
  - [x] 3.3.7 Implement `getUpcomingPosts(userId, from, to)`: query `scheduled_posts` for `userId` with `scheduledAt BETWEEN from AND to` and `status = 'scheduled'`; enforce no cross-user leakage — satisfies Req 6.11, Req 12.4
  - [x] 3.3.8 Implement post lifecycle status transition guard: once `status = 'published'` or `'failed'`, reject any further status update — satisfies Req 13.1, Req 13.2
  - [x] 3.3.9 Write unit tests: `schedulePost` in past rejected; `schedulePost` future creates record; `tick` dispatches due posts and returns correct summary; `cancelPost` changes status; `getUpcomingPosts` scoped to `userId`; stale publishing posts reset to scheduled


- [x] 3.4 SchedulingEngine recurrence support
  - [x] 3.4.1 Implement `RecurrenceService.scheduleNext(post)`: compute next `scheduledAt` from `RecurrenceRule` (daily/weekly/monthly + interval + daysOfWeek); respect `endDate` and `maxOccurrences` — satisfies Req 6.10
  - [x] 3.4.2 Wire `scheduleNext` into `tick()`: after a recurring post publishes successfully, call `scheduleNext` and INSERT the next instance with correct `scheduledAt` and `parentPostId` — satisfies Req 6.10
  - [x] 3.4.3 Validate recurrence rule at `schedulePost` time: if `endDate` is provided, verify `endDate > scheduledAt`
  - [x] 3.4.4 Write unit tests: daily recurrence computes correct next date; weekly recurrence skips to correct day-of-week; monthly recurrence handles month-boundary dates; `maxOccurrences` stops creating instances after limit

- [x] 3.5 RetryEngine implementation
  - [x] 3.5.1 Create `supabase/functions/_shared/retry-engine.ts` implementing the `RetryEngine` interface
  - [x] 3.5.2 Implement `enqueue(post, error)`: if `error.retryable === true` AND `post.retryCount < post.maxRetries`, update post to `status = 'retrying'`, increment `retryCount`, compute `next_retry_at` using the backoff formula — satisfies Req 7.1
  - [x] 3.5.3 Handle exhaustion in `enqueue`: if `error.retryable === false` OR `post.retryCount >= post.maxRetries`, update post to `status = 'failed'` and call `alertService.notify(userId, 'retry_exhausted')` — satisfies Req 7.2
  - [x] 3.5.4 Implement exponential backoff formula: `delay = MIN(1000 * (2 ^ retryCount), 300000)` plus up to 10% random jitter; set `next_retry_at = now + delay + jitter` — satisfies Req 7.3
  - [x] 3.5.5 Implement `processQueue()` per Algorithm 2 in the design: query `WHERE status='retrying' AND next_retry_at <= now()` with `FOR UPDATE SKIP LOCKED`; re-dispatch via publisher; on success update to `published` and insert audit log; on failure re-enqueue or exhaust — satisfies Req 7.7, Req 7.8
  - [x] 3.5.6 Enforce `retryCount` never exceeds `maxRetries`: add a guard assertion before every `retryCount` increment — satisfies Req 7.5
  - [x] 3.5.7 Enforce `retryCount` never decreases: add a guard verifying new value ≥ current value before any write — satisfies Req 7.6
  - [x] 3.5.8 Write unit tests: retryable error enqueues with incremented count; non-retryable error moves to failed; exhausted retries moves to failed with alert; successful retry sets status to published with audit entry


- [x] 3.6 Property-based tests for retry engine and scheduling
  - [x] 3.6.1 Write property test for Retry Count Monotonicity (Property 2): for any arbitrary sequence of `enqueue` operations on a post, `retryCount` is non-decreasing across the sequence — **Validates: Requirement 7.6**
  - [x] 3.6.2 Write property test for Max Retries Bound (Property 3): for arbitrary `maxRetries` in range [1, 10] and arbitrary sequence of failures up to length 20, `retryCount` never exceeds `maxRetries` — **Validates: Requirement 7.5**
  - [x] 3.6.3 Write property test for Backoff Strictly Increasing (Property 10): for arbitrary `retryCount` values n in [0, 9], assert `delay(n+1) >= delay(n) * 0.9` allowing for up to 10% jitter overlap — **Validates: Requirement 7.3, Requirement 7.4**
  - [x] 3.6.4 Write property test for Scheduled Time Invariant (Property 8): for arbitrary future `scheduledAt` timestamps passed to `schedulePost`, assert the returned post always satisfies `post.scheduledAt > post.createdAt` — **Validates: Requirement 6.4**
  - [x] 3.6.5 Write property test for Publishing Idempotency (Property 1): for any `ScheduledPost` with `status === 'published'`, calling `publisher.publish(post, channel)` always returns `error.code === 'CONTENT_REJECTED'` — **Validates: Requirement 5.7**




- [x] 4.1 MetricsService implementation
  - [x] 4.1.1 Create `supabase/functions/_shared/metrics.service.ts` implementing the `MetricsService` interface
  - [x] 4.1.2 Create migration `010_create_post_metrics.sql`: table `post_metrics` with `post_id UUID FK`, `platform_message_id TEXT`, `views INTEGER DEFAULT 0`, `reactions JSONB DEFAULT '{}'`, `forwards INTEGER DEFAULT 0`, `replies INTEGER DEFAULT 0`, `measured_at TIMESTAMPTZ DEFAULT now()` (note: created as 014_create_post_metrics.sql due to versioning)
  - [x] 4.1.3 Implement `ingestMetrics(platformMessageId, metrics)`: lookup `scheduled_posts` by `platformMessageId`; persist raw metrics to `post_metrics`; associate with `postId` — satisfies Req 8.1
  - [x] 4.1.4 Implement `getPostMetrics(postId)`: query `post_metrics`; return `PostMetrics` with `views`, `reactions`, `forwards`, `replies` — satisfies Req 8.2
  - [x] 4.1.5 Implement `getChannelSummary(channelId, dateRange)`: aggregate across all posts for channel in date range; compute `totalPosts`, `totalViews`, `avgEngagementRate`, `topPost` — satisfies Req 8.3
  - [x] 4.1.6 Implement `getDashboardMetrics(userId)`: compute `totalPostsPublished`, `postsThisWeek`, `avgViewsPerPost`, `failureRate`, `upcomingPostsCount`, `recentActivity` — satisfies Req 8.4
  - [x] 4.1.7 Implement `getEngagementTrend(channelId, granularity)`: generate time-series for last 30 days / 12 weeks / 12 months; fill gaps with `value = 0`; return sorted ascending by `date` — satisfies Req 8.5, Req 8.6
  - [x] 4.1.8 Enforce `TrendPoint.value >= 0` for all returned trend points — satisfies Req 8.7
  - [x] 4.1.9 Create Telegram metrics polling cron (`supabase/functions/metrics-poller/index.ts`): call Telegram `getUpdates`; extract views and reactions; call `ingestMetrics` for recent published posts
  - [x] 4.1.10 Write unit tests: `ingestMetrics` persists and associates correctly; `getEngagementTrend` returns correct length for each granularity; gaps filled with zero; values non-negative

- [x] 4.2 AlertService implementation
  - [x] 4.2.1 Create `supabase/functions/_shared/alert.service.ts` implementing the `AlertService` interface
  - [x] 4.2.2 Implement `notify(userId, alertEvent)`: INSERT a `Notification` record into `notifications`; verify retrievable via `getNotifications(userId)` — satisfies Req 9.1
  - [x] 4.2.3 Implement `getNotifications(userId, unreadOnly?)`: query `notifications WHERE user_id = userId`; if `unreadOnly = true`, filter by `read = false` — satisfies Req 9.1
  - [x] 4.2.4 Implement `markAsRead(notificationId)`: UPDATE `read = true`; verify notification no longer appears in `getNotifications(userId, true)` — satisfies Req 9.5
  - [x] 4.2.5 Implement `markAllAsRead(userId)`: UPDATE all notifications for user to `read = true`; verify `getNotifications(userId, true)` returns empty array — satisfies Req 9.6
  - [x] 4.2.6 Implement `subscribeToRealtime(userId, callback)`: open Supabase Realtime channel filtered to `notifications WHERE user_id = userId`; invoke `callback` on INSERT events — satisfies Req 9.7
  - [x] 4.2.7 Wire `post_published` alert in `SchedulingEngine.tick()` on successful publish — satisfies Req 9.2
  - [x] 4.2.8 Wire `retry_exhausted` alert in `RetryEngine` when retries are exhausted — satisfies Req 9.3
  - [x] 4.2.9 Wire `post_retrying` alert in `RetryEngine.enqueue()` when a post enters retrying state — satisfies Req 9.4

  - [x] 4.2.11 Write unit tests: `notify` persists and is retrievable; `markAsRead` removes from unread list; `markAllAsRead` empties unread list


- [x] 4.3 Audit log enforcement and immutability
  - [x] 4.3.1 Verify RLS policy from 1.2.4 blocks UPDATE and DELETE on `audit_log` for all roles; write integration test attempting UPDATE via `service_role` and asserting rejection — satisfies Req 11.2
  - [x] 4.3.2 Confirm `occurred_at` server-side default prevents client override; add trigger or CHECK constraint to migration `006` if needed — satisfies Req 11.3
  - [x] 4.3.3 Verify `audit_log` SELECT RLS policy restricts results to `user_id = auth.uid()` — satisfies Req 11.4
  - [ ] 4.3.4 Confirm every publish attempt (success, failure, retry) inserts audit record with `userId`, `postId`, `action`, `platform`, `platformMessageId`, `errorCode`, `occurredAt` — satisfies Req 11.1
  - [x] 4.3.5 Write integration test: INSERT audit record; attempt DELETE → rejected; attempt UPDATE → rejected; SELECT from different user → empty result

- [x] 5.1 Angular project setup and routing
  - [x] 5.1.1 Confirm Angular 17 SPA initialised from 0.1.1; configure `app.config.ts` with `provideRouter`, `provideHttpClient`, and Supabase client provider
  - [x] 5.1.2 Define lazy-loaded route modules: `AuthModule` (`/auth`), `DashboardModule` (`/dashboard`), `StudioModule` (`/studio`), `AssetsModule` (`/assets`), `CalendarModule` (`/calendar`), `MetricsModule` (`/metrics`), `AutomationModule` (`/automation`), `SettingsModule` (`/settings`) — satisfies Req 15.1
  - [x] 5.1.3 Implement `AuthGuard`: redirect unauthenticated users to `/auth/login` when navigating to any protected route — satisfies Req 15.2
  - [x] 5.1.5 Register `AuthGuard` on all authenticated routes
  - [x] 5.1.6 Write unit tests: unauthenticated navigation to `/dashboard` redirects to `/auth/login`


- [x] 5.2 Auth views and guards
  - [x] 5.2.1 Create `AuthModule` with sub-routes: `/auth/login`, `/auth/register`, `/auth/recover`
  - [x] 5.2.2 Implement `LoginComponent`: email + password form; call `AuthService.signIn`; navigate to `/dashboard` on success; display field-level error messages using active voice on failure
  - [x] 5.2.3 Implement `RegisterComponent`: email + password form with confirmation; call `AuthService.signUp`; display success message directing user to verify email
  - [x] 5.2.4 Implement `RecoverComponent`: email input; call `AuthService.resetPassword`; display confirmation message
  - [x] 5.2.5 Add "Sign in with Google" button to `LoginComponent`; call `AuthService.signInWithOAuth('google')` — satisfies Req 1.5
  - [x] 5.2.6 Style all auth views: ink background, centered card, high-contrast labels, visible focus rings, no sidebar

- [x] 5.3 Design system and tokens
  - [x] 5.3.1 Define CSS custom properties in `src/styles/tokens.scss`: `--color-ink (#0D0F12)`, `--color-paper (#F5F4F0)`, `--color-signal (#E8C24A)`, `--color-live (#3EC88A)`, `--color-fault (#D94F3D)`, `--color-steel (#2A2D35)`
  - [x] 5.3.2 Configure typography: `Druk Wide` / `Aktiv Grotesk Condensed` for display headings (uppercase sparingly), `Inter` for body copy, `JetBrains Mono` for data and utility text
  - [x] 5.3.3 Implement 8px spacing grid utility classes; establish generous margin defaults for section spacing
  - [x] 5.3.4 Define page transition animation: horizontal slide 150ms ease-out; chart mount animation 300ms stagger
  - [x] 5.3.5 Create shared `StatusBadgeComponent` mapping `PostStatus` to design-token colors: `'published'` → `--color-live`, `'scheduled'` → `--color-signal`, `'failed'` → `--color-fault`
- [x] 5.4 Global shell
  - [x] 5.4.1 Create `AppShellComponent` as authenticated layout wrapper: left sidebar navigation, main content `<router-outlet>`
  - [x] 5.4.2 Implement sidebar navigation links for all 7 authenticated routes; highlight active route; show plan tier badge
  - [x] 5.4.3 Implement `NotificationBellComponent`: subscribe to `AlertService.subscribeToRealtime`; badge shows unread count; dropdown lists recent notifications with `markAsRead` action


- [ ] 6.1 Dashboard view (`/dashboard`)
  - [~] 6.1.1 Implement `DashboardComponent`: call `MetricsService.getDashboardMetrics(userId)` on init; display KPI row with `totalPostsPublished`, `avgViewsPerPost`, active channels count, and `failureRate`
  - [~] 6.1.2 Implement Recent Activity feed: fetch last 10 `audit_log` entries; display as list with action, platform icon, timestamp
  - [~] 6.1.3 Implement Mini Editorial Calendar widget: 3-day lookahead using `SchedulingEngine.getUpcomingPosts`; show post blocks with status color coding
  - [~] 6.1.4 Implement system health indicators: last scheduler execution time; API connectivity status for Telegram and OpenRouter

- [x] 6.2 AI Studio view (`/studio`)
  - [x] 6.2.1 Create `StudioComponent` with split-pane layout: left panel = prompt input, platform selector, tone selector, max length slider; right panel = generated output area
  - [x] 6.2.2 Implement streaming output: call `GenAIService.streamGenerate`; render each `onChunk` token progressively in the output panel — satisfies Req 15.6
  - [x] 6.2.3 Implement "Save to Assets" CTA: call `AssetStorageService.upload` with `source = 'ai_generated'`; display success toast
  - [x] 6.2.4 Implement "Schedule Now" CTA: open scheduling modal pre-filled with generated content; call `SchedulingEngine.schedulePost`
  - [x] 6.2.5 Implement Brainstorm mode: call `GenAIService.brainstorm`; render N idea cards; each expandable to full copy with "Use This" action
  - [x] 6.2.6 Implement Image Generation tab: prompt input and aspect ratio selector; call `GenAIService.generateImage`; display result image
  - [x] 6.2.7 Implement Usage Meter component: display `aiGenerationsThisMonth / aiGenerationsLimit` as a progress bar in the top-right corner — satisfies Req 15.5

- [x] 6.3 Asset Repository view (`/assets`)
  - [x] 6.3.1 Create `AssetsComponent` with file-manager layout: left sidebar with folder/tag filters; right area with grid/list toggle — satisfies Req 15.7
  - [x] 6.3.2 Implement drag-and-drop upload zone using `@angular/cdk/drag-drop`; on drop call `AssetStorageService.upload`; show upload progress — satisfies Req 15.7
  - [x] 6.3.3 Implement asset cards: thumbnail preview, filename, source badge (AI/Upload), creation date; grid and list display modes
  - [x] 6.3.4 Implement multi-select: checkbox selection; bulk action toolbar with Delete and Move buttons — satisfies Req 15.7
  - [x] 6.3.5 Implement preview modal: full-size preview with signed URL; download button
  - [x] 6.3.6 Implement folder navigation and tag filtering calling `AssetStorageService.listAssets(userId, filter)`


- [x] 6.4 Editorial Calendar view (`/calendar`)
  - [x] 6.4.1 Integrate `@fullcalendar/angular` with monthly and weekly view modes; load posts from `SchedulingEngine.getUpcomingPosts` — satisfies Req 14.1
  - [x] 6.4.2 Implement drag-and-drop rescheduling: on drop call `SchedulingEngine.reschedulePost(postId, newScheduledAt)`; update calendar; display validation error if `newScheduledAt <= now()` — satisfies Req 14.2, Req 14.3
  - [x] 6.4.3 Implement post click → side drawer: show `status`, `content` preview, `scheduledAt`, action buttons (Edit, Cancel, View Metrics) — satisfies Req 14.4
  - [x] 6.4.4 Apply status-based color coding to post blocks using design token colors: `--color-live`, `--color-signal`, `--color-fault` — satisfies Req 14.5
  - [x] 6.4.5 Implement "New Post" inline creation form with content input, channel selector, date/time picker, and optional recurrence rule configurator

- [x] 6.5 Platform Metrics view (`/metrics`)
  - [x] 6.5.1 Create `MetricsComponent` with platform tabs (Telegram) and per-channel dropdown calling `MetricsService.getChannelSummary`
  - [x] 6.5.2 Implement Views Trend line chart using `chart.js` / `ng2-charts`; data from `MetricsService.getEngagementTrend(channelId, 'day')`
  - [x] 6.5.3 Implement Engagement Rate bar chart; data from `getEngagementTrend(channelId, 'week')`
  - [x] 6.5.4 Implement Top Posts table sorted by views descending; data from `getChannelSummary`
  - [x] 6.5.5 Implement date range picker with presets: last 7 days, 30 days, 90 days, and custom range — satisfies Req 15.8
  - [x] 6.5.6 Implement CSV export button: serialize current channel metrics to CSV and trigger browser download

- [x] 6.6 Automation Hub view (`/automation`)
  - [x] 6.6.1 Create `AutomationComponent` with four sections: Recurrence Rules, Retry Rules, Activity Log, Failed Posts
  - [x] 6.6.2 Implement Recurrence Rules manager: list active rules with frequency and next run time; enable/disable toggle; inline edit frequency
  - [x] 6.6.3 Implement Retry Rules configuration: per-channel max retries input; backoff delay preview display
  - [x] 6.6.4 Implement Activity Log: paginated table of `audit_log` entries with filters for status, date range, and platform
  - [x] 6.6.5 Implement Failed Posts panel: list posts with `status = 'failed'`; inline "Re-publish" action calling `SchedulingEngine.reschedulePost`

- [ ] 6.7 Settings view (`/settings`)
  - [~] 6.7.1 Create `SettingsComponent` with three sub-sections: Profile, API Keys, Channels
  - [~] 6.7.2 Implement Profile section: display name field, timezone picker, avatar upload
  - [~] 6.7.3 Implement API Keys section: masked display of stored key names (no raw values shown); "Update" button calls `KeyVaultService.rotateKey` — satisfies Req 2.3, Req 2.4
  - [~] 6.7.4 Implement Channels section: list connected channels with add/remove; `channelIdentifier` input validated per platform format rules


- [x] 7.1 Full publish flow integration tests
  - [x] 7.1.1 Set up hosted Supabase staging instance plus a real Telegram bot connected to a private test channel; no local DB, MSW, or mocked Telegram server is permitted
  - [x] 7.1.2 Write integration test: create user → schedule post → run `tick()` → assert the real Telegram test channel received `sendMessage` → assert Supabase staging `status = 'published'` → assert `audit_log` record inserted — satisfies Req 11.1
  - [x] 7.1.3 Write integration test using real provider/test credentials: invalid Telegram token path enters `failed`; retryable provider/network failure path enters `retrying`; successful retry publishes to the real Telegram test channel — validates full retry flow
  - [x] 7.1.4 Write integration test: verify `post_published` notification created for post owner after successful publish — satisfies Req 9.2
  - [x] 7.1.5 Write integration test: recurring post published → next instance created with `scheduledAt = original + interval` — satisfies Req 6.10



- [x] 7.3 RLS enforcement integration tests
  - [x] 7.3.1 Write test: user A creates an asset; user B calls `listAssets` → result must not contain user A's asset — satisfies Req 12.3
  - [x] 7.3.2 Write test: user A schedules a post; user B calls `getUpcomingPosts` → result must not contain user A's post — satisfies Req 12.4
  - [x] 7.3.3 Write test: attempt to UPDATE an `audit_log` row as `service_role` → operation rejected — satisfies Req 11.2
  - [x] 7.3.4 Write test: unauthenticated request to any Edge Function endpoint → returns HTTP 401 before processing body — satisfies Req 12.5

- [ ] 7.4 End-to-end smoke tests
  - [~] 7.4.1 Set up Playwright E2E runner in `frontend/e2e/`; configure base URL for local dev server
  - [~] 7.4.2 Write E2E test: new user registers → completes onboarding → navigates to `/studio` → generates copy → schedules post → sees post on `/calendar`
  - [~] 7.4.3 Write E2E test: navigate to `/dashboard` without session → confirm redirect to `/auth/login` → sign in → confirm navigation to `/dashboard` — satisfies Req 15.2
  - [~] 7.4.4 Write E2E test: drag a calendar post to a new future slot → confirm reschedule succeeds; drag to a past slot → confirm validation error displayed — satisfies Req 14.2, Req 14.3



## Notes

- **Property-based testing** uses `fast-check@^3.x`. PBT task is 3.6. Each sub-task is annotated with the requirement it validates.
- **Testing framework split**: Edge Functions (Supabase) use `vitest`; Angular frontend uses `jest` + `@testing-library/angular`; integration tests use `vitest` against remote/hosted provider resources only: Supabase staging, OpenRouter, Telegram test channel, and Google Calendar test account. No local databases, in-memory databases, mocked API servers, MSW handlers, or simulated third-party responses are allowed for integration behavior.
- **Correctness properties** from the design document are covered as follows: P1 (idempotency) → 3.6.5; P2 (retry monotonicity) → 3.6.1; P3 (max retries bound) → 3.6.2; P4 (status terminal integrity) → 3.3.8; P5 (audit log immutability) → 4.3.1; P6 (platform-agnostic scheduler) → 3.1.2; P8 (scheduled time invariant) → 3.6.4; P9 (asset isolation) → 7.3.1; P10 (backoff increasing) → 3.6.3.
- **Security**: tasks 1.2, 1.4 cover RLS and key vault respectively (Req 12). All secrets must remain in Supabase project secrets, never in source-controlled files (Req 12.8).
- **Parallel work streams**: once Phase 1 is complete, Phases 2, 3, and 5 can progress in parallel on separate branches. Phase 4 depends only on 3.3 being stable. Phase 6 depends on Phase 5 shell and individual backend services being ready.
- **Cron schedules**: `scheduler` Edge Function runs every 1 minute; `metrics-poller` runs every 15 minutes. Both are configured in `supabase/functions/` Edge Function schedule configuration.
