import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Notification } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private supabase = inject(SupabaseClient);

  async getNotifications(unreadOnly = false): Promise<Notification[]> {
    let query = this.supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async markAsRead(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllAsRead(): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  private mapRow(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      metadata: row.metadata ?? {},
      read: row.read,
      createdAt: new Date(row.created_at)
    };
  }
}
