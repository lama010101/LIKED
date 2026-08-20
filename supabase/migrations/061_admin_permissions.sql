-- ============================================================
-- Migration 061 — P12: Admin & Permissions
-- ============================================================
--
-- 1. Create grant_folder_admin + grant_group_admin RPCs
-- 2. Add RLS INSERT/DELETE policies on admin tables
-- 3. Fix rename_folder to check ownership or admin
-- 4. Create revoke_folder_admin + revoke_group_admin RPCs
-- 5. Create is_folder_admin + is_group_admin helper RPCs
--
-- Ref: PRD §21 (admin permissions), §17.2 (grant via long-press)

-- ============================================================
-- A. Helper RPCs: is_folder_admin / is_group_admin
-- ============================================================

CREATE OR REPLACE FUNCTION is_folder_admin(p_folder_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM folders
    WHERE id = p_folder_id
      AND owner_id = p_user_id
      AND deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM folder_admins
    WHERE folder_id = p_folder_id
      AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_group_admin(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id
      AND owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM group_admins
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_folder_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_group_admin(UUID, UUID) TO authenticated;

-- ============================================================
-- B. Grant admin RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION grant_folder_admin(
  p_folder_id UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is owner or admin of the folder
  IF NOT is_folder_admin(p_folder_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized: caller must be folder owner or admin'
      USING ERRCODE = 'P0001';
  END IF;

  -- Don't grant admin to self (already implicit)
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot grant admin to self'
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert admin record (idempotent)
  INSERT INTO folder_admins (folder_id, user_id, granted_by)
  VALUES (p_folder_id, p_target_user_id, auth.uid())
  ON CONFLICT (folder_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION grant_group_admin(
  p_group_id UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is owner or admin of the group
  IF NOT is_group_admin(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized: caller must be group owner or admin'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot grant admin to self'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO group_admins (group_id, user_id, granted_by)
  VALUES (p_group_id, p_target_user_id, auth.uid())
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION grant_folder_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION grant_group_admin(UUID, UUID) TO authenticated;

-- ============================================================
-- C. Revoke admin RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION revoke_folder_admin(
  p_folder_id UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only owner can revoke admin rights
  IF NOT EXISTS (
    SELECT 1 FROM folders
    WHERE id = p_folder_id
      AND owner_id = auth.uid()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Not authorized: only folder owner can revoke admin'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM folder_admins
  WHERE folder_id = p_folder_id
    AND user_id = p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_group_admin(
  p_group_id UUID,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id
      AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized: only group owner can revoke admin'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM group_admins
  WHERE group_id = p_group_id
    AND user_id = p_target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION revoke_folder_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_group_admin(UUID, UUID) TO authenticated;

-- ============================================================
-- D. Fix rename_folder to check ownership or admin
-- ============================================================

CREATE OR REPLACE FUNCTION rename_folder(p_folder_id UUID, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is owner or admin of the folder
  IF NOT is_folder_admin(p_folder_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized: caller must be folder owner or admin'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE folders
  SET name = p_name
  WHERE id = p_folder_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION rename_folder(UUID, TEXT) TO authenticated;

-- ============================================================
-- E. RLS policies on admin tables (INSERT/DELETE service_role only)
-- ============================================================

-- folder_admins: INSERT via RPC (service_role), DELETE via RPC (service_role)
CREATE POLICY "folder_admins_insert_service_role"
  ON folder_admins
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "folder_admins_delete_service_role"
  ON folder_admins
  FOR DELETE
  TO service_role
  USING (true);

-- group_admins: same pattern
CREATE POLICY "group_admins_insert_service_role"
  ON group_admins
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "group_admins_delete_service_role"
  ON group_admins
  FOR DELETE
  TO service_role
  USING (true);
