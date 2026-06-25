import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MetricsServiceImpl } from '../metrics.service'
import { RawPlatformMetrics, DateRange } from '@director-ai/types'

describe('MetricsService backend implementation', () => {
  let mockSupabase: any
  let metricsService: MetricsServiceImpl

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    }
    metricsService = new MetricsServiceImpl(mockSupabase)
  })

  describe('ingestMetrics', () => {
    it('successfully queries the post ID by platformMessageId and upserts metrics', async () => {
      const mockPost = { id: 'post-uuid-123' }
      
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockPost, error: null }),
        }),
      })

      const upsertMock = vi.fn().mockResolvedValue({ error: null })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return { select: selectMock }
        }
        if (table === 'post_metrics') {
          return { upsert: upsertMock }
        }
        return null
      })

      const rawMetrics: RawPlatformMetrics = {
        views: 150,
        reactions: { '👍': 10 },
        forwards: 5,
        replies: 2,
        measuredAt: new Date('2026-06-24T12:00:00Z'),
      }

      await metricsService.ingestMetrics('msg-id-telegram', rawMetrics)

      expect(mockSupabase.from).toHaveBeenCalledWith('scheduled_posts')
      expect(selectMock).toHaveBeenCalledWith('id')
      expect(mockSupabase.from).toHaveBeenCalledWith('post_metrics')
      expect(upsertMock).toHaveBeenCalledWith(
        {
          post_id: 'post-uuid-123',
          platform_message_id: 'msg-id-telegram',
          views: 150,
          reactions: { '👍': 10 },
          forwards: 5,
          replies: 2,
          measured_at: '2026-06-24T12:00:00.000Z',
        },
        { onConflict: 'post_id' }
      )
    })

    it('returns early if the post does not exist', async () => {
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })

      mockSupabase.from.mockReturnValue({ select: selectMock })

      const rawMetrics: RawPlatformMetrics = {
        views: 150,
        reactions: { '👍': 10 },
        forwards: 5,
        replies: 2,
        measuredAt: new Date(),
      }

      await metricsService.ingestMetrics('msg-non-existent', rawMetrics)

      expect(mockSupabase.from).toHaveBeenCalledWith('scheduled_posts')
      expect(mockSupabase.from).not.toHaveBeenCalledWith('post_metrics')
    })
  })

  describe('getPostMetrics', () => {
    it('returns the latest mapped PostMetrics snapshot for a post', async () => {
      const dbRow = {
        post_id: 'post-1',
        platform_message_id: 'msg-1',
        views: 100,
        reactions: { '👍': 5 },
        forwards: 2,
        replies: 1,
        measured_at: '2026-06-24T12:00:00Z',
      }

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: dbRow, error: null }),
            }),
          }),
        }),
      })

      mockSupabase.from.mockReturnValue({ select: selectMock })

      const result = await metricsService.getPostMetrics('post-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('post_metrics')
      expect(result).toEqual({
        postId: 'post-1',
        platformMessageId: 'msg-1',
        views: 100,
        reactions: { '👍': 5 },
        forwards: 2,
        replies: 1,
        measuredAt: new Date('2026-06-24T12:00:00Z'),
      })
    })

    it('returns null if there are no metrics', async () => {
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      })

      mockSupabase.from.mockReturnValue({ select: selectMock })

      const result = await metricsService.getPostMetrics('post-non-existent')
      expect(result).toBeNull()
    })
  })

  describe('getChannelSummary', () => {
    it('correctly aggregates posts views and engagement rates', async () => {
      const mockPosts = [
        { id: 'post-1', platform: 'telegram' },
        { id: 'post-2', platform: 'telegram' },
      ]

      const selectPostsMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: mockPosts, error: null }),
            }),
          }),
        }),
      })

      const mockMetrics = [
        {
          post_id: 'post-1',
          platform_message_id: 'msg-1',
          views: 100,
          reactions: { '👍': 5, '🔥': 2 }, // 7 engagement actions
          forwards: 3,
          replies: 0,
          measured_at: '2026-06-24T12:00:00Z',
        },
        {
          post_id: 'post-2',
          platform_message_id: 'msg-2',
          views: 200,
          reactions: { '👍': 10 }, // 10 engagement actions
          forwards: 5,
          replies: 5,
          measured_at: '2026-06-24T12:00:00Z',
        },
      ]

      const selectMetricsMock = vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockMetrics, error: null }),
        }),
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return { select: selectPostsMock }
        }
        if (table === 'post_metrics') {
          return { select: selectMetricsMock }
        }
        return null
      })

      const dateRange: DateRange = {
        from: new Date('2026-06-01T00:00:00Z'),
        to: new Date('2026-06-30T23:59:59Z'),
      }

      const summary = await metricsService.getChannelSummary('channel-123', dateRange)

      expect(summary).not.toBeNull()
      expect(summary?.totalPosts).toBe(2)
      expect(summary?.totalViews).toBe(300) // 100 + 200
      // Total engagement: (7+3+0) [post-1] + (10+5+5) [post-2] = 10 + 20 = 30
      // Engagement Rate: (30 / 300) * 100 = 10%
      expect(summary?.avgEngagementRate).toBe(10)
      expect(summary?.topPost.postId).toBe('post-2') // post-2 has 200 views vs post-1 has 100 views
    })
  })

  describe('getEngagementTrend', () => {
    it('returns exactly 30 points for day granularity with gaps filled with 0', async () => {
      const selectPostsMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      })

      mockSupabase.from.mockReturnValue({ select: selectPostsMock })

      const trend = await metricsService.getEngagementTrend('channel-123', 'day')

      expect(trend).toHaveLength(30)
      expect(trend[0].value).toBe(0)
      expect(trend[29].value).toBe(0)
      expect(trend[29].date.getTime()).toBeGreaterThan(trend[0].date.getTime())
    })

    it('returns exactly 12 points for week granularity', async () => {
      const selectPostsMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      })

      mockSupabase.from.mockReturnValue({ select: selectPostsMock })

      const trend = await metricsService.getEngagementTrend('channel-123', 'week')

      expect(trend).toHaveLength(12)
    })

    it('returns exactly 12 points for month granularity', async () => {
      const selectPostsMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      })

      mockSupabase.from.mockReturnValue({ select: selectPostsMock })

      const trend = await metricsService.getEngagementTrend('channel-123', 'month')

      expect(trend).toHaveLength(12)
    })
  })

  describe('getDashboardMetrics', () => {
    it('correctly calculates total posts, failure rate, average views, and returns recent activity', async () => {
      const createChain = (dataOrCount: any, isCount = false) => {
        const chain: any = {}
        const fn = vi.fn().mockImplementation(() => chain)
        chain.eq = fn
        chain.gte = fn
        chain.gt = fn
        chain.in = fn
        chain.order = fn
        chain.limit = fn
        chain.then = (onfulfilled: any) => {
          const res = isCount ? { count: dataOrCount, error: null } : { data: dataOrCount, error: null }
          return Promise.resolve(res).then(onfulfilled)
        }
        return chain
      }

      let countCall = 0
      const selectCountMock = vi.fn().mockImplementation(() => {
        countCall++
        let countVal = 0
        if (countCall === 1) countVal = 10
        else if (countCall === 2) countVal = 3
        else if (countCall === 3) countVal = 5
        return createChain(countVal, true)
      })

      const selectPubListMock = vi.fn().mockImplementation(() => {
        return createChain([{ id: 'p1' }, { id: 'p2' }])
      })

      const selectStatusMock = vi.fn().mockImplementation(() => {
        return createChain([
          { status: 'published' },
          { status: 'published' },
          { status: 'failed' },
        ])
      })

      const selectMetricsMock = vi.fn().mockImplementation(() => {
        return createChain([{ views: 100 }, { views: 200 }])
      })

      const mockLogs = [
        {
          id: 'log-1',
          user_id: 'user-123',
          post_id: 'p1',
          action: 'published',
          platform: 'telegram',
          occurred_at: '2026-06-24T12:00:00Z',
        },
      ]
      const selectLogsMock = vi.fn().mockImplementation(() => {
        return createChain(mockLogs)
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return {
            select: (projection: string, options?: any) => {
              if (options?.count === 'exact') {
                return selectCountMock()
              }
              if (projection === 'id') {
                return selectPubListMock()
              }
              if (projection === 'status') {
                return selectStatusMock()
              }
              return null
            },
          }
        }
        if (table === 'post_metrics') {
          return { select: selectMetricsMock }
        }
        if (table === 'audit_log') {
          return { select: selectLogsMock }
        }
        return null
      })

      const metrics = await metricsService.getDashboardMetrics('user-123')

      expect(metrics.totalPostsPublished).toBe(10)
      expect(metrics.postsThisWeek).toBe(3)
      expect(metrics.upcomingPostsCount).toBe(5)
      expect(metrics.avgViewsPerPost).toBe(150)
      expect(metrics.failureRate).toBe(33.33)
      expect(metrics.recentActivity).toHaveLength(1)
      expect(metrics.recentActivity[0]).toEqual({
        id: 'log-1',
        userId: 'user-123',
        postId: 'p1',
        action: 'published',
        platform: 'telegram',
        occurredAt: new Date('2026-06-24T12:00:00Z'),
      })
    })
  })
})

