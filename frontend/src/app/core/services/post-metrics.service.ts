import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { PostMetrics, PostAnalytics } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class PostMetricsService {
  private supabase = inject(SupabaseClient);

  async getPostMetricsByMessageId(messageId: string): Promise<PostMetrics | null> {
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

  async getPostMetrics(postId: string): Promise<PostMetrics | null> {
    const { data, error } = await this.supabase
      .from('post_metrics')
      .select('*')
      .eq('post_id', postId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching post metrics:', error);
      throw error;
    }

    if (!data) {
      return {
        postId,
        platformMessageId: '',
        views: null as any,
        reactions: null as any,
        forwards: null as any,
        replies: null as any,
        measuredAt: new Date()
      };
    }

    return this.mapRow(data);
  }

  async getPostAnalytics(postId: string): Promise<PostAnalytics | null> {
    const { data: post, error } = await this.supabase
      .from('scheduled_posts')
      .select(`
        id,
        published_at,
        status,
        retry_count,
        media_type,
        channel_id,
        channels (
          name
        )
      `)
      .eq('id', postId)
      .maybeSingle();

    if (error || !post || !post.published_at) return null;

    const { count: postNumber } = await this.supabase
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', post.channel_id)
      .eq('status', 'published')
      .lte('published_at', post.published_at);

    const publishedAt = new Date(post.published_at);

    return {
      postId: post.id,
      publishedAt,
      timeSincePublished: this.formatTimeSince(publishedAt),
      postNumberInChannel: (postNumber ?? 0),
      channelName: this.getChannelName(post.channels),
      publishHour: publishedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      publishDayOfWeek: this.formatDayOfWeek(publishedAt),
      contentType: post.media_type ?? 'Texto',
      attempts: (post.retry_count ?? 0) + 1,
      status: post.status
    };
  }

  private formatTimeSince(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}min`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  private getChannelName(channels: unknown): string {
    if (Array.isArray(channels) && channels.length > 0) {
      return (channels[0] as any)?.name ?? 'Desconocido';
    }
    if (channels && typeof channels === 'object') {
      return (channels as any).name ?? 'Desconocido';
    }
    return 'Desconocido';
  }

  private formatDayOfWeek(date: Date): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[date.getDay()];
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

  async getAggregateMetrics(
    startDate: Date,
    endDate: Date,
    page = 1,
    pageSize = 5
  ): Promise<{ posts: any[]; total: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { count: total, error: countError } = await this.supabase
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('published_at', startDate.toISOString())
      .lte('published_at', endDate.toISOString());

    if (countError) {
      console.error('Error counting posts:', countError);
      throw countError;
    }

    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select(`
        id,
        published_at,
        text_content,
        platform_message_id,
        channel_id,
        retry_count,
        media_type,
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
      .order('published_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching aggregate metrics:', error);
      throw error;
    }

    const posts = (data ?? []).map((post: any) => {
      const metrics = Array.isArray(post.post_metrics) ? post.post_metrics[0] : post.post_metrics;
      return {
        id: post.id,
        publishedAt: new Date(post.published_at),
        content: post.text_content,
        platformMessageId: post.platform_message_id,
        channelId: post.channel_id,
        retryCount: post.retry_count,
        mediaType: post.media_type,
        views: metrics?.views ?? 0,
        reactions: metrics?.reactions ?? {},
        forwards: metrics?.forwards ?? 0,
        replies: metrics?.replies ?? 0
      };
    });

    return { posts, total: total ?? 0 };
  }

  async fetchTelegramMetrics(postId: string): Promise<PostMetrics | null> {
    return this.getPostMetrics(postId);
  }
}
