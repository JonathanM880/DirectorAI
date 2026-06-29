-- Migration: 015_add_default_user_ids
-- Purpose: Set default value of user_id to auth.uid() for user-owned tables to support client inserts without passing user_id explicitly.

ALTER TABLE public.channels ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.assets ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.scheduled_posts ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.recurrence_rules ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.audit_log ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.subscriptions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.notifications ALTER COLUMN user_id SET DEFAULT auth.uid();
