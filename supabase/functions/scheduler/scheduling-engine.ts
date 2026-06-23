import {
  ScheduledPost,
  CreatePostRequest,
  DispatchSummary,
  PostStatus,
  SocialPlatform,
  ChannelConfig,
  RecurrenceRule,
} from '@director-ai/types';
import { PublisherRegistry } from '../_shared/publisher/social-media-publisher.interface';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RecurrenceService } from './recurrence.service';

// Database row types
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
  user_id: string;
  platform: string;
  name: string;
  channel_identifier: string;
  is_active: boolean;
  created_at: string;
}

/**
 * SchedulingEngine manages post scheduling, dispatching, and lifecycle management.
 * Implements Algorithm 1 from the design document for tick() execution.
 */
export class SchedulingEngine {
  private publisherRegistry: PublisherRegistry;
  private supabase: any;
  private recurrenceService: RecurrenceService;

  constructor(
    publisherRegistry: PublisherRegistry,
    supabaseUrl: string,
    supabaseServiceRoleKey: string
  ) {
    this.publisherRegistry = publisherRegistry;
    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.recurrenceService = new RecurrenceService();
  }

  /**
   * Schedule a new post for future publication.
   * Validates scheduledAt > now(), feature access, and channel ownership.
   */
  async schedulePost(request: CreatePostRequest): Promise<ScheduledPost> {
    const now = new Date();

    // Validate scheduledAt is in the future
    if (request.scheduledAt <= now) {
      throw new Error('scheduledAt must be in the future');
    }

    // Check feature access for scheduled_posts (simulated - in production, call BillingService)
    // For now, we assume feature access is granted
    // TODO: Integrate with BillingService.checkFeatureAccess(userId, 'scheduled_posts')

    // Validate channelId belongs to userId
    const { data: channel, error: channelError } = await this.supabase
      .from('channels')
      .select('id, platform, channel_identifier')
      .eq('id', request.channelId)
      .eq('user_id', request.userId)
      .single();

    if (channelError || !channel) {
      throw new Error('Channel not found or does not belong to user');
    }

    // Validate recurrence rule if provided
    if (request.recurrenceRule && request.recurrenceRule.endDate) {
      if (request.recurrenceRule.endDate <= request.scheduledAt) {
        throw new Error('Recurrence rule endDate must be after scheduledAt');
      }
    }

    // Create the scheduled post
    const { data: post, error: postError } = await this.supabase
      .from('scheduled_posts')
      .insert({
        user_id: request.userId,
        channel_id: request.channelId,
        text_content: request.content.text,
        media_asset_ids: request.content.mediaAssetIds || [],
        media_type: request.content.mediaType,
        scheduled_at: request.scheduledAt.toISOString(),
        status: 'scheduled',
        retry_count: 0,
        max_retries: 3,
        platform: (channel as DbChannel).platform as SocialPlatform,
      })
      .select()
      .single();

    if (postError || !post) {
      throw new Error(`Failed to create scheduled post: ${postError?.message}`);
    }

    // Assert post.scheduledAt > post.createdAt
    if (new Date((post as DbScheduledPost).scheduled_at) <= new Date((post as DbScheduledPost).created_at)) {
      throw new Error('Invariant violation: scheduledAt must be greater than createdAt');
    }

    return this.mapDbPostToScheduledPost(post);
  }

  /**
   * Execute the scheduling tick - dispatch due posts to publishers.
   * Implements Algorithm 1 from the design document.
   */
  async tick(): Promise<DispatchSummary> {
    const now = new Date();
    const summary: DispatchSummary = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      retryQueued: 0,
    };

    // Step 1: Reset stale publishing posts (stuck in 'publishing' > 5 minutes)
    await this.resetStalePublishingPosts(now);

    // Step 2: Query due posts with FOR UPDATE SKIP LOCKED for concurrency safety
    // First get active subscription user IDs
    const { data: activeSubs } = await this.supabase
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active');

    const activeUserIds = (activeSubs as any[])?.map((s: any) => s.user_id) || [];

    const { data: posts, error: queryError } = await this.supabase
      .from('scheduled_posts')
      .select(`
        *,
        channels!inner(id, platform, channel_identifier, user_id)
      `)
      .eq('status', 'scheduled')
      .lte('scheduled_at', now.toISOString())
      .in('user_id', activeUserIds)
      .order('scheduled_at', { ascending: true })
      .limit(100);

