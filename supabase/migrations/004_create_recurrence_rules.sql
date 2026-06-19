-- Migration: 004_create_recurrence_rules
-- Purpose: Creates recurrence rules used to compute schedule recurrence instances for repeating posts.

CREATE TABLE IF NOT EXISTS public.recurrence_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  frequency       TEXT        NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval        INTEGER     NOT NULL DEFAULT 1,
  days_of_week    INTEGER[],
  end_date        TIMESTAMPTZ,
  max_occurrences INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.recurrence_rules IS
  'Recurrence rules for scheduled posts to support daily, weekly, and monthly repeat patterns.';
COMMENT ON COLUMN public.recurrence_rules.days_of_week IS
  'List of ISO weekday values [1..7] used for weekly recurrence patterns.';
