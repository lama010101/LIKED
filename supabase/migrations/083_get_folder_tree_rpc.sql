-- ============================================================
-- Migration 083 — AUDIT-06 P1-11/P2-2: get_folder_tree RPC
-- ============================================================
-- Replaces the TypeScript in-memory join in lib/db/folders.ts:getFolderTree
-- which used the service client (bypassing RLS) and joined edges/causes
-- in application memory.
--
-- Returns folders owned by user OR shared with user (via direct_share
-- causes with metadata->>folder_id where the user has an edge to that
-- cause). Single SQL query, RLS-respecting (uses auth.uid()).
--
-- is_project computed as (parent_folder_id IS NULL).
-- Sorted: projects first, then by name.
-- ============================================================

CREATE OR REPLACE FUNCTION get_folder_tree(
  p_user_id UUID
)
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  owner_id         UUID,
  parent_folder_id UUID,
  is_project       BOOLEAN,
  color_hex        TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    f.id,
    f.name,
    f.owner_id,
    f.parent_folder_id,
    (f.parent_folder_id IS NULL) AS is_project,
    f.color_hex,
    f.deleted_at,
    f.created_at
  FROM folders f
  WHERE f.deleted_at IS NULL
    AND (
      -- Owned by user
      f.owner_id = p_user_id
      OR
      -- Shared with user: a direct_share cause with folder_id in metadata
      -- where the user has an edge to that cause
      EXISTS (
        SELECT 1
        FROM causes c
        JOIN edges e ON e.cause_id = c.id
        WHERE c.cause_type = 'direct_share'
          AND (c.metadata->>'folder_id')::UUID = f.id
          AND e.user_id = p_user_id
      )
    )
  ORDER BY
    (f.parent_folder_id IS NULL) DESC,  -- projects first
    f.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_folder_tree(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_folder_tree(UUID) TO service_role;
