-- Migration: 018_add_telegram_chat_id
-- Purpose: Adds telegram_chat_id column to scheduled_posts for mapping Telegram webhook updates

ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

COMMENT ON COLUMN public.scheduled_posts.telegram_chat_id IS
  'Numeric Telegram chat ID from the Bot API response, used to map webhook updates to posts.';
