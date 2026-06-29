import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private supabase = inject(SupabaseClient);
  notifications = signal<Notification[]>([]);
  
  constructor() {
    this.init();
  }

  async init() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;
    
    await this.fetchNotifications(session.user.id);
    this.subscribeToRealtime(session.user.id);
  }

  private async fetchNotifications(userId: string) {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (!error && data) {
      this.notifications.set(data.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        timestamp: new Date(n.created_at)
      })));
    }
  }

  private subscribeToRealtime(userId: string) {
    this.supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newNotif = payload.new;
          const mapped: Notification = {
            id: newNotif['id'],
            type: newNotif['type'],
            title: newNotif['title'],
            message: newNotif['message'],
            read: newNotif['read'],
            timestamp: new Date(newNotif['created_at'])
          };
          this.notifications.update(current => [mapped, ...current]);
        }
      )
      .subscribe();
  }

  async markAllAsRead() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;

    this.notifications.update(current => 
      current.map(n => ({ ...n, read: true }))
    );

    await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
  }

  // Helper to create notifications from the frontend
  async notify(type: string, severity: string, title: string, message: string) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;
    
    // Optimistic UI update
    const tempId = 'temp-' + Date.now();
    const newNotif: Notification = {
      id: tempId,
      type,
      title,
      message,
      read: false,
      timestamp: new Date()
    };
    this.notifications.update(current => [newNotif, ...current]);
    
    await this.supabase.from('notifications').insert({
      user_id: session.user.id,
      type,
      severity,
      title,
      message,
      read: false
    });
  }
}
