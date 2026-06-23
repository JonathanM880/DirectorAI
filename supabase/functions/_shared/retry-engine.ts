import { SupabaseClient } from '@supabase/supabase-js';
import {
  ScheduledPost,
  PublishError,
  RetryEngine,
  RetryStatus,
  RetryRecord,
  SocialPlatform,
  PostStatus,
  ChannelConfig,
  AlertService,
} from '@director-ai/types';
import { PublisherRegistry } from './publisher/social-media-publisher.interface';

export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 300000;

interface DbScheduledPost {
  id: string;
  user_id: string;
  channel_id: string;
  platform: string;
  text_content: string | null;
  media_asset_ids: string[];
  media_type: string | null;
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
}

interface DbChannel {
  id: string;
  platform: string;
  channel_identifier: string;
  user_id: string;
}

/**
 * Computes the base exponential backoff delay for a given retry count.
 * delay = MIN(1000 * (2 ^ retryCount), 300000)
 */
export function computeBaseDelay(retryCount: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
}

/**
 * Computes total backoff delay including up to 10% random jitter.
 */
export function computeBackoffDelay(
  retryCount: number,
  random: () => number = Math.random,
): number {
  const delay = computeBaseDelay(retryCount);
  const jitter = random() * delay * 0.1;
  return delay + jitter;
}

/**
 * Guard: retryCount must not exceed maxRetries before increment.
 * Guard: retryCount must never decrease.
 */
export function assertRetryCountWrite(
  currentCount: number,
  newCount: number,
  maxRetries: number,
): void {
  if (currentCount >= maxRetries) {
    throw new Error(
      `retryCount increment rejected: ${currentCount} >= maxRetries ${maxRetries}`,
    );
  }
  if (newCount <= currentCount) {
    throw new Error(
      `retryCount monotonicity violation: ${newCount} <= ${currentCount}`,
    );
  }
  if (newCount > maxRetries) {
    throw new Error(
      `retryCount bound violation: ${newCount} > maxRetries ${maxRetries}`,
    );
  }
}

/**
 * RetryEngine manages exponential-backoff retry queues for failed publish attempts.
 * Implements Algorithm 2 from the design document.
 */
export class RetryEngineImpl implements RetryEngine {
  constructor(
    private publisherRegistry: PublisherRegistry,
    private alertService: AlertService,
    private supabase: SupabaseClient,
    private random: () => number = Math.random,
  ) {}

  /**
   * Enqueue a post for retry after a retryable publish failure,
   * or mark it failed when retries are exhausted or the error is non-retryable.
   */
  async enqueue(post: ScheduledPost, error: PublishError): Promise<void> {
    if (error.retryable && post.retryCount < post.maxRetries) {
      const newRetryCount = post.retryCount + 1;
      assertRetryCountWrite(post.retryCount, newRetryCount, post.maxRetries);

      const nextRetryAt = new Date(
        Date.now() + computeBackoffDelay(newRetryCount, this.random),
      );

      const { error: updateError } = await this.supabase
        .from('scheduled_posts')
        .update({
          status: 'retrying',
          retry_count: newRetryCount,
          next_retry_at: nextRetryAt.toISOString(),
        })
        .eq('id', post.id);

      if (updateError) {
        throw new Error(`Failed to enqueue post for retry: ${updateError.message}`);
      }

      await this.alertService.notify(post.userId, {
        type: 'post_retrying',
        severity: 'warning',
        title: 'Post retrying',
        message: 'Publish failed; retrying shortly.',
        metadata: {
          postId: post.id,
          nextRetryAt: nextRetryAt.toISOString(),
          attempt: newRetryCount,
          errorCode: error.code,
        },
      });

      await this.insertAuditLog(post, 'retried', {
        attempt: newRetryCount,
        nextRetryAt: nextRetryAt.toISOString(),
        errorCode: error.code,
      });

      return;
    }

    await this.markFailed(post, error);
  }

