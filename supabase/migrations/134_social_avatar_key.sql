-- ============================================================
-- Migration 134 — UIX-POLISH-001: social avatar default
-- ============================================================
-- Google OAuth puts the provider avatar in raw_user_meta_data
-- ('avatar_url' / 'picture'), but ensure_user_profile always wrote
-- avatar_key = NULL → every user rendered the gray initial disk.
-- Now avatar_key stores the social URL at signup; it still accepts
-- an internal storage key from update_avatar_key (user upload wins
-- by overwriting the URL). Rendering side: avatarUrl() passes
-- http(s) values through unchanged.
-- Backfill copies the provider avatar for existing users whose
-- avatar_key is still NULL.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_base_name TEXT;
  v_avatar TEXT;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'user'
  );
  v_base_name := lower(trim(v_display_name));
  v_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  BEGIN
    INSERT INTO public.users (id, display_name, normalized_display_name, language_code,
                              avatar_key, avatar_change_count_today, created_at)
    VALUES (NEW.id, v_display_name, v_base_name, 'en', v_avatar, 0, NOW())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.users (id, display_name, normalized_display_name, language_code,
                              avatar_key, avatar_change_count_today, created_at)
    VALUES (NEW.id, v_display_name, v_base_name || '_' || left(NEW.id::text, 4), 'en', v_avatar, 0, NOW())
    ON CONFLICT (id) DO NOTHING;
  END;

  IF NEW.email IS NOT NULL THEN
    UPDATE public.friend_invites
       SET to_user_id = NEW.id
     WHERE lower(to_email) = lower(NEW.email)
       AND to_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: existing users with no uploaded avatar get their provider
-- avatar URL (Google: avatar_url, fallback picture). Uploaded keys are
-- never touched (avatar_key IS NULL guard).
UPDATE public.users u
   SET avatar_key = COALESCE(au.raw_user_meta_data->>'avatar_url',
                             au.raw_user_meta_data->>'picture')
  FROM auth.users au
 WHERE u.id = au.id
   AND u.avatar_key IS NULL
   AND COALESCE(au.raw_user_meta_data->>'avatar_url',
                au.raw_user_meta_data->>'picture') IS NOT NULL;
