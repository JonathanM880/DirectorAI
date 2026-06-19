-- Migration: 010_rls_policies
-- Purpose: Enables row level security and defines tenant isolation and audit-log immutability policies.

-- Enable RLS for all protected tables.
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_rules ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped policies for user-owned tables.
CREATE POLICY "users_profile_user_scope"
  ON public.users_profile
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "channels_user_scope"
  ON public.channels
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "assets_user_scope"
  ON public.assets
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scheduled_posts_user_scope"
  ON public.scheduled_posts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscriptions_user_scope"
  ON public.subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_user_scope"
  ON public.notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "recurrence_rules_user_scope"
  ON public.recurrence_rules
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Audit log policies: service_role can insert, owning users can read, no updates or deletes are allowed.
CREATE POLICY "audit_log_select_owner"
  ON public.audit_log
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "audit_log_insert_service_role"
  ON public.audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "audit_log_deny_update"
  ON public.audit_log
  FOR UPDATE
  TO public, authenticated, service_role
  USING (false);

CREATE POLICY "audit_log_deny_delete"
  ON public.audit_log
  FOR DELETE
  TO public, authenticated, service_role
  USING (false);

ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
