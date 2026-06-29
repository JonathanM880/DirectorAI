-- Migration: 007_create_subscriptions (Modified to DROP)
-- Purpose: Remove subscriptions table as billing features are deprecated.

DROP TABLE IF EXISTS public.subscriptions CASCADE;
