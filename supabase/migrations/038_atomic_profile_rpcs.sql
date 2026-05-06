-- Migration 038: Add atomic RPCs for profile and avatar updates
-- Replaces split users.update + activity_log.insert patterns with single atomic operations

CREATE OR REPLACE FUNCTION public.update_display_name(
  p_user_id uuid,
  p_display_name text,
  p_normalized text,
  p_old_display_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user display name
  UPDATE users
  SET
    display_name = p_display_name,
    normalized_display_name = p_normalized,
    username_changed_at = now()
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'username_change',
    NULL,
    NULL,
    jsonb_build_object('old', p_old_display_name, 'new', p_display_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_display_name TO authenticated;

CREATE OR REPLACE FUNCTION public.update_avatar_key(
  p_user_id uuid,
  p_avatar_key text,
  p_new_count int,
  p_today text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update user avatar
  UPDATE users
  SET
    avatar_key = p_avatar_key,
    avatar_change_count_today = p_new_count,
    avatar_last_reset_date = p_today
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'avatar_change',
    NULL,
    NULL,
    jsonb_build_object('avatar_key', p_avatar_key)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_avatar_key TO authenticated;
