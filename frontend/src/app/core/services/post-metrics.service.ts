import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { PostMetrics } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class PostMetricsService {
  private supabase = inject(SupabaseClient);

  async getPostMetrics(messageId: string): Promise<PostMetrics | null> {
    const { data, error } = await this.supabase
      .from('post_metrics')
      .select('*')
      .eq('platform_message_id', messageId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching post metrics:', error);
      throw error;
    }

    if (!data) {
      return {
        postId: '',
        platformMessageId: messageId,
        views: null as any,
        reactions: null as any,
        forwards: null as any,
        replies: null as any,
        measuredAt: new Date()
      };
    }

    return this.mapRow(data);
  }

  private mapRow(row: any): PostMetrics {
    return {
      postId: row.post_id,
      platformMessageId: row.platform_message_id,
      views: row.views,
      reactions: row.reactions ?? {},
      forwards: row.forwards ?? 0,
      replies: row.replies ?? 0,
      measuredAt: new Date(row.measured_at)
    };
  }

  async getAggregateMetrics(startDate: Date, endDate: Date): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select(`
        id,
        published_at,
        text_content,
        platform_message_id,
        post_metrics (
          views,
          reactions,
          forwards,
          replies
        )
      `)
      .eq('status', 'published')
      .gte('published_at', startDate.toISOString())
      .lte('published_at', endDate.toISOString())
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching aggregate metrics:', error);
      throw error;
    }

    return (data ?? []).map((post: any) => {
      const metrics = Array.isArray(post.post_metrics) ? post.post_metrics[0] : post.post_metrics;
      return {
        id: post.id,
        publishedAt: new Date(post.published_at),
        content: post.text_content,
        platformMessageId: post.platform_message_id,
        views: metrics?.views ?? 0,
        reactions: metrics?.reactions ?? {},
        forwards: metrics?.forwards ?? 0,
        replies: metrics?.replies ?? 0
      };
    });
  }

  async fetchTelegramMetrics(messageId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase.functions.invoke('scheduler', {
        body: { action: 'GET_METRICS', messageId }
      });

      if (error) {
        console.error('Real Telegram network request via Edge Function failed:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Real Telegram network request failed:', error);
      return null;
    }
  }
}
