import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  AlertService,
  AlertEvent,
  Notification,
  Unsubscribe,
} from '../../../packages/types/index.ts'

export class AlertServiceImpl implements AlertService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Persist a notification for the given user.
   *
   * Wiring notes:
   *  - Req 9.2: post_published — call this from the publish flow after a
   *    successful SocialMediaPublisher.publish() with:
   *      { type: 'post_published', severity: 'success', title: 'Post published', ... }
   *  - Req 9.3: retry_exhausted — call this from the RetryEngine when
   *    all retry attempts are exhausted with:
   *      { type: 'retry_exhausted', severity: 'error', title: 'Retry exhausted', ... }
   *  - Req 9.4: post_retrying — call this from the RetryEngine on each
   *    failed attempt with:
   *      { type: 'post_retrying', severity: 'warning', title: 'Post retrying', ... }
   *    Include `metadata: { nextRetryAt: '<ISO string>' }` so the UI can
   *    display the estimated next retry time.
   *  - Req 9.8: billing alerts — wire from BillingService for events such as
   *    subscription_renewed, subscription_expired, payment_failed with:
   *      { type: 'payment_failed', severity: 'error', title: 'Payment failed', ... }
   */
  async notify(userId: string, event: AlertEvent): Promise<void> {
    const { error } = await this.supabase.from('notifications').insert({
      user_id: userId,
      type: event.type,
      severity: event.severity,
      title: event.title,
      message: event.message,
      metadata: event.metadata ?? {},
      read: false,
    })

    if (error) {
      throw error
    }
  }

  /**
   * Retrieve notifications for a user, optionally filtering to unread only.
   * Results are ordered newest-first.
   */
  async getNotifications(
    userId: string,
    unreadOnly?: boolean,
  ): Promise<Notification[]> {
    let query = this.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (unreadOnly) {
      query = query.eq('read', false)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    if (!data) {
      return []
    }

    return data.map((row) => this.rowToNotification(row))
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    if (error) {
      throw error
    }
  }

  /**
   * Mark all notifications as read for the given user.
   */
  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) {
      throw error
    }
  }

  /**
   * Subscribe to real-time INSERT events on the notifications table
   * filtered to the given user's rows via Supabase Realtime.
   *
   * Returns an Unsubscribe function that removes the channel when called.
   */
  subscribeToRealtime(
    userId: string,
    callback: (n: Notification) => void,
  ): Unsubscribe {
    const channel = this.supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callback(this.rowToNotification(payload.new))
        },
      )
      .subscribe()

    return () => {
      this.supabase.removeChannel(channel)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map a raw database row to the Notification interface.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rowToNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      metadata: row.metadata ?? {},
      read: row.read,
      createdAt: new Date(row.created_at),
    }
  }
}
