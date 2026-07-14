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
    pageSize = 5,
    channelId?: string
  ): Promise<{ posts: any[]; total: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let countQuery = this.supabase
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('published_at', startDate.toISOString())
      .lte('published_at', endDate.toISOString());
      
    if (channelId && channelId !== 'all') {
      countQuery = countQuery.eq('channel_id', channelId);
    }

    const { count: total, error: countError } = await countQuery;

    if (countError) {
      console.error('Error counting posts:', countError);
      throw countError;
    }

    let dataQuery = this.supabase
      .from('scheduled_posts')
      .select(`
        id,
        published_at,
        text_content,
        platform_message_id,
        channel_id,
        retry_count,
        media_type,
        channels ( name ),
        post_metrics ( views, reactions, forwards, replies )
      `)
      .eq('status', 'published')
      .gte('published_at', startDate.toISOString())
      .lte('published_at', endDate.toISOString());
      
    if (channelId && channelId !== 'all') {
      dataQuery = dataQuery.eq('channel_id', channelId);
    }

    const { data, error } = await dataQuery
      .order('published_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching aggregate metrics:', error);
      throw error;
    }

    const posts = (data ?? []).map((post: any) => {
      const ch = Array.isArray(post.channels) ? post.channels[0] : post.channels;
      return {
        id: post.id,
        publishedAt: new Date(post.published_at),
        content: post.text_content,
        platformMessageId: post.platform_message_id,
        channelId: post.channel_id,
        channelName: ch?.name ?? 'Desconocido',
        retryCount: post.retry_count,
        mediaType: post.media_type ?? 'Texto'
      };
    });

    return { posts, total: total ?? 0 };
  }

  async getAllPostsForExport(
    startDate: Date,
    endDate: Date,
    channelId?: string
  ): Promise<any[]> {
    let query = this.supabase
      .from('scheduled_posts')
      .select(`
        id,
        published_at,
        text_content,
        platform_message_id,
        channel_id,
        retry_count,
        media_type,
        channels ( name )
      `)
      .eq('status', 'published')
      .gte('published_at', startDate.toISOString())
      .lte('published_at', endDate.toISOString());
      
    if (channelId && channelId !== 'all') {
      query = query.eq('channel_id', channelId);
    }
    
    const { data, error } = await query.order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching all posts for export:', error);
      throw error;
    }

    return (data ?? []).map((post: any) => {
      const ch = Array.isArray(post.channels) ? post.channels[0] : post.channels;
      return {
        id: post.id,
        publishedAt: new Date(post.published_at),
        content: post.text_content,
        channelName: ch?.name ?? 'Desconocido',
        retryCount: post.retry_count,
        mediaType: post.media_type ?? 'Texto'
      };
    });
  }

  async fetchTelegramMetrics(postId: string): Promise<PostMetrics | null> {
    return this.getPostMetrics(postId);
  }

  async getChannelTrend(channelId: string, days: number = 30): Promise<{ date: string; count: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await this.supabase
      .from('scheduled_posts')
      .select('published_at, post_metrics(views)')
      .eq('channel_id', channelId)
      .eq('status', 'published')
      .gte('published_at', startDate.toISOString())
      .lte('published_at', endDate.toISOString());

    if (error) {
      console.error('Error fetching channel trend:', error);
      throw error;
    }

    const trendMap = new Map<string, number>();
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      trendMap.set(d.toISOString().split('T')[0], 0);
    }

    (data || []).forEach((post: any) => {
      const dateKey = post.published_at.split('T')[0];
      if (trendMap.has(dateKey)) {
        let postViews = 0;
        if (post.post_metrics) {
          if (Array.isArray(post.post_metrics)) {
            postViews = post.post_metrics[0]?.views ?? 0;
          } else {
            postViews = (post.post_metrics as any).views ?? 0;
          }
        }
        trendMap.set(dateKey, trendMap.get(dateKey)! + postViews);
      }
    });

    return Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
