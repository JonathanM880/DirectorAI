-- Migration: 006_create_audit_log
-- Purpose: Creates the audit_log table to record immutable publish, retry, and moderation events.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  post_id             UUID        REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  action              TEXT        NOT NULL CHECK (action IN ('published', 'failed', 'retried', 'cancelled', 'edited', 'deleted')),
  platform            TEXT        NOT NULL,
  platform_message_id TEXT,
  error_code          TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_occurred_at_not_null CHECK (occurred_at IS NOT NULL);

COMMENT ON TABLE public.audit_log IS
  'Immutable audit log for publish events, retries, and moderation actions.';
COMMENT ON COLUMN public.audit_log.metadata IS
  'Structured metadata describing the audit event.';
