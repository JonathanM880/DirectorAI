# Requirements Document

## Introduction

DirectorAI is a full-stack content automation SaaS platform that enables business owners to autonomously generate, schedule, and publish marketing content to social media channels — starting with Telegram — through an AI-powered production pipeline. The system integrates an Angular frontend with a Supabase backend, OpenRouter for AI text and image generation, Stripe for subscription billing, and Google Calendar for scheduling context. The platform is organized into four functional modules: Infrastructure & Security, Content Factory, Orchestration & Publishing, and Data Intelligence.

This document derives requirements from the approved design document, capturing all functional, behavioral, and security obligations that the system must satisfy.

---

## Glossary

- **AuthService**: The service responsible for all authentication operations, wrapping Supabase Auth.
- **KeyVaultService**: The service that encrypts and stores user-supplied API keys (Telegram bot token, etc.) in Supabase Vault; raw values are never sent to the frontend.
- **AssetStorageService**: The service that manages upload, retrieval, and lifecycle of all media assets via Supabase Storage.
- **GenAIService**: The Generative AI Orchestrator that routes generation requests to OpenRouter and persists generated assets.
- **SocialMediaPublisher**: The platform-agnostic interface that all social platform implementations must implement. The SchedulingEngine always calls this interface, never a platform API directly.
- **TelegramPublisher**: The concrete implementation of SocialMediaPublisher for the Telegram Bot API.
- **SchedulingEngine**: The cron-driven service that polls for due scheduled posts and dispatches them through the SocialMediaPublisher interface.
- **RetryEngine**: The service that manages exponential-backoff retry queues for failed publish attempts.
- **MetricsService**: The service that ingests, stores, and aggregates platform engagement metrics.
- **AlertService**: The service that delivers in-app and realtime notifications about publish events and billing changes.
- **BillingService**: The service that manages Stripe subscription lifecycle and feature-gate enforcement.
- **ScheduledPost**: A database record representing a piece of content queued for publication at a specific time.
- **Channel**: A user-configured social media destination (e.g., a Telegram channel) linked to a platform.
- **Asset**: A media file (image, video, audio, PDF, or AI-generated text) managed by AssetStorageService.
- **AuditLog**: The immutable, append-only record of all publish and moderation events.
- **PlanId**: One of `starter`, `professional`, or `agency` — the three subscription tiers.
- **Feature**: A gated platform capability: `ai_generation`, `asset_storage`, `scheduled_posts`, `recurrence_rules`, `analytics`, `multiple_channels`.
- **PostStatus**: The lifecycle state of a ScheduledPost: `draft`, `scheduled`, `publishing`, `published`, `retrying`, `failed`, `cancelled`.
- **PublishError**: A structured error returned by a SocialMediaPublisher, containing an error code, message, and `retryable` flag.
- **RecurrenceRule**: A rule governing how a ScheduledPost repeats (daily, weekly, monthly).
- **RLS**: Row Level Security — Supabase/PostgreSQL policy layer that restricts data access by `auth.uid()`.
- **OpenRouter**: The AI inference gateway used for text and image generation via an OpenAI-compatible REST API.

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a business owner, I want to create an account and sign in securely, so that I can access my private content, channels, and billing information.

#### Acceptance Criteria

1. WHEN a user submits a valid email address and password to the sign-up endpoint, THE AuthService SHALL create a new user account and return an AuthResult containing a non-null Session.
2. WHEN a user submits valid credentials to the sign-in endpoint, THE AuthService SHALL return an AuthResult containing a non-null Session and non-null User.
3. IF a user submits an unrecognized email or incorrect password, THEN THE AuthService SHALL return an AuthResult where `error` is non-null and `session` is null.
4. WHEN a user requests a password reset with a registered email address, THE AuthService SHALL send a time-limited OTP link to that address.
5. WHEN a user signs in with the Google OAuth provider, THE AuthService SHALL initiate the OAuth2 flow and redirect the user upon successful authorization.
6. WHEN a user calls `signOut()`, THE AuthService SHALL invalidate the current session and emit a `SIGNED_OUT` auth state change event.
7. WHILE a valid session is active, THE AuthService SHALL automatically refresh the JWT before expiry and emit a `TOKEN_REFRESHED` auth state change event.
8. WHEN `getSession()` is called for an authenticated user, THE AuthService SHALL return the active Session object.

---

### Requirement 2: API Key Management

**User Story:** As a business owner, I want to securely store my Telegram bot token and other API credentials, so that the platform can publish on my behalf without exposing secrets to the frontend.

