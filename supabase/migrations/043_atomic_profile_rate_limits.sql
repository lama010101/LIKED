-- Migration 043 — FIX-WRITE-02: Move username and avatar rate-limit enforcement into DB RPCs
--
-- Replaces update_display_name and update_avatar_key with atomic versions
-- that enforce rate limits inside the DB using SELECT ... FOR UPDATE.
--
-- FINDING-WRITE-ATOMICITY-6: update_display_name pre-checks rate/uniqueness in TypeScript
-- FINDING-WRITE-ATOMICITY-7: update_avatar_key accepts pre-computed count from TypeScript

-- ============================================================
-- A. Replace update_display_name
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_display_name(
  p_user_id UUID,
  p_display_name TEXT
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_name TEXT;
  v_changed_at TIMESTAMPTZ;
  v_exists INT;
BEGIN
  -- Lock user row
  SELECT display_name, username_changed_at
  INTO v_old_name, v_changed_at
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'USER_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Rate limit: 1 per 24 hours
  IF v_changed_at IS NOT NULL AND NOW() - v_changed_at < interval '24 hours' THEN
    RETURN QUERY SELECT false, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Uniqueness check on normalized name
  SELECT 1 INTO v_exists
  FROM users
  WHERE normalized_display_name = LOWER(TRIM(REGEXP_REPLACE(p_display_name, '\s+', ' ', 'g')))
    AND id != p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT false, 'NAME_TAKEN'::TEXT;
    RETURN;
  END IF;

  -- Update user
  UPDATE users
  SET
    display_name = p_display_name,
    normalized_display_name = LOWER(TRIM(REGEXP_REPLACE(p_display_name, '\s+', ' ', 'g'))),
    username_changed_at = NOW()
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'username_change',
    NULL,
    NULL,
    jsonb_build_object('old', v_old_name, 'new', p_display_name)
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_display_name(UUID, TEXT) TO authenticated;

-- ============================================================
-- B. Replace update_avatar_key
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_avatar_key(
  p_user_id UUID,
  p_avatar_key TEXT
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_last_reset DATE;
  v_old_key TEXT;
BEGIN
  -- Lock user row
  SELECT avatar_change_count_today, avatar_last_reset_date, avatar_key
  INTO v_count, v_last_reset, v_old_key
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'USER_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Reset count if new calendar day
  IF v_last_reset IS NULL OR v_last_reset < CURRENT_DATE THEN
    v_count := 0;
    v_last_reset := CURRENT_DATE;
  END IF;

  -- Rate limit: 5 per day
  IF v_count >= 5 THEN
    RETURN QUERY SELECT false, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Update user
  UPDATE users
  SET
    avatar_key = p_avatar_key,
    avatar_change_count_today = v_count + 1,
    avatar_last_reset_date = v_last_reset
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'avatar_change',
    NULL,
    NULL,
    jsonb_build_object('old', v_old_key, 'new', p_avatar_key)
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_avatar_key(UUID, TEXT) TO authenticated;
