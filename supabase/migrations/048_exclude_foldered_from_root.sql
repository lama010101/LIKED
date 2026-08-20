-- ============================================================
-- Migration 048 — Exclude foldered nodes from root feed (BUG-FIX-01)
-- ============================================================
-- Adds p_exclude_foldered parameter to get_visible_nodes function.
-- When p_exclude_foldered is TRUE, nodes that belong to any folder
-- are excluded from the result set.
-- ============================================================

CREATE OR REPLACE FUNCTION get_visible_nodes(
  p_user_id UUID,
  p_exclude_foldered BOOLEAN DEFAULT FALSE
)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT n.*
  FROM nodes n
  WHERE n.deleted_at IS NULL
  AND (
    n.owner_id = p_user_id
    OR EXISTS (
      SELECT 1 FROM edges e
      WHERE e.node_id = n.id AND e.user_id = p_user_id
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
       OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
  )
  AND (
    p_exclude_foldered IS FALSE
    OR NOT EXISTS (
      SELECT 1 FROM folder_edges fe_excl
      WHERE fe_excl.node_id = n.id
    )
  )
  ORDER BY n.created_at DESC;
$$;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION get_visible_nodes(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION get_visible_nodes(UUID, BOOLEAN) TO service_role;
