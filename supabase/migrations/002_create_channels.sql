-- Migration: 002_create_channels
-- Purpose: Creates the channels table storing each user's configured social destinations.

CREATE TABLE IF NOT EXISTS public.channels (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  platform           TEXT        NOT NULL,
  name               TEXT        NOT NULL,
  channel_identifier TEXT        NOT NULL,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_user_platform_identifier_unique UNIQUE (user_id, platform, channel_identifier);

COMMENT ON TABLE public.channels IS
  'User-configured social channels that can receive scheduled posts.';
COMMENT ON COLUMN public.channels.platform IS 'Social platform identifier, e.g. telegram.';
COMMENT ON COLUMN public.channels.channel_identifier IS 'Platform-specific channel identifier or username.';