#### Acceptance Criteria

1. WHEN a user stores a key via `storeKey(userId, keyName, value)`, THE KeyVaultService SHALL encrypt and persist the key value using Supabase Vault (pgcrypto AES-256).
2. WHEN `getKey(userId, keyName)` is called from a server-side Edge Function, THE KeyVaultService SHALL return the decrypted key value.
3. THE KeyVaultService SHALL never return raw key values in any response accessible to the Angular frontend.
4. WHEN a user calls `rotateKey(userId, keyName, newValue)`, THE KeyVaultService SHALL replace the stored encrypted value so that subsequent `getKey` calls return `newValue`.
5. WHEN a user calls `deleteKey(userId, keyName)`, THE KeyVaultService SHALL remove the key so that `listKeyNames` no longer includes `keyName` for that user.
6. WHEN `listKeyNames(userId)` is called, THE KeyVaultService SHALL return only the key names belonging to `userId`, never another user's key names.
7. THE KeyVaultService SHALL record an audit entry for every `storeKey`, `rotateKey`, and `deleteKey` operation.

---

### Requirement 3: Asset Management

**User Story:** As a business owner, I want to upload, organize, and retrieve media assets, so that I can attach images, video, and documents to my scheduled posts.

#### Acceptance Criteria

1. WHEN a user uploads a file with a supported MIME type, THE AssetStorageService SHALL store the file in Supabase Storage and return an Asset record containing the correct `mimeType`, `sizeBytes`, and `userId`.
2. IF a user uploads a file whose `mimeType` is not in the list of supported types, THEN THE AssetStorageService SHALL reject the upload with a descriptive error.
3. IF a user uploads an image exceeding 20 MB, a video exceeding 200 MB, an audio file exceeding 50 MB, or a PDF exceeding 50 MB, THEN THE AssetStorageService SHALL reject the upload with an `AssetTooLargeError` containing `maxBytes` and `actualBytes`.
4. WHEN `getSignedUrl(assetId)` is called, THE AssetStorageService SHALL return a non-empty signed URL string valid for at least the specified `expiresIn` duration (default 1 hour).
5. WHEN `listAssets(userId, filter)` is called, THE AssetStorageService SHALL return only assets where `asset.userId === userId` and all specified filter criteria are satisfied.
6. WHEN `deleteAsset(assetId)` is called, THE AssetStorageService SHALL remove the asset from storage so that it no longer appears in subsequent `listAssets` calls.
7. WHEN `moveAsset(assetId, targetFolder)` is called, THE AssetStorageService SHALL update the asset's `folder` field and return the updated Asset record.
8. THE AssetStorageService SHALL enforce that `listAssets(userA)` never returns any asset where `asset.userId !== userA.id`, regardless of application-layer state.

---

### Requirement 4: AI Content Generation

**User Story:** As a content creator, I want to generate marketing copy and images using AI, so that I can produce platform-optimized content quickly without writing from scratch.

#### Acceptance Criteria

1. WHEN a user with an active subscription submits a non-empty prompt and a valid `SocialPlatform` to `generateCopy()`, THE GenAIService SHALL return a `GeneratedCopy` object with non-empty `content`, a valid `platform`, and a positive `tokensUsed` value.
2. WHEN a user submits a prompt to `generateImage()`, THE GenAIService SHALL return a `GeneratedImage` object with a non-empty `url` and the original `prompt` preserved.
3. WHEN `brainstorm()` is called with `count = N`, THE GenAIService SHALL return a `BrainstormResult` containing exactly `N` content ideas for the specified platform.
4. IF a user's `aiGenerationsThisMonth` is greater than or equal to `aiGenerationsLimit`, THEN THE GenAIService SHALL throw a `QuotaExceededError` without making any call to the OpenRouter API.
5. IF `checkFeatureAccess(userId, 'ai_generation')` returns `false`, THEN THE GenAIService SHALL throw a `FeatureGatedError` without making any call to the OpenRouter API.
6. WHEN `streamGenerate()` is called with a valid `CopyRequest`, THE GenAIService SHALL invoke the `onChunk` callback at least once with non-empty string chunks as the response streams.
7. WHEN `regenerate(assetId)` is called, THE GenAIService SHALL return a new `GeneratedAsset` derived from the same original asset, with optional instruction modifications applied.
8. WHEN AI generation succeeds, THE GenAIService SHALL persist the generated content as an Asset record with `source = 'ai_generated'` and increment the user's `ai_generations_this_month` counter by one.

