import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  ScheduledPost,
  PublishError,
  AlertService,
  SocialPlatform,
  PostStatus,
  PublishErrorCode,
} from '@director-ai/types';
import {
  RetryEngineImpl,
  computeBaseDelay,
  computeBackoffDelay,
} from './retry-engine';
import { PublisherRegistry, BasePublisher } from './publisher/social-media-publisher.interface';
import {
  PlatformCapabilities,
  ChannelConfig,
  PublishResult,
} from '@director-ai/types';

function createBasePost(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'post-1',
    userId: 'user-1',
    platform: 'telegram',
    channelId: 'channel-1',
    content: { text: 'Hello world' },
    scheduledAt: new Date(Date.now() + 3600000),
    status: 'publishing',
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const retryableError: PublishError = {
  code: 'NETWORK_ERROR',
  message: 'Network error',
  retryable: true,
};

const nonRetryableError: PublishError = {
  code: 'INVALID_TOKEN',
  message: 'Invalid token',
  retryable: false,
};

class ConfigurablePublisher extends BasePublisher {
  readonly platform: SocialPlatform = 'telegram';
  protected capabilities: PlatformCapabilities = {
    maxTextLength: 4096,
    supportsImages: true,
    supportsVideo: true,
    supportsAudio: true,
    supportsPDFs: true,
    supportsCarousel: false,
    supportsScheduledEdit: false,
  };

  constructor(private result: PublishResult) {
    super();
  }

  setResult(result: PublishResult): void {
    this.result = result;
  }

  protected async doPublish(): Promise<PublishResult> {
    return this.result;
  }

  async delete(): Promise<void> {}
  async edit(): Promise<PublishResult> {
    return this.result;
  }
}

interface MockStore {
  post: ScheduledPost;
  auditLogs: Record<string, unknown>[];
  updates: Record<string, unknown>[];
}

function createMockSupabase(store: MockStore) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'scheduled_posts') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              store.updates.push(payload);
              if (payload.status) store.post.status = payload.status as PostStatus;
              if (payload.retry_count !== undefined) {
                store.post.retryCount = payload.retry_count as number;
              }
              if (payload.next_retry_at) {
                store.post.nextRetryAt = new Date(payload.next_retry_at as string);
              }
              if (payload.platform_message_id) {
                store.post.platformMessageId = payload.platform_message_id as string;
              }
              if (payload.published_at) {
                store.post.publishedAt = new Date(payload.published_at as string);
              }
              return { error: null, data: null };
            }),
          })),
          select: vi.fn((query?: string) => {
            if (query?.includes('channels!inner')) {
              return {
                eq: vi.fn(() => ({
                  lte: vi.fn(async () => ({
                    data: [
                      {
                        id: store.post.id,
                        user_id: store.post.userId,
                        channel_id: store.post.channelId,
                        platform: store.post.platform,
                        text_content: store.post.content.text ?? null,
                        media_asset_ids: store.post.content.mediaAssetIds ?? [],
                        media_type: store.post.content.mediaType ?? null,
                        scheduled_at: store.post.scheduledAt.toISOString(),
                        status: store.post.status,
                        retry_count: store.post.retryCount,
                        max_retries: store.post.maxRetries,
                        platform_message_id: store.post.platformMessageId ?? null,
                        published_at: store.post.publishedAt?.toISOString() ?? null,
                        next_retry_at: store.post.nextRetryAt?.toISOString() ?? null,
                        recurrence_rule_id: null,
                        parent_post_id: null,
                        created_at: store.post.createdAt.toISOString(),
                        updated_at: store.post.updatedAt.toISOString(),
                        channels: {
                          id: store.post.channelId,
                          platform: store.post.platform,
                          channel_identifier: '@test',
                          user_id: store.post.userId,
                        },
                      },
                    ],
                    error: null,
                  })),
                })),
              };
            }
            return {
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: store.post.id,
                    status: store.post.status,
                    retry_count: store.post.retryCount,
                    max_retries: store.post.maxRetries,
                    next_retry_at: store.post.nextRetryAt?.toISOString() ?? null,
                  },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      if (table === 'audit_log') {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            store.auditLogs.push(payload);
            return { error: null };
          }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: store.auditLogs, error: null })),
                })),
              })),
            })),
          })),
        };
      }

      return {};
    }),
  };
}