  /**
   * Process all retrying posts whose next_retry_at has elapsed.
   */
  async processQueue(): Promise<void> {
    const now = new Date();

    const { data: posts, error: queryError } = await this.supabase
      .from('scheduled_posts')
      .select(`
        *,
        channels!inner(id, platform, channel_identifier, user_id)
      `)
      .eq('status', 'retrying')
      .lte('next_retry_at', now.toISOString());

    if (queryError) {
      throw new Error(`Failed to query retry queue: ${queryError.message}`);
    }

    if (!posts || posts.length === 0) {
      return;
    }

    for (const dbPost of posts as (DbScheduledPost & { channels: DbChannel })[]) {
      const post = this.mapDbPostToScheduledPost(dbPost);

      const publisher = this.publisherRegistry.get(post.platform);

      const channelConfig: ChannelConfig = {
        platform: post.platform,
        channelId: post.channelId,
        credentials: {},
      };

      const result = await publisher.publish(
        { ...post, status: 'publishing' as PostStatus },
        channelConfig,
      );

      if (result.success) {
        await this.supabase
          .from('scheduled_posts')
          .update({
            status: 'published',
            platform_message_id: result.platformMessageId,
            published_at: result.publishedAt.toISOString(),
          })
          .eq('id', post.id);

        await this.insertAuditLog(post, 'published', {
          via: 'retry',
          attempt: post.retryCount,
          platformMessageId: result.platformMessageId,
        });

        await this.alertService.notify(post.userId, {
          type: 'post_published',
          severity: 'success',
          title: 'Post published',
          message: 'Your post was published successfully after retry.',
          metadata: { postId: post.id, attempt: post.retryCount },
        });
      } else if (result.error) {
        await this.handleProcessFailure(post, result.error);
      }
    }
  }

  async getRetryStatus(postId: string): Promise<RetryStatus> {
    const { data: post, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (error || !post) {
      throw new Error('Post not found');
    }

    const dbPost = post as DbScheduledPost;
    const lastError: PublishError = {
      code: 'NETWORK_ERROR',
      message: 'Last retry attempt failed',
      retryable: true,
    };

    let status: RetryStatus['status'] = 'queued';
    if (dbPost.status === 'cancelled') {
      status = 'cancelled';
    } else if (
      dbPost.status === 'failed' ||
      dbPost.retry_count >= dbPost.max_retries
    ) {
      status = 'exhausted';
    } else if (dbPost.status === 'retrying') {
      status = 'queued';
    }

    return {
      postId: dbPost.id,
      attempt: dbPost.retry_count,
      maxAttempts: dbPost.max_retries,
      nextRetryAt: dbPost.next_retry_at ? new Date(dbPost.next_retry_at) : null,
      lastError,
      status,
    };
  }

  async cancelRetry(postId: string): Promise<void> {
    const { data: post, error: fetchError } = await this.supabase
      .from('scheduled_posts')
      .select('status')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      throw new Error('Post not found');
    }

    if ((post as DbScheduledPost).status !== 'retrying') {
      throw new Error('Can only cancel posts with status "retrying"');
    }

    const { error: updateError } = await this.supabase
      .from('scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', postId);

    if (updateError) {
      throw new Error(`Failed to cancel retry: ${updateError.message}`);
    }
  }

