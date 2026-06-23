import { SupabaseClient } from '@supabase/supabase-js'
import {
  PostMetrics,
  ChannelSummary,
  TrendPoint,
  DateRange,
  SocialPlatform,
  RawPlatformMetrics,
} from '@director-ai/types'

/**
 * MetricsService — Supabase Edge Function implementation.
 *
 * Satisfies the MetricsService interface defined in packages/types/index.ts
 * (lines 347-406). Uses the `post_metrics` table which stores per-post
 * engagement snapshots ingested after each successful publish.
 *
 * STUB NOTE (Task 4.1):
 * All methods gracefully handle PGRST116 (table not found) so this service
 * compiles and runs even when the `post_metrics` migration has not yet been
 * applied to the staging database. The moment the table exists, live data
 * flows through automatically.
 *
 * Wiring notes:
 *  - Call `ingestMetrics` from TelegramPublisher.publish() after a successful
 *    send, passing the platform message ID and the raw metrics object.
 *  - The scheduler's tick() loop should call this after publish to seed the
 *    first metrics snapshot.
 */
export class MetricsServiceImpl {
  constructor(private supabase: SupabaseClient) {}

  // ---------------------------------------------------------------------------
  // ingestMetrics
  // ---------------------------------------------------------------------------

  /**
   * Upsert a raw metrics snapshot for a published post.
   *
   * Inserts or updates a row in `post_metrics` keyed by (postId, measuredAt).
   * If the table does not exist yet, the error is swallowed and the call is
   * a no-op — this prevents any caller from crashing before the migration runs.
   */
  async ingestMetrics(
    postId: string,
    platformMessageId: string,
    metrics: RawPlatformMetrics,
  ): Promise<void> {
    const { error } = await this.supabase.from('post_metrics').upsert(
      {
        post_id: postId,
        platform_message_id: platformMessageId,
        views: metrics.views,
        reactions: metrics.reactions,
        forwards: metrics.forwards,
        replies: metrics.replies,
        measured_at: metrics.measuredAt.toISOString(),
      },
      { onConflict: 'post_id,measured_at' },
    )

    if (error && !isTableNotFound(error)) {
      throw error
    }
  }

  // ---------------------------------------------------------------------------
  // getPostMetrics
  // ---------------------------------------------------------------------------

  /**
   * Fetch the latest metrics snapshot for a given post.
   * Returns null if no metrics have been ingested yet or if the table
   * does not exist.
   */
  async getPostMetrics(postId: string): Promise<PostMetrics | null> {
    const { data, error } = await this.supabase
      .from('post_metrics')
      .select('*')
      .eq('post_id', postId)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      if (isTableNotFound(error)) return null
      throw error
    }

    if (!data) return null

