-- Migration: 007_create_subscriptions
-- Purpose: Creates the subscriptions table storing Stripe and usage data per user.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT        NOT NULL,
  stripe_subscription_id  TEXT        NOT NULL,
  plan_id                 TEXT        NOT NULL CHECK (plan_id IN ('starter', 'professional', 'agency')),
  status                  TEXT        NOT NULL CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  current_period_start    TIMESTAMPTZ NOT NULL,
  current_period_end      TIMESTAMPTZ NOT NULL,
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  ai_generations_this_month INTEGER   NOT NULL DEFAULT 0,
  posts_this_month        INTEGER     NOT NULL DEFAULT 0,
  storage_used_bytes      BIGINT      NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.subscriptions IS
  'Subscription state and usage counters for each user.''s billing plan.';
COMMENT ON COLUMN public.subscriptions.plan_id IS
  'User subscription plan: starter, professional, or agency.';
