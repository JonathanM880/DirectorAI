-- Migration: 012_audit_log_immutability
-- Purpose: Ensures audit_log table is strictly immutable by raising an exception on UPDATE or DELETE.

CREATE OR REPLACE FUNCTION public.block_audit_log_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'permission denied: audit_log is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_log;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION public.block_audit_log_mutations();
