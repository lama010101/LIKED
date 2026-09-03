-- ============================================================
-- Migration 091 — AUDIT-07 P1-12: Fix RLS infinite recursion
-- ============================================================
-- Migration 087 introduced scoped RLS policies that query parent
-- tables (folders/groups), whose own RLS policies query back the
-- child tables (folder_edges/group_members) → infinite recursion.
--
-- Fix: SECURITY DEFINER helper functions that bypass RLS for the
-- cross-table ownership/membership check. This is the standard
-- Postgres pattern for avoiding RLS policy recursion.
--
-- Recursion chains fixed:
--   folder_edges → folders → folder_edges (via 041 policy)
--   folder_tree  → folders → folder_edges (via 041 policy)
--   folder_admins → folders → folder_edges (via 041 policy)
--   group_members → groups → group_members (via 003 policy)
--   group_nodes   → groups → group_members (via 003 policy)
--   group_admins  → groups → group_members (via 003 policy)
--   group_messages → group_members → groups → group_members
-- ============================================================

-- ── Helper: folder_is_accessible ─────────────────────────────
-- Returns true if the user can access the folder:
--   - folder exists and is not soft-deleted
--   - user is the owner, OR
--   - user has a direct_share cause with folder_id in metadata, OR
--   - user has an edge to a node that lives in this folder
-- SECURITY DEFINER bypasses RLS → no recursion.
CREATE OR REPLACE FUNCTION folder_is_accessible(
  p_folder_id UUID,
  p_user_id   UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = p_folder_id
      AND f.deleted_at IS NULL
      AND (
        f.owner_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM causes c
          JOIN edges e ON e.cause_id = c.id
          WHERE c.cause_type = 'direct_share'
            AND (c.metadata->>'folder_id')::UUID = f.id
            AND e.user_id = p_user_id
        )
        OR EXISTS (
          SELECT 1 FROM folder_edges fe
          JOIN edges e ON e.node_id = fe.node_id AND e.user_id = p_user_id
          WHERE fe.folder_id = f.id
        )
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION folder_is_accessible(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION folder_is_accessible(UUID, UUID) TO service_role;

-- ── Helper: folder_is_owned ──────────────────────────────────
-- Returns true if the user owns the folder (and it's not deleted).
-- Used by folder_admins policy where only owners should see records.
CREATE OR REPLACE FUNCTION folder_is_owned(
  p_folder_id UUID,
  p_user_id   UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = p_folder_id
      AND f.owner_id = p_user_id
      AND f.deleted_at IS NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION folder_is_owned(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION folder_is_owned(UUID, UUID) TO service_role;

-- ── Helper: group_is_member ──────────────────────────────────
-- Returns true if the user is a member or owner of the group
-- (and the group is not soft-deleted).
-- SECURITY DEFINER bypasses RLS → no recursion.
CREATE OR REPLACE FUNCTION group_is_member(
  p_group_id UUID,
  p_user_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = p_group_id
      AND g.deleted_at IS NULL
      AND (
        g.owner_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = g.id AND gm.user_id = p_user_id
        )
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION group_is_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION group_is_member(UUID, UUID) TO service_role;

-- ── Helper: group_is_owned ───────────────────────────────────
-- Returns true if the user owns the group (and it's not deleted).
-- Used by group_members/group_admins policies where only owners
-- should see all records.
CREATE OR REPLACE FUNCTION group_is_owned(
  p_group_id UUID,
  p_user_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = p_group_id
      AND g.owner_id = p_user_id
      AND g.deleted_at IS NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION group_is_owned(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION group_is_owned(UUID, UUID) TO service_role;

-- ============================================================
-- Update policies to use helper functions (breaks recursion)
-- ============================================================

-- ── folders: replace 041 policy that queried folder_edges ──
DROP POLICY IF EXISTS "folders_select_accessible" ON folders;
CREATE POLICY "folders_select_accessible" ON folders
  FOR SELECT TO authenticated
  USING (folder_is_accessible(id, auth.uid()));

-- ── groups: replace 003 policy that queried group_members ──
DROP POLICY IF EXISTS "groups_select_member" ON groups;
CREATE POLICY "groups_select_member" ON groups
  FOR SELECT TO authenticated
  USING (group_is_member(id, auth.uid()));

-- ── folder_edges: replace 087 policy that queried folders ──
DROP POLICY IF EXISTS "folder_edges_select_scoped" ON folder_edges;
CREATE POLICY "folder_edges_select_scoped" ON folder_edges
  FOR SELECT TO authenticated
  USING (folder_is_accessible(folder_id, auth.uid()));

-- ── folder_tree: replace 087 policy that queried folders ──
DROP POLICY IF EXISTS "folder_tree_select_scoped" ON folder_tree;
CREATE POLICY "folder_tree_select_scoped" ON folder_tree
  FOR SELECT TO authenticated
  USING (folder_is_accessible(folder_id, auth.uid()));

-- ── folder_admins: replace 087 policy that queried folders ──
DROP POLICY IF EXISTS "folder_admins_select_scoped" ON folder_admins;
CREATE POLICY "folder_admins_select_scoped" ON folder_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR folder_is_owned(folder_id, auth.uid())
  );

-- ── group_nodes: replace 087 policy that queried groups ──
DROP POLICY IF EXISTS "group_nodes_select_scoped" ON group_nodes;
CREATE POLICY "group_nodes_select_scoped" ON group_nodes
  FOR SELECT TO authenticated
  USING (group_is_member(group_id, auth.uid()));

-- ── group_members: replace 087 policy that queried groups ──
DROP POLICY IF EXISTS "group_members_select_scoped" ON group_members;
CREATE POLICY "group_members_select_scoped" ON group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR group_is_owned(group_id, auth.uid())
  );

-- ── group_admins: replace 087 policy that queried groups ──
DROP POLICY IF EXISTS "group_admins_select_scoped" ON group_admins;
CREATE POLICY "group_admins_select_scoped" ON group_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR group_is_owned(group_id, auth.uid())
  );

-- ── group_messages: replace 087 policy that queried group_members ──
-- (group_members now uses group_is_owned → no recursion, but use
--  group_is_member directly for clarity and to avoid an extra hop)
DROP POLICY IF EXISTS "group_messages_select_scoped" ON group_messages;
CREATE POLICY "group_messages_select_scoped" ON group_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR group_is_member(group_id, auth.uid())
  );