---

### Requirement 5: Platform-Agnostic Publishing Interface

**User Story:** As a platform architect, I want all social media publishing to flow through a single interface, so that new platforms can be added without modifying the scheduling engine.

#### Acceptance Criteria

1. THE SocialMediaPublisher interface SHALL define `publish`, `delete`, `edit`, `getCapabilities`, and `validatePost` methods that every platform implementation must provide.
2. WHEN `validatePost(post)` is called with a post whose `text` length is within the platform's `maxTextLength` and whose `mediaType` is supported by the platform, THE SocialMediaPublisher SHALL return a `ValidationResult` where `valid === true` and `errors` is an empty array.
3. IF `validatePost(post)` is called with a post that violates any platform capability constraint, THEN THE SocialMediaPublisher SHALL return a `ValidationResult` where `valid === false` and `errors` contains at least one descriptive message.
4. WHEN `TelegramPublisher.publish(post, channel)` is called with a valid bot token and a well-formed post, THE TelegramPublisher SHALL make exactly one call to the Telegram Bot API and return a `PublishResult` where `success === true` and `platformMessageId` is a non-empty string.
5. IF the Telegram Bot API returns a 5xx response or network timeout, THEN THE TelegramPublisher SHALL return a `PublishResult` where `error.code === 'NETWORK_ERROR'` and `error.retryable === true`.
6. IF the Telegram Bot API returns a 401 Unauthorized response, THEN THE TelegramPublisher SHALL return a `PublishResult` where `error.code === 'INVALID_TOKEN'` and `error.retryable === false`.
7. IF `publish(post, channel)` is called on a post where `post.status === 'published'`, THEN THE SocialMediaPublisher SHALL return a `PublishResult` where `error.code === 'CONTENT_REJECTED'` and no duplicate message is created on the platform.
8. WHEN `getCapabilities()` is called on any SocialMediaPublisher implementation, THE implementation SHALL return a `PlatformCapabilities` object with accurate values for `maxTextLength`, `supportsImages`, `supportsVideo`, `supportsAudio`, `supportsPDFs`, `supportsCarousel`, and `supportsScheduledEdit`.

---

### Requirement 6: Content Scheduling

**User Story:** As a business owner, I want to schedule posts for future publication, so that my content is published at optimal times without manual intervention.

#### Acceptance Criteria

1. WHEN `schedulePost(request)` is called with `request.scheduledAt > now()`, a valid `channelId` belonging to `request.userId`, and non-empty content, THE SchedulingEngine SHALL persist a `ScheduledPost` record with `status === 'scheduled'` and return it.
2. IF `schedulePost(request)` is called with `request.scheduledAt <= now()`, THEN THE SchedulingEngine SHALL reject the request with a validation error.
3. IF `schedulePost(request)` is called for a user where `checkFeatureAccess(userId, 'scheduled_posts')` returns `false`, THEN THE SchedulingEngine SHALL reject the request with a `FeatureGatedError`.
4. THE SchedulingEngine SHALL ensure that for every ScheduledPost created via `schedulePost()`, `post.scheduledAt > post.createdAt`.
5. WHEN `tick()` is executed, THE SchedulingEngine SHALL query all ScheduledPost records where `status === 'scheduled'` AND `scheduled_at <= now()` AND the owning user has an active subscription, and dispatch each to the appropriate SocialMediaPublisher.
6. WHEN `tick()` completes, THE SchedulingEngine SHALL return a `DispatchSummary` where `processed === succeeded + failed + retryQueued`.
7. WHEN a post is dispatched, THE SchedulingEngine SHALL first call `validatePost(post)` on the publisher; IF validation fails, THEN THE SchedulingEngine SHALL update the post to `status = 'failed'` and insert an audit log entry without calling the platform API.
8. WHEN `cancelPost(postId)` is called on a post with `status === 'scheduled'`, THE SchedulingEngine SHALL update the post to `status === 'cancelled'`.
9. WHEN `reschedulePost(postId, newScheduledAt)` is called with `newScheduledAt > now()`, THE SchedulingEngine SHALL update the post's `scheduledAt` and return the updated ScheduledPost.
10. WHERE the `recurrence_rules` feature is enabled, WHEN a recurring post is successfully published, THE SchedulingEngine SHALL automatically create and persist the next recurrence instance with the correctly computed `scheduledAt`.
11. WHEN `getUpcomingPosts(userId, from, to)` is called, THE SchedulingEngine SHALL return all ScheduledPost records for `userId` with `scheduledAt` within `[from, to]` and `status === 'scheduled'`.
12. THE SchedulingEngine SHALL use `FOR UPDATE SKIP LOCKED` when querying posts for dispatch, ensuring concurrent cron executions never process the same post.

