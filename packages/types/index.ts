/**
 * @director-ai/types
 *
 * Shared TypeScript type barrel for the DirectorAI platform.
 * All interfaces, types, enums, and error classes from the design document.
 */

// ---------------------------------------------------------------------------
// Supabase Auth structural types
// Minimal shapes matching @supabase/supabase-js so this barrel has no
// external runtime dependencies.
// ---------------------------------------------------------------------------

/** Minimal shape of a Supabase Auth User object. */
export interface User {
  id: string
  email?: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
  aud: string
  created_at: string
}

/** Minimal shape of a Supabase Auth Session object. */
export interface Session {
  access_token: string
  refresh_token: string
  expires_at?: number
  expires_in: number
  token_type: string
  user: User
}

/** Minimal shape of a Supabase Auth error. */
export interface AuthError {
  message: string
  status?: number
}

// ---------------------------------------------------------------------------
// Module 1 – Infrastructure & Security
// ---------------------------------------------------------------------------

// --- AuthService -----------------------------------------------------------

export type OAuthProvider = 'google'

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'PASSWORD_RECOVERY'

export interface AuthResult {
  user: User | null
  session: Session | null
  error: AuthError | null
}

export interface AuthSubscription {
  unsubscribe: () => void
}

export interface AuthService {
  signUp(email: string, password: string): Promise<AuthResult>
  signIn(email: string, password: string): Promise<AuthResult>
  signInWithOAuth(provider: OAuthProvider): Promise<void>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  getSession(): Promise<Session | null>
  getUser(): Promise<User | null>
  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void): AuthSubscription
}

// --- KeyVaultService -------------------------------------------------------

export type KeyName =
  | 'telegram_bot_token'
  | 'openrouter_api_key'
  | 'google_calendar_refresh_token'

export interface KeyVaultService {
  storeKey(userId: string, keyName: KeyName, value: string): Promise<void>
  getKey(userId: string, keyName: KeyName): Promise<string>
  rotateKey(userId: string, keyName: KeyName, newValue: string): Promise<void>
  deleteKey(userId: string, keyName: KeyName): Promise<void>
  listKeyNames(userId: string): Promise<KeyName[]>
}

// ---------------------------------------------------------------------------
// Module 3 – Orchestration & Publishing (referenced by Asset and GenAI too)
// ---------------------------------------------------------------------------

export type SocialPlatform = 'telegram' | 'twitter' | 'instagram' | 'linkedin'

export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'retrying'
  | 'failed'
  | 'cancelled'

export type PublishErrorCode =
  | 'RATE_LIMITED'
  | 'INVALID_TOKEN'
  | 'CHANNEL_NOT_FOUND'
  | 'MEDIA_TOO_LARGE'
  | 'NETWORK_ERROR'
  | 'PLATFORM_OUTAGE'
  | 'CONTENT_REJECTED'

export interface PublishError {
  code: PublishErrorCode
  message: string
  retryable: boolean
  retryAfterMs?: number
}

export interface PublishResult {
  success: boolean
  platformMessageId: string
  publishedAt: Date
  platform: SocialPlatform
  error?: PublishError
}

export interface PlatformCapabilities {
  maxTextLength: number
  supportsImages: boolean
  supportsVideo: boolean
  supportsAudio: boolean
  supportsPDFs: boolean
  supportsCarousel: boolean
  supportsScheduledEdit: boolean
}

