-- Migration: 005_create_scheduled_posts
-- Purpose: Creates the scheduled_posts table storing scheduled and published post lifecycle data.

CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  channel_id          UUID        NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  text_content        TEXT,
  media_asset_ids     UUID[]      NOT NULL DEFAULT '{}',
  media_type          TEXT        CHECK (media_type IN ('photo', 'video', 'audio', 'document')),
  scheduled_at        TIMESTAMPTZ NOT NULL,
  status              TEXT        NOT NULL CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'retrying', 'failed', 'cancelled')),
  retry_count         INTEGER     NOT NULL DEFAULT 0,
  max_retries         INTEGER     NOT NULL DEFAULT 3,
  platform_message_id TEXT,
  published_at        TIMESTAMPTZ,
  next_retry_at       TIMESTAMPTZ,
  recurrence_rule_id  UUID        REFERENCES public.recurrence_rules(id) ON DELETE SET NULL,
  parent_post_id      UUID        REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_scheduled_posts_updated_at
BEFORE UPDATE ON public.scheduled_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.scheduled_posts IS
  'Scheduled posts and their lifecycle state for user publishing workflows.';
COMMENT ON COLUMN public.scheduled_posts.media_asset_ids IS
  'Referenced asset IDs attached to this post.';
COMMENT ON COLUMN public.scheduled_posts.status IS
  'Post lifecycle status used by the scheduler and retry engine.';
