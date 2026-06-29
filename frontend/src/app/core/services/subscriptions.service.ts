import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Subscription } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionsService {
  private supabase = inject(SupabaseClient);

  async getSubscription(): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Error fetching subscription:', error);
      throw error;
    }

    if (!data) return null;

    return this.mapRow(data);
  }

  private mapRow(row: any): any {
    return {
      id: row.id,
      userId: row.user_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      planId: row.plan_id,
      status: row.status,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAtPeriodEnd: row.cancel_at_period_end,
      aiGenerationsThisMonth: row.ai_generations_this_month ?? 0,
      postsThisMonth: row.posts_this_month ?? 0,
      storageUsedBytes: row.storage_used_bytes ?? 0,
      updatedAt: new Date(row.updated_at)
    };
  }
}
