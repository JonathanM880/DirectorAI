-- Migration: 011_fix_scheduled_posts_and_audit_log
-- Purpose: Adds next_retry_at column to scheduled_posts and enforces occurred_at server-side in audit_log.

-- 1. Add next_retry_at column if it does not exist
ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- 2. Add trigger to enforce occurred_at server-side on audit_log
CREATE OR REPLACE FUNCTION public.enforce_audit_log_occurred_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.occurred_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_occurred_at ON public.audit_log;

CREATE TRIGGER trg_audit_log_occurred_at
BEFORE INSERT ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_log_occurred_at();