---

### Requirement 7: Retry Logic

**User Story:** As a business owner, I want failed publish attempts to be retried automatically, so that transient errors do not result in missed publications.

#### Acceptance Criteria

1. WHEN a `PublishResult` is received where `error.retryable === true` AND `post.retryCount < post.maxRetries`, THE RetryEngine SHALL enqueue the post with an incremented `retryCount` and update its `status` to `'retrying'`.
2. IF a `PublishResult` is received where `error.retryable === false` OR `post.retryCount >= post.maxRetries`, THEN THE RetryEngine SHALL update the post to `status = 'failed'` and send a `retry_exhausted` alert to the post owner.
3. THE RetryEngine SHALL compute the delay before the next retry attempt using exponential backoff: `delay = MIN(1000 * (2 ^ retryCount), 300000)` milliseconds, with up to 10% random jitter added.
4. FOR ALL consecutive retry attempts on the same post, the delay before attempt `n+1` SHALL be no less than 90% of the delay before attempt `n` (strictly non-decreasing within jitter tolerance).
5. THE RetryEngine SHALL guarantee that `post.retryCount` never exceeds `post.maxRetries` for any post.
6. THE RetryEngine SHALL guarantee that `post.retryCount` is monotonically non-decreasing — it never decreases over the lifetime of a post.
7. WHEN `processQueue()` is executed, THE RetryEngine SHALL process all posts where `status === 'retrying'` AND `next_retry_at <= now()`.
8. WHEN a retry attempt succeeds, THE RetryEngine SHALL update the post to `status = 'published'` and insert an audit log entry recording the retry attempt number.

---

### Requirement 8: Metrics and Analytics

**User Story:** As a business owner, I want to view engagement metrics for my published content, so that I can evaluate the performance of my marketing campaigns.

#### Acceptance Criteria

1. WHEN `ingestMetrics(platformMessageId, metrics)` is called, THE MetricsService SHALL persist the raw platform metrics and associate them with the corresponding ScheduledPost via `platformMessageId`.
2. WHEN `getPostMetrics(postId)` is called, THE MetricsService SHALL return a `PostMetrics` object containing `views`, `reactions`, `forwards`, and `replies` for that post.
3. WHEN `getChannelSummary(channelId, dateRange)` is called, THE MetricsService SHALL return a `ChannelSummary` with `totalPosts`, `totalViews`, `avgEngagementRate`, and `topPost` for the specified date range.
4. WHEN `getDashboardMetrics(userId)` is called, THE MetricsService SHALL return a `DashboardMetrics` object with `totalPostsPublished`, `postsThisWeek`, `avgViewsPerPost`, `failureRate`, `upcomingPostsCount`, and `recentActivity`.
5. WHEN `getEngagementTrend(channelId, granularity)` is called, THE MetricsService SHALL return an array of `TrendPoint` objects sorted in ascending order by `date`.
6. WHEN `getEngagementTrend(channelId, granularity)` is called, THE MetricsService SHALL include a `TrendPoint` for every period in the range (last 30 days for `'day'`, last 12 weeks for `'week'`, last 12 months for `'month'`), setting `value = 0` for periods with no data.
7. THE MetricsService SHALL ensure that every `TrendPoint.value` in any returned trend array is greater than or equal to zero.
8. WHERE the `analytics` feature is enabled, THE MetricsService SHALL make engagement trend and channel summary data accessible to the authenticated user.

---

### Requirement 9: Alerts and Notifications

**User Story:** As a business owner, I want to receive real-time notifications about publish outcomes and billing events, so that I can take immediate action when issues arise.

#### Acceptance Criteria