  async getRetryHistory(userId: string, limit = 50): Promise<RetryRecord[]> {
    const { data, error } = await this.supabase
      .from('audit_log')
      .select('*')
      .eq('user_id', userId)
      .in('action', ['retried', 'published', 'failed'])
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch retry history: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      postId: row.post_id as string,
      attempt: (row.metadata as Record<string, unknown>)?.attempt as number ?? 0,
      attemptedAt: new Date(row.occurred_at as string),
      error: {
        code: (row.error_code as PublishError['code']) ?? 'NETWORK_ERROR',
        message: String((row.metadata as Record<string, unknown>)?.message ?? ''),
        retryable: row.action !== 'published',
      },
      outcome: row.action === 'published' ? 'success' : 'failed',
    }));
  }

  private async handleProcessFailure(
    post: ScheduledPost,
    error: PublishError,
  ): Promise<void> {
    if (error.retryable && post.retryCount < post.maxRetries) {
      const newRetryCount = post.retryCount + 1;
      assertRetryCountWrite(post.retryCount, newRetryCount, post.maxRetries);

      const nextRetryAt = new Date(
        Date.now() + computeBackoffDelay(newRetryCount, this.random),
      );

      await this.supabase
        .from('scheduled_posts')
        .update({
          status: 'retrying',
          retry_count: newRetryCount,
          next_retry_at: nextRetryAt.toISOString(),
        })
        .eq('id', post.id);

      await this.insertAuditLog(post, 'retried', {
        attempt: newRetryCount,
        nextRetryAt: nextRetryAt.toISOString(),
        errorCode: error.code,
      });

      await this.alertService.notify(post.userId, {
        type: 'post_retrying',
        severity: 'warning',
        title: 'Post retrying',
        message: 'Publish failed; retrying shortly.',
        metadata: {
          postId: post.id,
          nextRetryAt: nextRetryAt.toISOString(),
          attempt: newRetryCount,
          errorCode: error.code,
        },
      });
    } else {
      await this.markFailed(post, error);
    }
  }

  private async markFailed(
    post: ScheduledPost,
    error: PublishError,
  ): Promise<void> {

    const { error: updateError } = await this.supabase
      .from('scheduled_posts')
      .update({
        status: 'failed',
        retry_count: post.retryCount,
      })
      .eq('id', post.id);

    if (updateError) {
      throw new Error(`Failed to mark post as failed: ${updateError.message}`);
    }

    await this.insertAuditLog(post, 'failed', {
      exhausted: true,
      lastError: error,
      attempt: post.retryCount,
    });

    await this.alertService.notify(post.userId, {
      type: 'retry_exhausted',
      severity: 'error',
      title: 'Retry exhausted',
      message: 'All retry attempts failed for your post.',
      metadata: {
        postId: post.id,
        attempts: post.retryCount,
        errorCode: error.code,
      },
    });
  }

  private async insertAuditLog(
    post: ScheduledPost,
    action: 'published' | 'failed' | 'retried' | 'cancelled' | 'edited' | 'deleted',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase.from('audit_log').insert({
      user_id: post.userId,
      post_id: post.id,
      action,
      platform: post.platform,
      platform_message_id: post.platformMessageId ?? null,
      error_code: (metadata.errorCode as string) ?? null,
      metadata,
      occurred_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to insert audit log:', error);
    }
  }

  private mapDbPostToScheduledPost(dbPost: DbScheduledPost): ScheduledPost {
    return {
      id: dbPost.id,
      userId: dbPost.user_id,
      platform: dbPost.platform as SocialPlatform,
      channelId: dbPost.channel_id,
      content: {
        text: dbPost.text_content || undefined,
        mediaAssetIds: dbPost.media_asset_ids || [],
        mediaType: dbPost.media_type as
          | 'photo'
          | 'video'
          | 'audio'
          | 'document'
          | undefined,
      },
      scheduledAt: new Date(dbPost.scheduled_at),
      status: dbPost.status as PostStatus,
      retryCount: dbPost.retry_count,
      maxRetries: dbPost.max_retries,
      platformMessageId: dbPost.platform_message_id || undefined,
      publishedAt: dbPost.published_at ? new Date(dbPost.published_at) : undefined,
      nextRetryAt: dbPost.next_retry_at ? new Date(dbPost.next_retry_at) : undefined,
      createdAt: new Date(dbPost.created_at),
      updatedAt: new Date(dbPost.updated_at),
    };
  }
}
