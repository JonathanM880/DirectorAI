-- Migration: 009_add_performance_indexes
-- Purpose: Adds performance indexes for common query patterns.

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_scheduled_at
  ON public.scheduled_posts(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id_scheduled_at
  ON public.scheduled_posts(user_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_occurred_at
  ON public.audit_log(user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read
  ON public.notifications(user_id, read);

CREATE INDEX IF NOT EXISTS idx_assets_user_id_folder
  ON public.assets(user_id, folder);