    return rowToPostMetrics(data)
  }

  // ---------------------------------------------------------------------------
  // getChannelSummary
  // ---------------------------------------------------------------------------

  /**
   * Aggregate metrics for all posts published on a given channel within
   * a date range.
   *
   * Algorithm:
   *  1. Fetch all published scheduled_posts for the channel in the range.
   *  2. Join their metrics from post_metrics.
   *  3. Sum views, compute avgEngagementRate, identify topPost.
   */
  async getChannelSummary(
    channelId: string,
    dateRange: DateRange,
  ): Promise<ChannelSummary | null> {
    // Step 1: Fetch published posts for this channel in date range
    const { data: posts, error: postsError } = await this.supabase
      .from('scheduled_posts')
      .select('id, user_id')
      .eq('channel_id', channelId)
      .eq('status', 'published')
      .gte('published_at', dateRange.from.toISOString())
      .lte('published_at', dateRange.to.toISOString())

    if (postsError) throw postsError
    if (!posts || posts.length === 0) return null

    const postIds = posts.map((p: any) => p.id)
    
    // Fallback platform if we can't join channels easily here
    const platform: SocialPlatform = 'telegram'

    // Step 2: Fetch latest metrics for each post
    const { data: metricsRows, error: metricsError } = await this.supabase
      .from('post_metrics')
      .select('*')
      .in('post_id', postIds)
      .order('measured_at', { ascending: false })

    if (metricsError) {
      if (isTableNotFound(metricsError)) {
        // Stub response — table not yet migrated
        return {
          channelId,
          platform,
          totalPosts: posts.length,
          totalViews: 0,
          avgEngagementRate: 0,
          topPost: {
            postId: postIds[0],
            platformMessageId: '',
            views: 0,
            reactions: {},
            forwards: 0,
            replies: 0,
            measuredAt: new Date(),
          },
          dateRange,
        }
      }
      throw metricsError
    }

    // Step 3: Aggregate — take the latest snapshot per post_id
    const latestByPost = new Map<string, any>()
    for (const row of metricsRows ?? []) {
      if (!latestByPost.has(row.post_id)) {
        latestByPost.set(row.post_id, row)
      }
    }

    let totalViews = 0
    let totalEngagement = 0
    let topRow: any = null

    for (const row of latestByPost.values()) {
      const views = row.views ?? 0
      const eng = (row.forwards ?? 0) + (row.replies ?? 0) +
        Object.values(row.reactions ?? {}).reduce((s: number, v) => s + (v as number), 0)
      totalViews += views
      totalEngagement += eng
      if (!topRow || views > (topRow.views ?? 0)) topRow = row
    }

    const avgEngagementRate = totalViews > 0
      ? parseFloat(((totalEngagement / totalViews) * 100).toFixed(2))
      : 0

    return {
      channelId,
      platform,
      totalPosts: posts.length,
      totalViews,
      avgEngagementRate,
      topPost: topRow ? rowToPostMetrics(topRow) : {
        postId: postIds[0],
        platformMessageId: '',
        views: 0,
        reactions: {},
        forwards: 0,
        replies: 0,
        measuredAt: new Date(),
      },
      dateRange,
    }
  }

  // ---------------------------------------------------------------------------
  // getEngagementTrend
  // ---------------------------------------------------------------------------

  /**
   * Return daily engagement trend points for a user within a date range.
   * Granularity is currently always 'day'.
   *
   * Buckets views by day, summing across all posts. Returns an empty array if
   * the post_metrics table does not yet exist.
   */
  async getEngagementTrend(
    userId: string,
    dateRange: DateRange,
    _granularity: 'day' | 'week' | 'month' = 'day',
  ): Promise<TrendPoint[]> {
    // Fetch all published posts for the user in range
    const { data: posts, error: postsError } = await this.supabase
      .from('scheduled_posts')
      .select('id, published_at')
      .eq('user_id', userId)
      .eq('status', 'published')
      .gte('published_at', dateRange.from.toISOString())
      .lte('published_at', dateRange.to.toISOString())

    if (postsError) throw postsError
    if (!posts || posts.length === 0) return []

    const postIds = posts.map((p: any) => p.id)

    const { data: metricsRows, error: metricsError } = await this.supabase
      .from('post_metrics')
      .select('post_id, views, measured_at')
      .in('post_id', postIds)

    if (metricsError) {
      if (isTableNotFound(metricsError)) return [] // table not yet created
      throw metricsError
    }

    // Map post_id → published_at date string (YYYY-MM-DD)
    const postDateMap = new Map<string, string>()
    for (const post of posts) {
      const day = new Date(post.published_at).toISOString().slice(0, 10)
      postDateMap.set(post.id, day)
    }

    // Bucket views by day (use max snapshot per post to avoid duplicates)
    const latestViews = new Map<string, number>()
    for (const row of metricsRows ?? []) {
      const current = latestViews.get(row.post_id) ?? 0
      if ((row.views ?? 0) > current) latestViews.set(row.post_id, row.views ?? 0)
    }

    const buckets = new Map<string, number>()
    for (const [postId, views] of latestViews) {
      const day = postDateMap.get(postId)
      if (!day) continue
      buckets.set(day, (buckets.get(day) ?? 0) + views)
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]): TrendPoint => ({
        date: new Date(day),
        value,
        label: day,
      }))
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect Supabase PGRST116 = relation does not exist (table not migrated). */
function isTableNotFound(error: any): boolean {
  return (
    error?.code === 'PGRST116' ||
    error?.code === 'PGRST205' ||
    (typeof error?.message === 'string' && error.message.toLowerCase().includes('does not exist')) ||
    (typeof error?.message === 'string' && error.message.toLowerCase().includes('could not find the table'))
  )
}

function rowToPostMetrics(row: any): PostMetrics {
  return {
    postId: row.post_id,
    platformMessageId: row.platform_message_id ?? '',
    views: row.views ?? 0,
    reactions: row.reactions ?? {},
    forwards: row.forwards ?? 0,
    replies: row.replies ?? 0,
    measuredAt: new Date(row.measured_at),
  }
}
