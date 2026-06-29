import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScheduledPost, PostStatus, SocialPlatform } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class ScheduledPostsService {
  private supabase = inject(SupabaseClient);

  async getUpcomingPosts(from: Date, to: Date): Promise<ScheduledPost[]> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select(`
        *,
        recurrence_rules!recurrence_rule_id (
          id,
          user_id,
          frequency,
          interval,
          days_of_week,
          end_date,
          max_occurrences,
          created_at
        )
      `)
      .in('status', ['scheduled', 'retrying', 'failed', 'published', 'paused'])
      .or(`and(scheduled_at.gte.${from.toISOString()},scheduled_at.lte.${to.toISOString()}),recurrence_rule_id.not.is.null`)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming posts:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async getPublishedPosts(from: Date, to: Date): Promise<ScheduledPost[]> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'published')
      .gte('published_at', from.toISOString())
      .lte('published_at', to.toISOString())
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching published posts:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async getFailedPosts(): Promise<ScheduledPost[]> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'failed')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching failed posts:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async getRecurringPosts(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select(`
        *,
        channels (
          platform
        ),
        recurrence_rules!recurrence_rule_id (
          id,
          user_id,
          frequency,
          interval,
          days_of_week,
          end_date,
          max_occurrences,
          created_at
        )
      `)
      .not('recurrence_rule_id', 'is', null)
      .order('scheduled_at', { ascending: true });

    if (error) {
      console.error('Error fetching recurring posts:', error);
      throw error;
    }

    return data ?? [];
  }

  async getPostById(id: string): Promise<ScheduledPost | null> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching post by id:', error);
      throw error;
    }

    if (!data) return null;

    return this.mapRow(data);
  }

  async createPost(post: {
    channel_id: string;
    text_content?: string | null;
    media_asset_ids?: string[];
    media_type?: string | null;
    scheduled_at: string;
    status?: PostStatus;
    retry_count?: number;
    max_retries?: number;
    recurrence_rule_id?: string | null;
  }): Promise<ScheduledPost> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .insert({
        ...post,
        status: post.status ?? 'scheduled',
        retry_count: post.retry_count ?? 0,
        max_retries: post.max_retries ?? 3
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating post:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async updatePost(id: string, post: Partial<{
    channel_id: string;
    text_content: string | null;
    media_asset_ids: string[];
    media_type: string | null;
    scheduled_at: string;
    status: PostStatus;
    retry_count: number;
    max_retries: number;
    recurrence_rule_id: string | null;
  }>): Promise<ScheduledPost> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .update(post)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating post:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async reschedulePost(id: string, scheduledAt: Date): Promise<ScheduledPost> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .update({
        scheduled_at: scheduledAt.toISOString(),
        status: 'scheduled'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error rescheduling post:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async cancelPost(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      console.error('Error cancelling post:', error);
      throw error;
    }
  }

  async updateChannelMaxRetries(channelId: string, maxRetries: number): Promise<void> {
    const { error } = await this.supabase
      .from('scheduled_posts')
      .update({ max_retries: maxRetries })
      .eq('channel_id', channelId)
      .in('status', ['scheduled', 'retrying']);

    if (error) {
      console.error('Error updating max retries for channel:', error);
      throw error;
    }
  }

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
