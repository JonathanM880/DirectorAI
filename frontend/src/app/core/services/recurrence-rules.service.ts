import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { RecurrenceRule } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class RecurrenceRulesService {
  private supabase = inject(SupabaseClient);

  async createRule(rule: {
    user_id: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    interval?: number;
    days_of_week?: number[] | null;
    end_date?: string | null;
    max_occurrences?: number | null;
  }): Promise<any> {
    const { data, error } = await this.supabase
      .from('recurrence_rules')
      .insert({
        ...rule,
        interval: rule.interval ?? 1
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating recurrence rule:', error);
      throw error;
    }

    return data;
  }

  async updateRule(id: string, rule: Partial<{
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    days_of_week: number[] | null;
    end_date: string | null;
    max_occurrences: number | null;
  }>): Promise<any> {
    const { data, error } = await this.supabase
      .from('recurrence_rules')
      .update(rule)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating recurrence rule:', error);
      throw error;
    }

    return data;
  }

  async deleteRule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('recurrence_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting recurrence rule:', error);
      throw error;
    }
  }
}
