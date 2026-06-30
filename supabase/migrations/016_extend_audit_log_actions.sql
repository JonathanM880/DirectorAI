-- Migration: 016_extend_audit_log_actions
-- Purpose: Extends the check constraint on audit_log.action to support 'created' and 'publishing' states,
-- and creates an RLS insert policy for authenticated users.

-- 1. Drop existing CHECK constraint
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

-- 2. Create updated CHECK constraint supporting 'created' and 'publishing'
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK (
  action IN ('published', 'failed', 'retried', 'cancelled', 'edited', 'deleted', 'created', 'publishing')
);

-- 3. Add RLS policy to allow authenticated users to insert their own logs (e.g. on post creation/failure)
DROP POLICY IF EXISTS "audit_log_insert_owner" ON public.audit_log;
CREATE POLICY "audit_log_insert_owner"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
