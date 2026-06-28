import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuditLogEntry } from '../../features/services/scheduling-engine.service'; // Use the type from features service to keep compatibility or define it here

export interface AuditLogQueryOptions {
  page: number;
  pageSize: number;
  action?: string;
  platform?: string;
  from?: Date;
  to?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class AuditLogService {
  private supabase = inject(SupabaseClient);

  async getAuditLog(userId: string, options: AuditLogQueryOptions): Promise<{ rows: AuditLogEntry[]; total: number }> {
    const { page, pageSize, action, platform, from, to } = options;

    let query = this.supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (action)   query = query.eq('action', action);
    if (platform) query = query.eq('platform', platform);
    if (from)     query = query.gte('occurred_at', from.toISOString());
    if (to)       query = query.lte('occurred_at', to.toISOString());

    const { data, error, count } = await query;
    if (error) {
      console.error('Error fetching audit log:', error);
      throw error;
    }

    return {
      total: count ?? 0,
      rows: (data ?? []).map((row: any): AuditLogEntry => ({
        id: row.id,
        postId: row.post_id,
        action: row.action,
        platform: row.platform,
        platformMessageId: row.platform_message_id,
        errorCode: row.error_code,
        metadata: row.metadata ?? {},
        occurredAt: new Date(row.occurred_at)
      }))
    };
  }
}