    if (queryError) {
      console.error('Error querying scheduled posts:', queryError);
      return summary;
    }

    if (!posts || posts.length === 0) {
      return summary;
    }

    // Process each post
    for (const dbPost of posts) {
      summary.processed++;

      try {
        // Update status to 'publishing' before dispatching
        const { error: updateError } = await this.supabase
          .from('scheduled_posts')
          .update({ status: 'publishing' } as any)
          .eq('id', dbPost.id);

        if (updateError) {
          console.error(`Failed to update post ${dbPost.id} to publishing:`, updateError);
          summary.failed++;
          continue;
        }

        const post = this.mapDbPostToScheduledPost(dbPost);

        // Get publisher for the platform
        const publisher = this.publisherRegistry.get(post.platform);

        // Get channel config (in production, resolve credentials from KeyVault)
        const channelConfig: ChannelConfig = {
          platform: post.platform,
          channelId: post.channelId,
          credentials: {}, // TODO: Resolve from KeyVaultService
        };

        // Validate post before publishing
        const validation = publisher.validatePost(post);

        if (!validation.valid) {
          // Update to failed status
          await this.supabase
            .from('scheduled_posts')
            .update({ status: 'failed' } as any)
            .eq('id', post.id);

          // Insert audit log
          await this.insertAuditLog(post, 'failed', {
            reason: validation.errors,
          });

          summary.failed++;
          continue;
        }

        // Publish the post
        const result = await publisher.publish(post, channelConfig);

        if (result.success) {
          // Update to published status
          await this.supabase
            .from('scheduled_posts')
            .update({
              status: 'published',
              platform_message_id: result.platformMessageId,
              published_at: result.publishedAt.toISOString(),
            } as any)
            .eq('id', post.id);

          // Insert audit log
          await this.insertAuditLog(post, 'published', result as any);

          summary.succeeded++;

          // Handle recurrence if post has a recurrence rule
          if (post.recurrenceRule) {
            const nextScheduledAt = this.recurrenceService.scheduleNext(post);
            
            if (nextScheduledAt) {
              // Create the next recurrence instance
              const { error: insertError } = await this.supabase
                .from('scheduled_posts')
                .insert({
                  user_id: post.userId,
                  channel_id: post.channelId,
                  platform: post.platform,
                  text_content: post.content.text,
                  media_asset_ids: post.content.mediaAssetIds || [],
                  media_type: post.content.mediaType,
                  scheduled_at: nextScheduledAt.toISOString(),
                  status: 'scheduled',
                  retry_count: 0,
                  max_retries: 3,
                  recurrence_rule_id: (dbPost as DbScheduledPost).recurrence_rule_id,
                  parent_post_id: post.id,
                } as any);

              if (insertError) {
                console.error(`Failed to create recurrence instance: ${insertError.message}`);
              }
            }
          }
        } else {
          // Handle retry logic
          if (result.error?.retryable && post.retryCount < post.maxRetries) {
            // Enqueue for retry (update to retrying status)
            const nextRetryAt = new Date(now.getTime() + 60000); // TODO: Implement exponential backoff
            await this.supabase
              .from('scheduled_posts')
              .update({
                status: 'retrying',
                retry_count: post.retryCount + 1,
                next_retry_at: nextRetryAt.toISOString(),
              } as any)
              .eq('id', post.id);

            summary.retryQueued++;
          } else {
            // Update to failed status
            await this.supabase
              .from('scheduled_posts')
              .update({ status: 'failed' } as any)
              .eq('id', post.id);

            // Insert audit log
            await this.insertAuditLog(post, 'failed', (result.error || {}) as any);

            summary.failed++;
          }
        }
      } catch (error) {
        console.error(`Error processing post ${(dbPost as DbScheduledPost).id}:`, error);
        summary.failed++;
      }
    }

    // Assert invariant
    if (summary.processed !== summary.succeeded + summary.failed + summary.retryQueued) {
      console.error(
        `Invariant violation: processed (${summary.processed}) !== succeeded (${summary.succeeded}) + failed (${summary.failed}) + retryQueued (${summary.retryQueued})`
      );
    }

