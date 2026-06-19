-- Migration: 008_create_notifications
-- Purpose: Creates the notifications table used by the AlertService.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  severity    TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS
  'User-facing notifications for publish events, retry alerts, and billing updates.';
COMMENT ON COLUMN public.notifications.metadata IS
  'Arbitrary structured metadata associated with the notification.';
