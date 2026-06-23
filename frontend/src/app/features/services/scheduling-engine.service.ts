import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AngularAuthService } from '../../core/services/auth.service';
import { ScheduledPost, PostStatus, SocialPlatform, Channel, CreatePostRequest } from '@director-ai/types';

/**
 * Frontend facade for SchedulingEngine.
 *
 * The actual SchedulingEngine lives in supabase/functions/scheduler/scheduling-engine.ts
 * as a Deno class and cannot be imported into the Angular browser bundle.
 * This service mirrors its public API surface by calling the same Supabase
 * tables directly, using the authenticated SupabaseClient provided by
 * provideSupabase() in app.config.ts.
 *
 * Methods:
 *  - getUpcomingPosts(from, to)   → mirrors SchedulingEngine.getUpcomingPosts
 *  - reschedulePost(postId, date) → mirrors SchedulingEngine.reschedulePost
 *  - cancelPost(postId)           → mirrors SchedulingEngine.cancelPost
 *  - schedulePost(request)        → mirrors SchedulingEngine.schedulePost
 *  - getFailedPosts()             → convenience: scheduled_posts WHERE status='failed'
 *  - getChannels()                → channels owned by authenticated user
 */
@Injectable({ providedIn: 'root' })
export class SchedulingEngineService {
  private supabase = inject(SupabaseClient);
  private authService = inject(AngularAuthService);

  constructor() {}

  /** Resolve authenticated user id, throwing if no session. */
  private async getUserId(): Promise<string> {
    const user = await this.authService.getUser();
    if (!user) throw new Error('User not authenticated');
    return user.id;
  }

