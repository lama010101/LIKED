-- ============================================================
-- Migration 103 — N7 sidebar-query drift: missing read RPCs
-- ============================================================
-- Spec 04_FEED_SQL_SPEC.md §5.4–5.7 specifies five read RPCs.
-- get_folder_tree (083) and get_user_folders (084) already exist live.
-- This migration creates the four that were never built:
--   §5.4 get_folder_access_users, get_group_access_users
--   §5.6 get_unread_notification_count
--   §5.7 get_trash_count
-- Authz gates follow the migration-094 pattern:
--   service_role bypass, authenticated caller must match p_user_id
--   (or be a member of the requested group for get_group_access_users).
-- ============================================================

-- ============================================================
-- §5.4 Friends with access to a folder (highlight query)
-- ============================================================
CREATE OR REPLACE FUNCTION get_folder_access_users(
  p_folder_id UUID,
  p_requester_id UUID
) RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  avatar_key   TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR (auth.role() = 'authenticated' AND p_requester_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT DISTINCT
    u.id,
    u.display_name,
    u.avatar_key
  FROM causes c
  JOIN users u ON u.id = (c.metadata->>'user_id')::UUID
  WHERE
    c.cause_type = 'direct_share'
    AND c.metadata->>'folder_id' = p_folder_id::TEXT
    AND (c.metadata->>'user_id')::UUID != p_requester_id
  ORDER BY u.display_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_folder_access_users(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_folder_access_users(UUID, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION get_folder_access_users(UUID, UUID) FROM PUBLIC, anon;

-- ============================================================
-- §5.4 Members of a group (highlight query)
-- Gate: caller must be a group member (or service_role).
-- ============================================================
CREATE OR REPLACE FUNCTION get_group_access_users(
  p_group_id UUID
) RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  avatar_key   TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR (auth.role() = 'authenticated' AND EXISTS (
              SELECT 1 FROM group_members gm
              WHERE gm.group_id = p_group_id AND gm.user_id = auth.uid()))) THEN
    RAISE EXCEPTION 'Caller is not a member of this group' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.avatar_key
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = p_group_id
  ORDER BY u.display_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_access_users(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_access_users(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION get_group_access_users(UUID) FROM PUBLIC, anon;

-- ============================================================
-- §5.6 Notification count (bell badge)
-- ============================================================
CREATE OR REPLACE FUNCTION get_unread_notification_count(
  p_user_id UUID
) RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM notifications
    WHERE user_id = p_user_id AND read = false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_unread_notification_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION get_unread_notification_count(UUID) FROM PUBLIC, anon;

-- ============================================================
-- §5.7 Trash item count (badge)
-- ============================================================
CREATE OR REPLACE FUNCTION get_trash_count(
  p_user_id UUID
) RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM nodes
    WHERE owner_id = p_user_id AND deleted_at IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_trash_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trash_count(UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION get_trash_count(UUID) FROM PUBLIC, anon;
