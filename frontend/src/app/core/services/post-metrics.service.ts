import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { PostMetrics } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class PostMetricsService {
  private supabase = inject(SupabaseClient);

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

    if (!data) return null;

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
}
