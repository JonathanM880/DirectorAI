-- Migration: 001_create_users_profile
-- Purpose: Creates the users_profile table, which stores extended profile data for
-- authenticated users. Each row is linked 1-to-1 with an auth.users entry and is
-- automatically removed when the auth user is deleted (ON DELETE CASCADE).

-- Helper function: update the updated_at column to the current timestamp.
-- Created here so it can be reused by future tables.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Main table
CREATE TABLE IF NOT EXISTS public.users_profile (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT,
  display_name          TEXT,
  avatar_url            TEXT,
  timezone              TEXT        NOT NULL DEFAULT 'UTC',
  plan_id               TEXT        NOT NULL DEFAULT 'starter',
  onboarding_completed  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every row modification
CREATE TRIGGER trg_users_profile_updated_at
BEFORE UPDATE ON public.users_profile
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Table comment
COMMENT ON TABLE public.users_profile IS
  'Extended profile data for authenticated users. Linked 1-to-1 with auth.users. '
  'Stores display preferences, timezone, subscription plan, and onboarding state.';

-- Column comments
COMMENT ON COLUMN public.users_profile.id                   IS 'Foreign key to auth.users.id; also the primary key.';
COMMENT ON COLUMN public.users_profile.email                IS 'Denormalised from auth.users for convenient querying; immutable after creation.';
COMMENT ON COLUMN public.users_profile.display_name         IS 'Human-readable name shown in the UI.';
COMMENT ON COLUMN public.users_profile.avatar_url           IS 'URL of the user avatar image (Supabase Storage or external).';
COMMENT ON COLUMN public.users_profile.timezone             IS 'IANA timezone string, e.g. America/New_York. Defaults to UTC.';
COMMENT ON COLUMN public.users_profile.plan_id              IS 'Active subscription plan: starter | professional | agency.';
COMMENT ON COLUMN public.users_profile.onboarding_completed IS 'True once the user has finished the first-run onboarding flow.';
COMMENT ON COLUMN public.users_profile.created_at           IS 'Row creation timestamp (server-set).';
COMMENT ON COLUMN public.users_profile.updated_at           IS 'Last modification timestamp; maintained automatically by trg_users_profile_updated_at.';
