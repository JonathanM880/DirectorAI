import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Channel, SocialPlatform } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class ChannelsService {
  private supabase = inject(SupabaseClient);

  async getChannels(): Promise<Channel[]> {
    const { data, error } = await this.supabase
      .from('channels')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching channels:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async getChannelById(id: string): Promise<Channel | null> {
    const { data, error } = await this.supabase
      .from('channels')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching channel by id:', error);
      throw error;
    }

    if (!data) return null;

    return this.mapRow(data);
  }

  async createChannel(channel: { platform: SocialPlatform; name: string; channel_identifier: string; is_active?: boolean }): Promise<Channel> {
    const { data, error } = await this.supabase
      .from('channels')
      .insert(channel)
      .select()
      .single();

    if (error) {
      console.error('Error creating channel:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  private mapRow(row: any): Channel {
    return {
      id: row.id,
      userId: row.user_id,
      platform: row.platform as SocialPlatform,
      name: row.name,
      channelIdentifier: row.channel_identifier,
      isActive: row.is_active,
      createdAt: new Date(row.created_at)
    };
  }
}
