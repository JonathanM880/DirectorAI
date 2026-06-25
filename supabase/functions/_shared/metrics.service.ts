import { SupabaseClient } from '@supabase/supabase-js'
import {
  PostMetrics,
  ChannelSummary,
  TrendPoint,
  DateRange,
  SocialPlatform,
  RawPlatformMetrics,
  DashboardMetrics,
  ActivityEvent,
  MetricsService,
} from '@director-ai/types'

/**
 * MetricsService — Supabase Edge Function implementation.
 *
 * Satisfies the MetricsService interface defined in packages/types/index.ts
 * Uses the `post_metrics` table which stores per-post engagement snapshots.
 */
export class MetricsServiceImpl implements MetricsService {
  constructor(private supabase: SupabaseClient) {}

  // ---------------------------------------------------------------------------
  // ingestMetrics
  // ---------------------------------------------------------------------------

  /**
   * Look up post by platformMessageId and upsert its raw platform metrics.
   * If the post is not found or table doesn't exist, handle gracefully.
   */
  async ingestMetrics(
    platformMessageId: string,
    metrics: RawPlatformMetrics,
  ): Promise<void> {
    // 1. Look up scheduled_posts by platform_message_id to find the postId
    const { data: post, error: lookupError } = await this.supabase
      .from('scheduled_posts')
      .select('id')
      .eq('platform_message_id', platformMessageId)
      .maybeSingle()

    if (lookupError) {
      throw lookupError
    }

    if (!post) {
      // If post is not found, we cannot ingest metrics
      return
    }

    const { error } = await this.supabase.from('post_metrics').upsert(
      {
        post_id: post.id,
        platform_message_id: platformMessageId,
        views: metrics.views,
        reactions: metrics.reactions,
        forwards: metrics.forwards,
        replies: metrics.replies,
        measured_at: metrics.measuredAt.toISOString(),
      },
      { onConflict: 'post_id' },
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
      .select('id, platform')
      .eq('channel_id', channelId)
      .eq('status', 'published')
      .gte('published_at', dateRange.from.toISOString())
      .lte('published_at', dateRange.to.toISOString())

    if (postsError) throw postsError
    if (!posts || posts.length === 0) return null

    const postIds = posts.map((p: any) => p.id)
    const platform: SocialPlatform = posts[0]?.platform || 'telegram'

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
  // getDashboardMetrics
  // ---------------------------------------------------------------------------

  /**
   * Compute user dashboard metrics including total posts, failure rate,
   * average views per post, and recent activity.
   */
  async getDashboardMetrics(userId: string): Promise<DashboardMetrics> {
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // 1. totalPostsPublished
    const { count: totalPostsPublished, error: pubError } = await this.supabase
      .from('scheduled_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'published')

    if (pubError) throw pubError

    // 2. postsThisWeek
    const { count: postsThisWeek, error: weekError } = await this.supabase
      .from('scheduled_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'published')
      .gte('published_at', oneWeekAgo.toISOString())

    if (weekError) throw weekError

    // 3. upcomingPostsCount
    const { count: upcomingPostsCount, error: upcomingError } = await this.supabase
      .from('scheduled_posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .gt('scheduled_at', now.toISOString())

    if (upcomingError) throw upcomingError

    // 4. avgViewsPerPost
    const { data: publishedPosts, error: listPubError } = await this.supabase
      .from('scheduled_posts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'published')

    if (listPubError) throw listPubError

    let avgViewsPerPost = 0
    if (publishedPosts && publishedPosts.length > 0) {
      const pubIds = publishedPosts.map((p: any) => p.id)
      const { data: metrics, error: metricsErr } = await this.supabase
        .from('post_metrics')
        .select('views')
        .in('post_id', pubIds)

      if (metricsErr && !isTableNotFound(metricsErr)) {
        throw metricsErr
      }

      const totalViews = (metrics ?? []).reduce((sum: number, r: any) => sum + (r.views ?? 0), 0)
      avgViewsPerPost = Math.round(totalViews / publishedPosts.length)
    }

    // 5. failureRate: failed / (published + failed + retrying)
    const { data: statusCounts, error: countErr } = await this.supabase
      .from('scheduled_posts')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['published', 'failed', 'retrying'])

    if (countErr) throw countErr

    let failedCount = 0
    let attemptedCount = 0
    for (const p of statusCounts ?? []) {
      attemptedCount++
      if (p.status === 'failed') {
        failedCount++
      }
    }
    const failureRate = attemptedCount > 0
      ? parseFloat(((failedCount / attemptedCount) * 100).toFixed(2))
      : 0

    // 6. recentActivity: last 10 audit log entries
    const { data: logs, error: logsError } = await this.supabase
      .from('audit_log')
      .select('id, user_id, post_id, action, platform, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(10)

    if (logsError) throw logsError

    const recentActivity = (logs ?? []).map((log: any): ActivityEvent => ({
      id: log.id,
      userId: log.user_id,
      postId: log.post_id,
      action: log.action as any,
      platform: log.platform as any,
      occurredAt: new Date(log.occurred_at),
    }))

    return {
      totalPostsPublished: totalPostsPublished ?? 0,
      postsThisWeek: postsThisWeek ?? 0,
      avgViewsPerPost,
      failureRate,
      upcomingPostsCount: upcomingPostsCount ?? 0,
      recentActivity,
    }
  }

  // ---------------------------------------------------------------------------
  // getEngagementTrend
  // ---------------------------------------------------------------------------

  /**
   * Return engagement trend points for a channel within the past period.
   * Granularities: 'day' (last 30 days), 'week' (last 12 weeks), 'month' (last 12 months).
   * Missing periods are filled with value = 0.
   */
  async getEngagementTrend(
    channelId: string,
    granularity: 'day' | 'week' | 'month' = 'day',
  ): Promise<TrendPoint[]> {
    const now = new Date()
    let fromDate: Date
    const trendMap = new Map<string, TrendPoint>()
    const periods: { date: Date; label: string; key: string }[] = []

    if (granularity === 'day') {
      // Last 30 days including today (UTCDay start)
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
        const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
        periods.push({ date: d, label: key, key })
      }
      fromDate = periods[0].date
    } else if (granularity === 'week') {
      // Last 12 weeks including current week
      const currentDay = now.getUTCDay()
      const diffToMonday = currentDay === 0 ? 6 : currentDay - 1
      const startOfCurrentWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday))
      
      for (let i = 11; i >= 0; i--) {
        const d = new Date(startOfCurrentWeek.getTime() - i * 7 * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        periods.push({ date: d, label: key, key })
      }
      fromDate = periods[0].date
    } else {
      // granularity === 'month'
      // Last 12 months including current month
      const startOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(startOfCurrentMonth.getUTCFullYear(), startOfCurrentMonth.getUTCMonth() - i, 1))
        const key = d.toISOString().slice(0, 7) // YYYY-MM
        periods.push({ date: d, label: key, key })
      }
      fromDate = periods[0].date
    }

    // Initialize trend points with value = 0
    for (const p of periods) {
      trendMap.set(p.key, {
        date: p.date,
        value: 0,
        label: p.label,
      })
    }

    // Fetch posts for the channel in range
    const { data: posts, error: postsError } = await this.supabase
      .from('scheduled_posts')
      .select('id, published_at')
      .eq('channel_id', channelId)
      .eq('status', 'published')
      .gte('published_at', fromDate.toISOString())
      .lte('published_at', now.toISOString())

    if (postsError) throw postsError

    if (posts && posts.length > 0) {
      const postIds = posts.map((p: any) => p.id)
      const { data: metricsRows, error: metricsError } = await this.supabase
        .from('post_metrics')
        .select('post_id, views')
        .in('post_id', postIds)

      if (metricsError && !isTableNotFound(metricsError)) {
        throw metricsError
      }

      const viewsMap = new Map<string, number>()
      for (const row of metricsRows ?? []) {
        viewsMap.set(row.post_id, Math.max(0, row.views ?? 0))
      }

      for (const post of posts) {
        const publishedAt = new Date(post.published_at)
        let key = ''
        if (granularity === 'day') {
          key = publishedAt.toISOString().slice(0, 10)
        } else if (granularity === 'week') {
          // Find Monday of the publishedAt date
          const day = publishedAt.getUTCDay()
          const diff = day === 0 ? 6 : day - 1
          const monday = new Date(Date.UTC(publishedAt.getUTCFullYear(), publishedAt.getUTCMonth(), publishedAt.getUTCDate() - diff))
          key = monday.toISOString().slice(0, 10)
        } else {
          key = publishedAt.toISOString().slice(0, 7)
        }

        const point = trendMap.get(key)
        if (point) {
          const views = viewsMap.get(post.id) ?? 0
          point.value += views
        }
      }
    }

    return Array.from(trendMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
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
