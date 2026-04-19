-- ============================================================
-- Migration: 014_backfill_missing_user_profiles
-- One-time repair: Backfill public.users rows for existing auth
-- users that don't have a corresponding public.users row.
-- 
-- BUG-01 follow-up: The trigger in 013 only fires on new inserts.
-- This migration fixes existing broken accounts.
-- ============================================================

INSERT INTO public.users (
  id,
  display_name,
  normalized_display_name,
  language_code,
  avatar_key,
  avatar_change_count_today,
  created_at
)
SELECT
  a.id,
  COALESCE(
    a.raw_user_meta_data->>'full_name',
    a.raw_user_meta_data->>'name',
    split_part(a.email, '@', 1),
    'user'
  ) AS display_name,
  lower(trim(COALESCE(
    a.raw_user_meta_data->>'full_name',
    a.raw_user_meta_data->>'name',
    split_part(a.email, '@', 1),
    'user'
  ))) || '_' || left(a.id::text, 4) AS normalized_display_name,
  'en',
  NULL,
  0,
  a.created_at
FROM auth.users a
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = a.id
)
ON CONFLICT (id) DO NOTHING;
