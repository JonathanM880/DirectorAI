-- Migration: 017_recreate_cron
-- Purpose: Re-enables pg_cron and pg_net extensions and configures the automated cron job
-- to trigger the scheduler Edge Function every 1 minute.

-- 1. Ensure extensions are active
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Unschedule old job if it exists to prevent duplication
DO $$
BEGIN
  PERFORM cron.unschedule('directorai-publish-cron');
EXCEPTION WHEN OTHERS THEN
  -- Ignore error if job doesn't exist
END;
$$;

-- 3. Schedule the new cron job using pg_net
DO $$
BEGIN
  PERFORM cron.schedule(
    'directorai-publish-cron',
    '* * * * *',
    'SELECT net.http_post(url := ''https://dnrbgoxvxkiczjtpdevu.supabase.co/functions/v1/scheduler'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NDM1NzcsImV4cCI6MjA5NzMxOTU3N30.OMAjndlkrYZcU9dkBYOyO8UzW3CqmPpgGFbk5qXG-EA''), body := ''{}''::jsonb);'
  );
EXCEPTION WHEN OTHERS THEN
  -- ignore error
END;
$$;