1. WHEN `notify(userId, alertEvent)` is called, THE AlertService SHALL persist a Notification record and make it retrievable via `getNotifications(userId)`.
2. WHEN a post is successfully published by the SchedulingEngine or RetryEngine, THE AlertService SHALL deliver a `post_published` alert to the post owner.
3. WHEN a post reaches `status = 'failed'` after exhausting retries, THE AlertService SHALL deliver a `retry_exhausted` alert to the post owner.
4. WHEN a post enters `status = 'retrying'`, THE AlertService SHALL deliver a `post_retrying` alert to the post owner with the estimated next retry time.
5. WHEN `markAsRead(notificationId)` is called, THE AlertService SHALL update the notification so that it no longer appears in results when `getNotifications(userId, unreadOnly = true)` is called.
6. WHEN `markAllAsRead(userId)` is called, THE AlertService SHALL mark all of the user's notifications as read so that `getNotifications(userId, unreadOnly = true)` returns an empty array.
7. WHEN `subscribeToRealtime(userId, callback)` is called, THE AlertService SHALL deliver each new Notification to `callback` in real time via Supabase Realtime WebSocket, without requiring a page refresh.
8. WHEN a billing event occurs (subscription renewed, payment failed, or subscription expired), THE AlertService SHALL deliver the corresponding alert type (`subscription_renewed`, `payment_failed`, or `subscription_expired`) to the user.

---

### Requirement 10: Subscription Billing and Feature Gating

**User Story:** As a business owner, I want to subscribe to a plan and have the platform enforce its limits, so that I only access features appropriate to my subscription tier.

#### Acceptance Criteria

1. WHEN a user calls `createCheckoutSession(userId, planId)` with a valid plan identifier, THE BillingService SHALL create a Stripe Checkout Session and return a `CheckoutSession` containing a non-empty `url`.
2. WHEN Stripe sends a `checkout.session.completed` webhook event, THE BillingService SHALL update the user's subscription record to `status = 'active'` with the correct `planId`, `currentPeriodStart`, and `currentPeriodEnd`.
3. WHEN Stripe sends an `invoice.payment_failed` webhook event, THE BillingService SHALL update the subscription record to `status = 'past_due'` and pause any pending scheduled posts.
4. WHEN a Stripe webhook request arrives with an invalid `Stripe-Signature` header, THE BillingService SHALL reject the request without performing any database mutation.
5. WHEN `checkFeatureAccess(userId, feature)` is called for a user with an `active` or `trialing` subscription on a plan that includes `feature`, THE BillingService SHALL return `true`.
6. WHEN `checkFeatureAccess(userId, feature)` is called for a user with a `cancelled`, `past_due`, or absent subscription, THE BillingService SHALL return `false` for all Feature values.
7. IF `checkFeatureAccess(userId, feature)` returns `false`, THEN THE BillingService SHALL ensure any attempt to exercise that feature returns a `FeatureGatedError` before any external API call is made.
8. WHEN `getUsage(userId)` is called, THE BillingService SHALL return a `UsageSummary` with accurate values for `postsThisMonth`, `storageUsedBytes`, `aiGenerationsThisMonth`, and their respective limits for the user's current plan.
9. WHEN `createPortalSession(userId)` is called, THE BillingService SHALL create and return a Stripe Billing Portal session URL for the user's existing Stripe customer.

---

### Requirement 11: Audit Logging

**User Story:** As a compliance-conscious operator, I want all publish and moderation events to be permanently recorded, so that I have a trustworthy history of all platform actions.

#### Acceptance Criteria

1. WHEN any publish attempt completes (success, failure, or retry), THE SchedulingEngine or RetryEngine SHALL insert a record into `audit_log` capturing `userId`, `postId`, `action`, `platform`, `platformMessageId` (if available), `errorCode` (if applicable), and `occurredAt`.
2. THE AuditLog SHALL enforce an immutability policy: any attempt to execute an UPDATE or DELETE on any `audit_log` row SHALL be rejected by the RLS policy for all database roles, including `service_role`.
3. THE AuditLog SHALL set `occurredAt` server-side at insert time; clients SHALL NOT be able to override this value.
4. WHEN `audit_log` records are queried by an authenticated user, THE AuditLog RLS policy SHALL return only records where `userId` matches the requesting user's `auth.uid()`.
5. WHEN a key vault access operation (`storeKey`, `rotateKey`, `deleteKey`) is performed, THE KeyVaultService SHALL insert an audit entry recording the operation, key name, and `userId`.

---

### Requirement 12: Data Isolation and Security

**User Story:** As a multi-tenant platform user, I want my data to be completely isolated from other users, so that no one else can access my content, credentials, or analytics.

#### Acceptance Criteria