export interface ChannelConfig {
  platform: SocialPlatform
  channelId: string
  /** Resolved from KeyVault at runtime; never persisted on the frontend */
  credentials: Record<string, string>
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PostContent {
  text?: string
  mediaAssetIds?: string[]
  mediaType?: 'photo' | 'video' | 'audio' | 'document'
  caption?: string
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[]
  endDate?: Date
  maxOccurrences?: number
}

export interface ScheduledPost {
  id: string
  userId: string
  platform: SocialPlatform
  channelId: string
  content: PostContent
  scheduledAt: Date
  status: PostStatus
  retryCount: number
  maxRetries: number
  platformMessageId?: string
  publishedAt?: Date
  nextRetryAt?: Date
  recurrenceRule?: RecurrenceRule
  createdAt: Date
  updatedAt: Date
}

export interface CreatePostRequest {
  userId: string
  channelId: string
  content: PostContent
  scheduledAt: Date
  recurrenceRule?: RecurrenceRule
}

export interface DispatchSummary {
  processed: number
  succeeded: number
  failed: number
  retryQueued: number
}

/** Platform-agnostic publisher contract */
export interface SocialMediaPublisher {
  readonly platform: SocialPlatform
  publish(post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult>
  delete(platformMessageId: string, channel: ChannelConfig): Promise<void>
  edit(platformMessageId: string, post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult>
  getCapabilities(): PlatformCapabilities
  validatePost(post: ScheduledPost): ValidationResult
}

// ---------------------------------------------------------------------------
// Module 1 – Asset Storage Service
// ---------------------------------------------------------------------------

export type SupportedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'video/mp4'
  | 'video/webm'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'application/pdf'
  | 'text/plain'

export interface Asset {
  id: string
  userId: string
  filename: string
  mimeType: SupportedMimeType
  sizeBytes: number
  storageUrl: string
  folder: string
  tags: string[]
  source: 'user_upload' | 'ai_generated'
  createdAt: Date
}

export interface AssetMetadata {
  folder?: string
  tags?: string[]
  source: 'user_upload' | 'ai_generated'
}

export interface AssetFilter {
  folder?: string
  tags?: string[]
  source?: 'user_upload' | 'ai_generated'
  mimeType?: SupportedMimeType
}

// ---------------------------------------------------------------------------
// Module 2 – Generative AI Orchestrator
// ---------------------------------------------------------------------------

export interface GenAIService {
  generateCopy(request: CopyRequest): Promise<GeneratedCopy>
  generateImage(request: ImageRequest): Promise<GeneratedImage>
  brainstorm(request: BrainstormRequest): Promise<BrainstormResult>
  regenerate(assetId: string, instructions?: string): Promise<GeneratedAsset>
  streamGenerate(request: CopyRequest, onChunk: (chunk: string) => void): Promise<GeneratedCopy>
}

export type ContentTone =
  | 'professional'
  | 'casual'
  | 'promotional'
  | 'educational'
  | 'urgent'

export interface CopyRequest {
  userId: string
  prompt: string
  platform: SocialPlatform
  tone?: ContentTone
  referenceAssetIds?: string[]
  maxLength?: number
}

export interface ImageRequest {
  userId: string
  prompt: string
  style?: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3'
}

export interface BrainstormRequest {
  userId: string
  topic: string
  count: number
  platform: SocialPlatform
}

export interface GeneratedCopy {
  id: string
  content: string
  platform: SocialPlatform
  model: string
  tokensUsed: number
  createdAt: Date
}

export interface GeneratedImage {
  id: string
  url: string
  prompt: string
  model: string
  createdAt: Date
}

export type GeneratedAsset = GeneratedCopy | GeneratedImage

export interface BrainstormResult {
  ideas: string[]
  platform: SocialPlatform
  count: number
}

// ---------------------------------------------------------------------------
// Module 3 – Retry Engine
// ---------------------------------------------------------------------------

export interface RetryStatus {
  postId: string
  attempt: number
  maxAttempts: number
  nextRetryAt: Date | null
  lastError: PublishError
  status: 'queued' | 'exhausted' | 'cancelled'
}

export interface RetryRecord {
  postId: string
  attempt: number
  attemptedAt: Date
  error: PublishError
  outcome: 'success' | 'failed'
}

export interface RetryEngine {
  enqueue(post: ScheduledPost, error: PublishError): Promise<void>
  processQueue(): Promise<void>
  getRetryStatus(postId: string): Promise<RetryStatus>
  cancelRetry(postId: string): Promise<void>
  getRetryHistory(userId: string, limit?: number): Promise<RetryRecord[]>
}

// ---------------------------------------------------------------------------
// Module 4 – Metrics Service
// ---------------------------------------------------------------------------

export interface DateRange {
  from: Date
  to: Date
}

export interface TrendPoint {
  date: Date
  value: number
  label: string
}

export interface RawPlatformMetrics {
  views: number
  reactions: Record<string, number>
  forwards: number
  replies: number
  measuredAt: Date
}

export interface PostMetrics {
  postId: string
  platformMessageId: string
  views: number
  reactions: Record<string, number>
  forwards: number
  replies: number
  measuredAt: Date
}

export interface MetricsService {
  ingestMetrics(platformMessageId: string, metrics: RawPlatformMetrics): Promise<void>
  getPostMetrics(postId: string): Promise<PostMetrics | null>
  getChannelSummary(channelId: string, dateRange: DateRange): Promise<ChannelSummary | null>
  getDashboardMetrics(userId: string): Promise<DashboardMetrics>
  getEngagementTrend(channelId: string, granularity: 'day' | 'week' | 'month'): Promise<TrendPoint[]>
}

export interface ChannelSummary {
  channelId: string
  platform: SocialPlatform
  totalPosts: number
  totalViews: number
  avgEngagementRate: number
  topPost: PostMetrics
  dateRange: DateRange
}

export interface ActivityEvent {
  id: string
  userId: string
  postId: string
  action: 'published' | 'failed' | 'retried' | 'cancelled' | 'edited' | 'deleted'
  platform: SocialPlatform
  occurredAt: Date
}

export interface DashboardMetrics {
  totalPostsPublished: number
  postsThisWeek: number
  avgViewsPerPost: number
  failureRate: number
  upcomingPostsCount: number
  recentActivity: ActivityEvent[]
}

// ---------------------------------------------------------------------------
// Module 4 – Alert Service
// ---------------------------------------------------------------------------

export type AlertType =
  | 'post_published'
  | 'post_failed'
  | 'post_retrying'
  | 'retry_exhausted'
  | 'subscription_renewed'
  | 'subscription_expired'
  | 'payment_failed'
  | 'api_key_invalid'

export type Unsubscribe = () => void

export interface AlertEvent {
  type: AlertType
  severity: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  metadata?: Record<string, unknown>
}

export interface Notification {
  id: string
  userId: string
  type: AlertType
  severity: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  metadata: Record<string, unknown>
  read: boolean
  createdAt: Date
}

export interface AlertService {
  notify(userId: string, event: AlertEvent): Promise<void>
  getNotifications(userId: string, unreadOnly?: boolean): Promise<Notification[]>
  markAsRead(notificationId: string): Promise<void>
  markAllAsRead(userId: string): Promise<void>
  subscribeToRealtime(userId: string, callback: (n: Notification) => void): Unsubscribe
}

// ---------------------------------------------------------------------------
// Module 3 – Billing Service & Feature Gating
// ---------------------------------------------------------------------------

export interface BillingService {
  createCheckoutSession(userId: string, planId: PlanId): Promise<CheckoutSession>
  createPortalSession(userId: string): Promise<PortalSession>
  getSubscription(userId: string): Promise<Subscription>
  handleWebhookEvent(payload: string, signature: string): Promise<void>
  checkFeatureAccess(userId: string, feature: Feature): Promise<boolean>
  getUsage(userId: string): Promise<UsageSummary>
}

export type PlanId = 'starter' | 'professional' | 'agency'

export type Feature =
  | 'ai_generation'
  | 'asset_storage'
  | 'scheduled_posts'
  | 'recurrence_rules'
  | 'analytics'
  | 'multiple_channels'

export interface Subscription {
  userId: string
  planId: PlanId
  status: 'active' | 'past_due' | 'cancelled' | 'trialing'
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  stripeSubscriptionId: string
  stripeCustomerId: string
}

export interface UsageSummary {
  postsThisMonth: number
  postsLimit: number
  storageUsedBytes: number
  storageLimit: number
  aiGenerationsThisMonth: number
  aiGenerationsLimit: number
}

export interface CheckoutSession {
  sessionId: string
  url: string
}

export interface PortalSession {
  url: string
}

// ---------------------------------------------------------------------------
// Database Models
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  /** IANA timezone string, e.g. 'America/New_York' */
  timezone: string
  planId: PlanId
  onboardingCompleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Channel {
  id: string
  userId: string
  platform: SocialPlatform
  name: string
  /** e.g. Telegram @channelusername or numeric ID */
  channelIdentifier: string
  isActive: boolean
  createdAt: Date
}

export interface ScheduledPostRecord {
  id: string
  userId: string
  channelId: string
  textContent?: string
  mediaAssetIds: string[]
  mediaType?: 'photo' | 'video' | 'audio' | 'document'
  scheduledAt: Date
  status: PostStatus
  retryCount: number
  maxRetries: number
  platformMessageId?: string
  publishedAt?: Date
  nextRetryAt?: Date
  recurrenceRuleId?: string
  parentPostId?: string
  createdAt: Date
  updatedAt: Date
}

export interface AssetRecord {
  id: string
  userId: string
  filename: string
  mimeType: SupportedMimeType
  sizeBytes: number
  /** Supabase Storage path */
  storagePath: string
  folder: string
  tags: string[]
  source: 'user_upload' | 'ai_generated'
  generationPrompt?: string
  aiModel?: string
  createdAt: Date
}

export interface AuditLogRecord {
  id: string
  userId: string
  postId: string
  action: 'published' | 'failed' | 'retried' | 'cancelled' | 'edited' | 'deleted'
  platform: SocialPlatform
  platformMessageId?: string
  errorCode?: PublishErrorCode
  metadata: Record<string, unknown>
  occurredAt: Date
}

export interface SubscriptionRecord {
  id: string
  userId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  planId: PlanId
  status: 'active' | 'past_due' | 'cancelled' | 'trialing'
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/** Thrown when a user has exhausted their monthly AI generation quota. */
export class QuotaExceededError extends Error {
  override readonly name = 'QuotaExceededError'
  constructor(
    message: string,
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(message)
    Object.setPrototypeOf(this, QuotaExceededError.prototype)
  }
}

/** Thrown when a user attempts to use a feature their plan does not include. */
export class FeatureGatedError extends Error {
  override readonly name = 'FeatureGatedError'
  constructor(
    message: string,
    public readonly feature: Feature,
  ) {
    super(message)
    Object.setPrototypeOf(this, FeatureGatedError.prototype)
  }
}

/** Thrown when an uploaded asset exceeds the allowed size limit. */
export class AssetTooLargeError extends Error {
  override readonly name = 'AssetTooLargeError'
  constructor(
    message: string,
    public readonly maxBytes: number,
    public readonly actualBytes: number,
  ) {
    super(message)
    Object.setPrototypeOf(this, AssetTooLargeError.prototype)
  }
}

/** Thrown when an uploaded file has an unsupported MIME type. */
export class UnsupportedMimeTypeError extends Error {
  override readonly name = 'UnsupportedMimeTypeError'
  constructor(
    message: string,
    public readonly mimeType: string,
    public readonly supportedTypes: SupportedMimeType[],
  ) {
    super(message)
    Object.setPrototypeOf(this, UnsupportedMimeTypeError.prototype)
  }
}
