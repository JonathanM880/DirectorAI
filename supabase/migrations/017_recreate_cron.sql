-- Migration: 017_recreate_cron
-- Purpose: Re-enables pg_cron and pg_net extensions and configures the automated cron job
-- to trigger the scheduler Edge Function every 1 minute.

-- 1. Ensure extensions are active
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Unschedule old job if it exists to prevent duplication
SELECT cron.unschedule('directorai-publish-cron');

-- 3. Schedule the new cron job using pg_net
SELECT cron.schedule(
  'directorai-publish-cron',
  '* * * * *', -- every 1 minute
  $$
  SELECT net.http_post(
    url := 'https://dnrbgoxvxkiczjtpdevu.supabase.co/functions/v1/scheduler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
