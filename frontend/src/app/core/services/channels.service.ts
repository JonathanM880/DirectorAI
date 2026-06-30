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
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('No hay una sesión activa de usuario.');
    }

    const payload = {
      platform: channel.platform,
      name: channel.name,
      channel_identifier: channel.channel_identifier,
      is_active: channel.is_active,
      user_id: session.user.id
    };

    const { data, error } = await this.supabase
      .from('channels')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating channel:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async updateChannel(id: string, channel: { name?: string; channel_identifier?: string; is_active?: boolean }): Promise<Channel> {
    const { data, error } = await this.supabase
      .from('channels')
      .update(channel)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating channel:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async deleteChannel(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('channels')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  private mapRow(row: {
    id: string;
    user_id: string;
    platform: string;
    name: string;
    channel_identifier: string;
    is_active: boolean;
    created_at: string;
  }): Channel {
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