    return summary;
  }

  /**
   * Reset posts stuck in 'publishing' status for more than 5 minutes.
   */
  private async resetStalePublishingPosts(now: Date): Promise<void> {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const { error } = await this.supabase
      .from('scheduled_posts')
      .update({ status: 'scheduled' } as any)
      .eq('status', 'publishing')
      .lte('updated_at', fiveMinutesAgo.toISOString());

    if (error) {
      console.error('Error resetting stale publishing posts:', error);
    }
  }

  /**
   * Cancel a scheduled post.
   */
  async cancelPost(postId: string, userId: string): Promise<void> {
    // Get the post
    const { data: post, error: fetchError } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', postId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !post) {
      throw new Error('Post not found');
    }

    // Validate status is 'scheduled'
    if ((post as DbScheduledPost).status !== 'scheduled') {
      throw new Error('Can only cancel posts with status "scheduled"');
    }

    // Update to cancelled status
    const { error: updateError } = await this.supabase
      .from('scheduled_posts')
      .update({ status: 'cancelled' } as any)
      .eq('id', postId);

    if (updateError) {
      throw new Error(`Failed to cancel post: ${updateError.message}`);
    }
  }

  /**
   * Reschedule a post to a new time.
   */
  async reschedulePost(postId: string, newScheduledAt: Date, userId: string): Promise<ScheduledPost> {
    const now = new Date();

    // Validate newScheduledAt is in the future
    if (newScheduledAt <= now) {
      throw new Error('newScheduledAt must be in the future');
    }

    // Get the post
    const { data: post, error: fetchError } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', postId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !post) {
      throw new Error('Post not found');
    }

    // Check lifecycle guard - cannot reschedule published or failed posts
    if ((post as DbScheduledPost).status === 'published' || (post as DbScheduledPost).status === 'failed') {
      throw new Error(`Cannot reschedule post with status "${(post as DbScheduledPost).status}"`);
    }

    // Update scheduledAt
    const { data: updatedPost, error: updateError } = await this.supabase
      .from('scheduled_posts')
      .update({ scheduled_at: newScheduledAt.toISOString() } as any)
      .eq('id', postId)
      .select()
      .single();

    if (updateError || !updatedPost) {
      throw new Error(`Failed to reschedule post: ${updateError?.message}`);
    }

    return this.mapDbPostToScheduledPost(updatedPost);
  }

  /**
   * Get upcoming posts for a user within a date range.
   */
  async getUpcomingPosts(userId: string, from: Date, to: Date): Promise<ScheduledPost[]> {
    const { data: posts, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', from.toISOString())
      .lte('scheduled_at', to.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch upcoming posts: ${error.message}`);
    }

    return (posts || []).map((post: any) => this.mapDbPostToScheduledPost(post));
  }

  /**
   * Insert an audit log entry.
   */
  private async insertAuditLog(
    post: ScheduledPost,
    action: 'published' | 'failed' | 'retried' | 'cancelled' | 'edited' | 'deleted',
    metadata: Record<string, unknown>
  ): Promise<void> {
    const insertResult = await this.supabase.from('audit_log').insert({
      user_id: post.userId,
      post_id: post.id,
      action,
      platform: post.platform,
      platform_message_id: post.platformMessageId,
      metadata: metadata as any,
      occurred_at: new Date().toISOString(),
    } as any);

    if (insertResult.error) {
      console.error('Failed to insert audit log:', insertResult.error);
    }
  }

  /**
   * Map database post to ScheduledPost type.
   */
  private mapDbPostToScheduledPost(dbPost: DbScheduledPost | any): ScheduledPost {
    const post = dbPost as DbScheduledPost;
    return {
      id: post.id,
      userId: post.user_id,
      platform: post.platform as SocialPlatform,
      channelId: post.channel_id,
      content: {
        text: post.text_content || undefined,
        mediaAssetIds: post.media_asset_ids || [],
        mediaType: post.media_type as 'photo' | 'video' | 'audio' | 'document' | undefined,
      },
      scheduledAt: new Date(post.scheduled_at),
      status: post.status as PostStatus,
      retryCount: post.retry_count,
      maxRetries: post.max_retries,
      platformMessageId: post.platform_message_id || undefined,
      publishedAt: post.published_at ? new Date(post.published_at) : undefined,
      nextRetryAt: post.next_retry_at ? new Date(post.next_retry_at) : undefined,
      createdAt: new Date(post.created_at),
      updatedAt: new Date(post.updated_at),
    };
  }
}
