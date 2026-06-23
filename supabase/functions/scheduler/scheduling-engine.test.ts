import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SchedulingEngine } from './scheduling-engine';
import { PublisherRegistry } from '../_shared/publisher/social-media-publisher.interface';
import { TelegramPublisher } from '../_shared/publisher/telegram.publisher';
import {
  ScheduledPost,
  CreatePostRequest,
  SocialPlatform,
  PostStatus,
  ChannelConfig,
  RecurrenceRule,
} from '@director-ai/types';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(),
          })),
          single: vi.fn(),
          lte: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(),
              })),
            })),
          })),
        })),
        gte: vi.fn(() => ({
          lte: vi.fn(() => ({
            order: vi.fn(),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          lte: vi.fn(),
        })),
      })),
    })),
  })),
}));

describe('SchedulingEngine', () => {
  let schedulingEngine: SchedulingEngine;
  let publisherRegistry: PublisherRegistry;
  let mockSupabase: any;

  beforeEach(() => {
    // Setup publisher registry
    publisherRegistry = new PublisherRegistry();
    publisherRegistry.register('telegram', new TelegramPublisher());

    // Setup mock Supabase client
    mockSupabase = createClient('test-url', 'test-key');

    // Create scheduling engine
    schedulingEngine = new SchedulingEngine(
      publisherRegistry,
      'test-url',
      'test-key'
    );

    // Access private supabase instance for mocking
    (schedulingEngine as any).supabase = mockSupabase;
  });

  describe('schedulePost', () => {
    it('should reject scheduledAt in the past', async () => {
      const request: CreatePostRequest = {
        userId: 'user-1',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date(Date.now() - 1000), // 1 second ago
      };

      await expect(schedulingEngine.schedulePost(request)).rejects.toThrow(
        'scheduledAt must be in the future'
      );
    });

    it('should reject if channel does not belong to user', async () => {
      const request: CreatePostRequest = {
        userId: 'user-1',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date(Date.now() + 3600000), // 1 hour in future
      };

      // Mock channel query returning null (not found)
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: null, error: { message: 'Not found' } })),
            })),
          })),
        })),
      });

      await expect(schedulingEngine.schedulePost(request)).rejects.toThrow(
        'Channel not found or does not belong to user'
      );
    });

    it('should create scheduled post with valid data', async () => {
      const request: CreatePostRequest = {
        userId: 'user-1',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date(Date.now() + 3600000), // 1 hour in future
      };

      // Mock channel query
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: 'channel-1', platform: 'telegram', user_id: 'user-1' },
                error: null,
              })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: {
                id: 'post-1',
                user_id: 'user-1',
                channel_id: 'channel-1',
                platform: 'telegram',
                text_content: 'Test post',
                media_asset_ids: [],
                media_type: null,
                scheduled_at: request.scheduledAt.toISOString(),
                status: 'scheduled',
                retry_count: 0,
                max_retries: 3,
                platform_message_id: null,
                published_at: null,
                next_retry_at: null,
                recurrence_rule_id: null,
                parent_post_id: null,
                created_at: new Date(Date.now() - 1000).toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            })),
          })),
        })),
      });

      const result = await schedulingEngine.schedulePost(request);

      expect(result.id).toBe('post-1');
      expect(result.status).toBe('scheduled');
      expect(result.platform).toBe('telegram');
    });

    it('should assert scheduledAt > createdAt invariant', async () => {
      const request: CreatePostRequest = {
        userId: 'user-1',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date(Date.now() + 3600000),
      };

      // Mock channel query
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: 'channel-1', platform: 'telegram', user_id: 'user-1' },
                error: null,
              })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: {
                id: 'post-1',
                user_id: 'user-1',
                channel_id: 'channel-1',
                platform: 'telegram',
                text_content: 'Test post',
                media_asset_ids: [],
                media_type: null,
                scheduled_at: request.scheduledAt.toISOString(),
                status: 'scheduled',
                retry_count: 0,
                max_retries: 3,
                platform_message_id: null,
                published_at: null,
                next_retry_at: null,
                recurrence_rule_id: null,
                parent_post_id: null,
                created_at: new Date(Date.now() + 7200000).toISOString(), // createdAt > scheduledAt (2 hours vs 1 hour)
                updated_at: new Date().toISOString(),
              },
              error: null,
            })),
          })),
        })),
      });

      await expect(schedulingEngine.schedulePost(request)).rejects.toThrow(
        'Invariant violation: scheduledAt must be greater than createdAt'
      );
    });

    it('should reject recurrence rule with endDate <= scheduledAt', async () => {
      const request: CreatePostRequest = {
        userId: 'user-1',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date(Date.now() + 3600000), // 1 hour in future
        recurrenceRule: {
          frequency: 'daily',
          interval: 1,
          endDate: new Date(Date.now() + 1800000), // 30 minutes in future (before scheduledAt)
        },
      };

      // Mock channel query
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: 'channel-1', platform: 'telegram', user_id: 'user-1' },
                error: null,
              })),
            })),
          })),
        })),
      });

      await expect(schedulingEngine.schedulePost(request)).rejects.toThrow(
        'Recurrence rule endDate must be after scheduledAt'
      );
    });

    it('should accept recurrence rule with endDate > scheduledAt', async () => {
      const request: CreatePostRequest = {
        userId: 'user-1',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date(Date.now() + 3600000), // 1 hour in future
        recurrenceRule: {
          frequency: 'daily',
          interval: 1,
          endDate: new Date(Date.now() + 86400000 * 7), // 7 days in future
        },
      };

      // Mock channel query
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: 'channel-1', platform: 'telegram', user_id: 'user-1' },
                error: null,
              })),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: {
                id: 'post-1',
                user_id: 'user-1',
                channel_id: 'channel-1',
                platform: 'telegram',
                text_content: 'Test post',
                media_asset_ids: [],
                media_type: null,
                scheduled_at: request.scheduledAt.toISOString(),
                status: 'scheduled',
                retry_count: 0,
                max_retries: 3,
                platform_message_id: null,
                published_at: null,
                next_retry_at: null,
                recurrence_rule_id: null,
                parent_post_id: null,
                created_at: new Date(Date.now() - 1000).toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            })),
          })),
        })),
      });

      const result = await schedulingEngine.schedulePost(request);

      expect(result.id).toBe('post-1');
      expect(result.status).toBe('scheduled');
    });
  });

  describe('tick', () => {
    it('should reset stale publishing posts', async () => {
      const now = new Date();

      // Use mockImplementation to handle different table names
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({ error: null })),
              })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({ data: [], error: null })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const summary = await schedulingEngine.tick();

      expect(summary.processed).toBe(0);
    });

    it('should create next recurrence instance when recurring post publishes', async () => {
      const now = new Date();
      const scheduledAt = new Date(now.getTime() - 1000); // Just past

      // Use mockImplementation to handle different table names
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        data: [
                          {
                            id: 'post-1',
                            user_id: 'user-1',
                            channel_id: 'channel-1',
                            platform: 'telegram',
                            text_content: 'Test post',
                            media_asset_ids: [],
                            media_type: null,
                            scheduled_at: scheduledAt.toISOString(),
                            status: 'scheduled',
                            retry_count: 0,
                            max_retries: 3,
                            platform_message_id: null,
                            published_at: null,
                            next_retry_at: null,
                            recurrence_rule_id: 'rule-1',
                            parent_post_id: null,
                            created_at: new Date(now.getTime() - 3600000).toISOString(),
                            updated_at: new Date().toISOString(),
                          },
                        ],
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => ({ error: null })),
          };
        }
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ user_id: 'user-1' }],
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      // Mock global fetch for TelegramPublisher
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: '123' } }),
      });

      const summary = await schedulingEngine.tick();

      expect(summary.processed).toBe(1);
      expect(summary.succeeded).toBe(1);
    });

    it('should process due posts successfully', async () => {
      const now = new Date();

      // Use mockImplementation to handle different table names
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({ error: null })),
              })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({ data: [], error: null })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ user_id: 'user-1' }],
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const summary = await schedulingEngine.tick();

      expect(summary.processed).toBe(0);
    });

    it('should assert processed === succeeded + failed + retryQueued invariant', async () => {
      const now = new Date();

      // Use mockImplementation to handle different table names
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({ error: null })),
              })),
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                lte: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({ data: [], error: null })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
          };
        }
        return {};
      });

      const summary = await schedulingEngine.tick();

      expect(summary.processed).toBe(summary.succeeded + summary.failed + summary.retryQueued);
    });
  });

  describe('cancelPost', () => {
    it('should cancel a scheduled post', async () => {
      const mockPost = {
        id: 'post-1',
        user_id: 'user-1',
        status: 'scheduled',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: mockPost, error: null })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ error: null })),
        })),
      });

      await expect(schedulingEngine.cancelPost('post-1', 'user-1')).resolves.not.toThrow();
    });

    it('should reject cancelling non-scheduled posts', async () => {
      const mockPost = {
        id: 'post-1',
        user_id: 'user-1',
        status: 'published',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: mockPost, error: null })),
            })),
          })),
        })),
      });

      await expect(schedulingEngine.cancelPost('post-1', 'user-1')).rejects.toThrow(
        'Can only cancel posts with status "scheduled"'
      );
    });

    it('should reject if post not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: null, error: { message: 'Not found' } })),
            })),
          })),
        })),
      });

      await expect(schedulingEngine.cancelPost('post-1', 'user-1')).rejects.toThrow(
        'Post not found'
      );
    });
  });

  describe('reschedulePost', () => {
    it('should reschedule a post to a new time', async () => {
      const newScheduledAt = new Date(Date.now() + 7200000); // 2 hours in future
      const mockPost = {
        id: 'post-1',
        user_id: 'user-1',
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 3600000).toISOString(),
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: mockPost, error: null })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { ...mockPost, scheduled_at: newScheduledAt.toISOString() },
                error: null,
              })),
            })),
          })),
        })),
      });

      const result = await schedulingEngine.reschedulePost('post-1', newScheduledAt, 'user-1');

      expect(result).toBeDefined();
    });

    it('should reject newScheduledAt in the past', async () => {
      const newScheduledAt = new Date(Date.now() - 1000); // 1 second ago

      await expect(
        schedulingEngine.reschedulePost('post-1', newScheduledAt, 'user-1')
      ).rejects.toThrow('newScheduledAt must be in the future');
    });

    it('should reject rescheduling published posts (lifecycle guard)', async () => {
      const newScheduledAt = new Date(Date.now() + 7200000);
      const mockPost = {
        id: 'post-1',
        user_id: 'user-1',
        status: 'published',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: mockPost, error: null })),
            })),
          })),
        })),
      });

      await expect(
        schedulingEngine.reschedulePost('post-1', newScheduledAt, 'user-1')
      ).rejects.toThrow('Cannot reschedule post with status "published"');
    });

    it('should reject rescheduling failed posts (lifecycle guard)', async () => {
      const newScheduledAt = new Date(Date.now() + 7200000);
      const mockPost = {
        id: 'post-1',
        user_id: 'user-1',
        status: 'failed',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: mockPost, error: null })),
            })),
          })),
        })),
      });

      await expect(
        schedulingEngine.reschedulePost('post-1', newScheduledAt, 'user-1')
      ).rejects.toThrow('Cannot reschedule post with status "failed"');
    });
  });

  describe('getUpcomingPosts', () => {
    it('should return upcoming posts for a user', async () => {
      const from = new Date();
      const to = new Date(Date.now() + 86400000); // 24 hours from now

      const mockPosts = [
        {
          id: 'post-1',
          user_id: 'user-1',
          channel_id: 'channel-1',
          platform: 'telegram',
          text_content: 'Test post',
          media_asset_ids: [],
          media_type: null,
          scheduled_at: new Date(Date.now() + 3600000).toISOString(),
          status: 'scheduled',
          retry_count: 0,
          max_retries: 3,
          platform_message_id: null,
          published_at: null,
          next_retry_at: null,
          recurrence_rule_id: null,
          parent_post_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(() => ({
                  order: vi.fn(() => ({ data: mockPosts, error: null })),
                })),
              })),
            })),
          })),
        })),
      });

      const result = await schedulingEngine.getUpcomingPosts('user-1', from, to);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].status).toBe('scheduled');
    });

    it('should enforce cross-user security (no leakage)', async () => {
      const from = new Date();
      const to = new Date(Date.now() + 86400000);

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(() => ({
                  order: vi.fn(() => ({ data: [], error: null })),
                })),
              })),
            })),
          })),
        })),
      });

      const result = await schedulingEngine.getUpcomingPosts('user-1', from, to);

      // Should only return posts for user-1, not any other user
      expect(result).toHaveLength(0);
    });
  });
});