describe('RetryEngine', () => {
  let store: MockStore;
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let alertService: AlertService;
  let publisher: ConfigurablePublisher;
  let registry: PublisherRegistry;
  let engine: RetryEngineImpl;

  beforeEach(() => {
    store = {
      post: createBasePost(),
      auditLogs: [],
      updates: [],
    };
    mockSupabase = createMockSupabase(store);
    alertService = {
      notify: vi.fn().mockResolvedValue(undefined),
      getNotifications: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      subscribeToRealtime: vi.fn(),
    };
    publisher = new ConfigurablePublisher({
      success: false,
      platformMessageId: '',
      publishedAt: new Date(),
      platform: 'telegram',
      error: retryableError,
    });
    registry = new PublisherRegistry();
    registry.register('telegram', publisher);
    engine = new RetryEngineImpl(
      registry,
      alertService,
      mockSupabase as never,
      () => 0.5,
    );
  });

  describe('enqueue', () => {
    it('enqueues retryable error with incremented retry count', async () => {
      await engine.enqueue(store.post, retryableError);

      expect(store.post.status).toBe('retrying');
      expect(store.post.retryCount).toBe(1);
      expect(store.post.nextRetryAt).toBeDefined();
      expect(alertService.notify).toHaveBeenCalledWith(
        store.post.userId,
        expect.objectContaining({ type: 'post_retrying' }),
      );
      expect(store.auditLogs.some((log) => log.action === 'retried')).toBe(true);
    });

    it('moves non-retryable error to failed without incrementing retry count', async () => {
      await engine.enqueue(store.post, nonRetryableError);

      expect(store.post.status).toBe('failed');
      expect(store.post.retryCount).toBe(0);
      expect(alertService.notify).toHaveBeenCalledWith(
        store.post.userId,
        expect.objectContaining({ type: 'retry_exhausted' }),
      );
    });

    it('moves to failed with alert when retries are exhausted', async () => {
      store.post.retryCount = 3;
      store.post.maxRetries = 3;

      await engine.enqueue(store.post, retryableError);

      expect(store.post.status).toBe('failed');
      expect(store.post.retryCount).toBe(3);
      expect(alertService.notify).toHaveBeenCalledWith(
        store.post.userId,
        expect.objectContaining({ type: 'retry_exhausted' }),
      );
    });
  });

  describe('processQueue', () => {
    it('sets status to published with audit entry on successful retry', async () => {
      store.post.status = 'retrying';
      store.post.retryCount = 1;
      store.post.nextRetryAt = new Date(Date.now() - 1000);

      publisher.setResult({
        success: true,
        platformMessageId: 'msg-999',
        publishedAt: new Date(),
        platform: 'telegram',
      });

      await engine.processQueue();

      expect(store.post.status).toBe('published');
      expect(store.post.platformMessageId).toBe('msg-999');
      expect(store.auditLogs.some((log) => log.action === 'published')).toBe(true);
      expect(alertService.notify).toHaveBeenCalledWith(
        store.post.userId,
        expect.objectContaining({ type: 'post_published' }),
      );
    });

    it('re-enqueues on retryable failure during processQueue', async () => {
      store.post.status = 'retrying';
      store.post.retryCount = 1;
      store.post.maxRetries = 3;
      store.post.nextRetryAt = new Date(Date.now() - 1000);

      await engine.processQueue();

      expect(store.post.status).toBe('retrying');
      expect(store.post.retryCount).toBe(2);
    });
  });

  describe('backoff helpers', () => {
    it('caps delay at 300000ms', () => {
      expect(computeBaseDelay(20)).toBe(300000);
    });

    it('adds jitter up to 10% of base delay', () => {
      const base = computeBaseDelay(2);
      const withJitter = computeBackoffDelay(2, () => 1);
      expect(withJitter).toBe(base + base * 0.1);
    });
  });

  describe('Property 2: Retry Count Monotonicity', () => {
    it('retryCount is non-decreasing across arbitrary enqueue sequences', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.array(fc.boolean(), { minLength: 1, maxLength: 15 }),
          async (maxRetries, retryableFlags) => {
            const localStore: MockStore = {
              post: createBasePost({ maxRetries, retryCount: 0, status: 'publishing' }),
              auditLogs: [],
              updates: [],
            };
            const localEngine = new RetryEngineImpl(
              registry,
              alertService,
              createMockSupabase(localStore) as never,
              () => 0,
            );

            const counts = [localStore.post.retryCount];

            for (const retryable of retryableFlags) {
              if (localStore.post.status === 'failed') break;

              const error: PublishError = {
                code: retryable ? 'NETWORK_ERROR' : 'INVALID_TOKEN',
                message: 'err',
                retryable,
              };

              await localEngine.enqueue({ ...localStore.post }, error);
              counts.push(localStore.post.retryCount);
            }

            for (let i = 1; i < counts.length; i++) {
              expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
            }
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  describe('Property 3: Max Retries Bound', () => {
    it('retryCount never exceeds maxRetries for arbitrary failure sequences', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 20 }),
          async (maxRetries, attemptCount) => {
            const localStore: MockStore = {
              post: createBasePost({ maxRetries, retryCount: 0, status: 'publishing' }),
              auditLogs: [],
              updates: [],
            };
            const localEngine = new RetryEngineImpl(
              registry,
              alertService,
              createMockSupabase(localStore) as never,
              () => 0,
            );

            for (let i = 0; i < attemptCount; i++) {
              if (localStore.post.status === 'failed') break;
              await localEngine.enqueue({ ...localStore.post }, retryableError);
            }

            expect(localStore.post.retryCount).toBeLessThanOrEqual(maxRetries);
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  describe('Property 10: Backoff Strictly Increasing', () => {
    it('delay(n+1) >= delay(n) * 0.9 for retryCount in [0, 9]', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 8 }), (n) => {
          const delayN = computeBackoffDelay(n, () => 0);
          const delayNPlus1 = computeBackoffDelay(n + 1, () => 0);
          expect(delayNPlus1).toBeGreaterThanOrEqual(delayN * 0.9);
        }),
      );
    });

    it('jitter never exceeds 10% of base delay', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 9 }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (retryCount, randomValue) => {
            const base = computeBaseDelay(retryCount);
            const total = computeBackoffDelay(retryCount, () => randomValue);
            expect(total).toBeGreaterThanOrEqual(base);
            expect(total).toBeLessThanOrEqual(base * 1.1 + Number.EPSILON);
          },
        ),
      );
    });
  });
});