1. THE system SHALL enable Row Level Security on all tables (`users_profile`, `channels`, `scheduled_posts`, `assets`, `audit_log`, `subscriptions`) with a default-deny policy.
2. FOR ALL tables with a `user_id` column, THE RLS policies SHALL ensure that any authenticated query returns only rows where `user_id = auth.uid()`.
3. THE AssetStorageService SHALL ensure that `listAssets(userA)` never returns any asset where `asset.userId !== userA.id`, enforced at both the application layer and the RLS layer.
4. THE SchedulingEngine SHALL ensure that `getUpcomingPosts(userId, from, to)` never returns posts belonging to a different user.
5. WHEN an unauthenticated request is made to any protected API endpoint, THE system SHALL return HTTP 401 before processing the request body.
6. THE KeyVaultService SHALL store all user-supplied API keys encrypted with AES-256 in Supabase Vault; raw key values SHALL never appear in any HTTP response to the Angular frontend.
7. WHEN a Stripe webhook is received, THE BillingService SHALL verify the `Stripe-Signature` header using the `STRIPE_WEBHOOK_SECRET` before performing any database operation.
8. THE system SHALL store all service-level secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `STRIPE_WEBHOOK_SECRET`) exclusively in Supabase project secrets, never in source-controlled files.

---

### Requirement 13: Post Lifecycle Integrity

**User Story:** As a platform user, I want post status transitions to follow a strict lifecycle, so that I can trust the status field as an accurate reflection of each post's state.

#### Acceptance Criteria

1. THE ScheduledPost SHALL only transition through the valid status sequence: `draft` → `scheduled` → `publishing` → `published` | `failed`; and `failed` → `retrying` → `published` | `failed`.
2. WHEN a ScheduledPost reaches `status = 'published'` or `status = 'failed'`, THE system SHALL not permit any operation to change the post's `status` to any other value.
3. WHEN `tick()` is about to dispatch a post, THE SchedulingEngine SHALL update the post's `status` to `'publishing'` before calling the SocialMediaPublisher, ensuring the post cannot be picked up by a concurrent cron execution.
4. IF a ScheduledPost remains in `status = 'publishing'` for more than 5 minutes, THE SchedulingEngine SHALL reset it to `status = 'scheduled'` at the start of the next `tick()` execution.

---

### Requirement 14: Editorial Calendar

**User Story:** As a content operator, I want a visual calendar showing all scheduled, published, and failed posts, so that I can manage my publishing schedule at a glance.

#### Acceptance Criteria

1. WHEN a user views the Editorial Calendar, THE system SHALL display all ScheduledPost records for that user organized by `scheduledAt` date and time.
2. WHEN a user drags a post to a new date/time slot in the calendar, THE system SHALL call `reschedulePost(postId, newScheduledAt)` with the dropped date and update the calendar view.
3. IF `reschedulePost` is called with a `newScheduledAt <= now()`, THEN THE system SHALL reject the operation and display a validation error to the user without modifying the post.
4. WHEN a user clicks a post on the calendar, THE system SHALL display a side drawer showing the post's `status`, `content` preview, `scheduledAt`, and action buttons (Edit, Cancel, View Metrics).
5. THE Editorial Calendar SHALL visually distinguish posts by their `status` using the design-token colors: `--color-live` for published, `--color-signal` for scheduled, and `--color-fault` for failed.

---

### Requirement 15: Frontend Application Structure

**User Story:** As a business owner, I want a responsive web application with dedicated views for each functional area, so that I can efficiently manage all aspects of my content operations.

#### Acceptance Criteria

1. THE Angular SPA SHALL provide authenticated route modules for: `/dashboard`, `/studio`, `/assets`, `/calendar`, `/metrics`, `/automation`, and `/settings`, each lazy-loaded.
2. WHEN an unauthenticated user attempts to navigate to a protected route, THE auth guard SHALL redirect to `/auth/login`.
3. WHEN a user navigates to a route requiring a gated feature the user's plan does not include, THE feature-gate guard SHALL redirect to the billing settings page with an upgrade prompt.
4. THE application SHALL display a persistent broadcast ticker at the bottom of every authenticated view, showing the last 3 published post titles with their timestamps and platform icons.
5. THE AI Studio view SHALL display a usage meter showing `aiGenerationsThisMonth` and `aiGenerationsLimit` for the current user.
6. WHEN the AI Studio is in streaming mode and tokens are arriving, THE Studio view SHALL render each token chunk progressively as it arrives via the `onChunk` callback.
7. THE Asset Repository view SHALL support drag-and-drop file upload, multi-select with bulk actions (delete, move, tag), and both grid and list display modes.
8. THE Metrics view SHALL provide a date range picker supporting presets of last 7 days, 30 days, and 90 days, as well as a custom range.