  /**
   * Fetch scheduled posts for the calendar view window.
   * Returns all non-draft statuses so the calendar can colour-code each.
   */
  async getUpcomingPosts(from: Date, to: Date): Promise<ScheduledPost[]> {
    const userId = await this.getUserId();

    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['scheduled', 'retrying', 'failed', 'published'])
      .gte('scheduled_at', from.toISOString())
      .lte('scheduled_at', to.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch posts: ${error.message}`);
    return (data ?? []).map(this.mapRow);
  }

  /**
   * Fetch all posts with status = 'failed' for the Automation Hub.
   */
  async getFailedPosts(): Promise<ScheduledPost[]> {
    const userId = await this.getUserId();

    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch failed posts: ${error.message}`);
    return (data ?? []).map(this.mapRow);
  }

  /**
   * Fetch posts with a non-null recurrence_rule_id for the Recurrence section.
   */
  async getRecurringPosts(): Promise<ScheduledPost[]> {
    const userId = await this.getUserId();

    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', userId)
      .not('recurrence_rule_id', 'is', null)
      .in('status', ['scheduled', 'retrying'])
      .order('scheduled_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch recurring posts: ${error.message}`);
    return (data ?? []).map(this.mapRow);
  }

  /**
   * Reschedule a post. Validates newScheduledAt > now() before calling Supabase.
   * Mirrors SchedulingEngine.reschedulePost lifecycle guard.
   */
  async reschedulePost(postId: string, newScheduledAt: Date): Promise<ScheduledPost> {
    const now = new Date();
    if (newScheduledAt <= now) {
      throw new Error('newScheduledAt must be in the future');
    }

    const userId = await this.getUserId();

    // Lifecycle guard: cannot reschedule published posts
    const { data: existing, error: fetchError } = await this.supabase
      .from('scheduled_posts')
      .select('status')
      .eq('id', postId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) throw new Error('Post not found');
    if (existing.status === 'published') {
      throw new Error('Cannot reschedule a published post');
    }

    const { data: updated, error } = await this.supabase
      .from('scheduled_posts')
      .update({
        scheduled_at: newScheduledAt.toISOString(),
        status: 'scheduled'       // reset to scheduled when re-queued
      })
      .eq('id', postId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !updated) throw new Error(`Failed to reschedule post: ${error?.message}`);
    return this.mapRow(updated);
  }

  /**
   * Cancel a scheduled post (only valid for status='scheduled').
   * Mirrors SchedulingEngine.cancelPost.
   */
  async cancelPost(postId: string): Promise<void> {
    const userId = await this.getUserId();

    const { data: existing, error: fetchError } = await this.supabase
      .from('scheduled_posts')
      .select('status')
      .eq('id', postId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) throw new Error('Post not found');
    if (existing.status !== 'scheduled') {
      throw new Error(`Can only cancel posts with status "scheduled". Current: "${existing.status}"`);
    }

    const { error } = await this.supabase
      .from('scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', postId)
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to cancel post: ${error.message}`);
  }

  /**
   * Create and schedule a new post.
   * Mirrors SchedulingEngine.schedulePost validation.
   */
  async schedulePost(request: Omit<CreatePostRequest, 'userId'>): Promise<ScheduledPost> {
    const now = new Date();
    if (request.scheduledAt <= now) {
      throw new Error('scheduledAt must be in the future');
    }

    const userId = await this.getUserId();

    // Validate channel ownership
    const { data: channel, error: channelError } = await this.supabase
      .from('channels')
      .select('id, platform')
      .eq('id', request.channelId)
      .eq('user_id', userId)
      .single();

    if (channelError || !channel) {
      throw new Error('Channel not found or does not belong to user');
    }

    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .insert({
        user_id: userId,
        channel_id: request.channelId,
        platform: channel.platform,
        text_content: request.content.text ?? null,
        media_asset_ids: request.content.mediaAssetIds ?? [],
        media_type: request.content.mediaType ?? null,
        scheduled_at: request.scheduledAt.toISOString(),
        status: 'scheduled',
        retry_count: 0,
        max_retries: 3
      })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to schedule post: ${error?.message}`);
    return this.mapRow(data);
  }

  /**
   * Update the max_retries value for all scheduled posts on a channel.
   */
  async updateChannelMaxRetries(channelId: string, maxRetries: number): Promise<void> {
    const userId = await this.getUserId();
    const { error } = await this.supabase
      .from('scheduled_posts')
      .update({ max_retries: maxRetries })
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'retrying']);

    if (error) throw new Error(`Failed to update max retries: ${error.message}`);
  }

  /**
   * Fetch all channels owned by the authenticated user.
   */
  async getChannels(): Promise<Channel[]> {
    const userId = await this.getUserId();

    const { data, error } = await this.supabase
      .from('channels')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw new Error(`Failed to fetch channels: ${error.message}`);
    return (data ?? []).map((row: any): Channel => ({
      id: row.id,
      userId: row.user_id,
      platform: row.platform as SocialPlatform,
      name: row.name,
      channelIdentifier: row.channel_identifier,
      isActive: row.is_active,
      createdAt: new Date(row.created_at)
    }));
  }

  /**
   * Fetch paginated audit_log entries for the Activity Log section.
   */
  async getAuditLog(options: {
    page: number;
    pageSize: number;
    action?: string;
    platform?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ rows: AuditLogEntry[]; total: number }> {
    const userId = await this.getUserId();
    const { page, pageSize, action, platform, from, to } = options;

    let query = this.supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (action) query = query.eq('action', action);
    if (platform) query = query.eq('platform', platform);
    if (from) query = query.gte('occurred_at', from.toISOString());
    if (to) query = query.lte('occurred_at', to.toISOString());

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch audit log: ${error.message}`);

    return {
      total: count ?? 0,
      rows: (data ?? []).map((row: any): AuditLogEntry => ({
        id: row.id,
        postId: row.post_id,
        action: row.action,
        platform: row.platform,
        platformMessageId: row.platform_message_id,
        errorCode: row.error_code,
        metadata: row.metadata ?? {},
        occurredAt: new Date(row.occurred_at)
      }))
    };
  }

  /** Map a raw Supabase row to ScheduledPost. */
  private mapRow(row: any): ScheduledPost {
    return {
      id: row.id,
      userId: row.user_id,
      platform: row.platform as SocialPlatform,
      channelId: row.channel_id,
      content: {
        text: row.text_content ?? undefined,
        mediaAssetIds: row.media_asset_ids ?? [],
        mediaType: row.media_type ?? undefined
      },
      scheduledAt: new Date(row.scheduled_at),
      status: row.status as PostStatus,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      platformMessageId: row.platform_message_id ?? undefined,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

/** Audit log entry shape for the Activity Log UI. */
export interface AuditLogEntry {
  id: string;
  postId: string;
  action: string;
  platform: string;
  platformMessageId?: string;
  errorCode?: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}
