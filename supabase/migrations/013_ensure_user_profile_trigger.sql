-- ============================================================
-- Trigger: ensure_user_profile_trigger
-- Auto-creates public.users row when auth.users row is inserted
-- Safety net for BUG-01 — FK violations on node creation
-- ============================================================

-- Function to create user profile from auth trigger
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_display_name TEXT;
  v_normalized_name TEXT;
  v_base_name TEXT;
  v_suffix TEXT;
BEGIN
  -- Generate display name from metadata or email
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'user'
  );

  -- Base normalized name
  v_base_name := lower(trim(v_display_name));
  v_suffix := '_' || left(NEW.id::text, 4);
  
  -- Handle uniqueness: append suffix if conflict would occur
  -- We try the base name first, then with suffix if needed
  v_normalized_name := v_base_name;
  
  -- Insert with ON CONFLICT DO NOTHING to never overwrite existing
  INSERT INTO public.users (
    id,
    display_name,
    normalized_display_name,
    language_code,
    avatar_key,
    avatar_change_count_today,
    created_at
  ) VALUES (
    NEW.id,
    v_display_name,
    v_normalized_name,
    'en',
    NULL,
    0,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- If the normalized_display_name conflicts (unique constraint), 
  -- we need to retry with a suffix. The simple approach: if insert 
  -- didn't happen due to id conflict, we're done. For normalized 
  -- name conflicts, we rely on the unique constraint handling below.
  
  -- Handle normalized_display_name uniqueness by updating if we hit a conflict
  -- This shouldn't happen often due to ON CONFLICT (id) above, but for
  -- edge cases where a profile exists with same normalized name:
  IF NOT FOUND THEN
    -- Row already exists by id, nothing to do
    RETURN NEW;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If we hit a normalized_display_name conflict, retry with suffix
    INSERT INTO public.users (
      id,
      display_name,
      normalized_display_name,
      language_code,
      avatar_key,
      avatar_change_count_today,
      created_at
    ) VALUES (
      NEW.id,
      v_display_name,
      v_base_name || v_suffix,
      'en',
      NULL,
      0,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO service_role;

-- Create the trigger on auth.users
-- Note: This runs AFTER INSERT on auth.users table
DROP TRIGGER IF EXISTS ensure_user_profile_trigger ON auth.users;

CREATE TRIGGER ensure_user_profile_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_user_profile();

-- Comment for documentation
COMMENT ON FUNCTION public.ensure_user_profile() IS 
  'Automatically creates a public.users row when a new auth.users row is inserted. Safety net to prevent FK violations.';
