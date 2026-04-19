-- ============================================================
-- Sort-aware feed RPCs
-- P6-T03
-- Adds p_sort TEXT DEFAULT 'newest' parameter to feed functions.
-- Supported values: 'newest', 'oldest', 'rating', 'most_shared', 'custom'.
-- Unknown values fall back to 'newest'.
-- ============================================================

-- Previous signatures had different parameter lists, so we must DROP before
-- recreating with the new signature.
DROP FUNCTION IF EXISTS get_visible_nodes(UUID);
DROP FUNCTION IF EXISTS get_nodes_in_folder(UUID, UUID);

-- ------------------------------------------------------------
-- get_visible_nodes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_visible_nodes(
  p_user_id UUID,
  p_sort    TEXT DEFAULT 'newest'
)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT n.*
  FROM nodes n
  LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = n.id
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
  ORDER BY
    CASE WHEN p_sort = 'oldest'      THEN n.created_at     END ASC,
    CASE WHEN p_sort = 'rating'      THEN nsc.avg_rating   END DESC NULLS LAST,
    CASE WHEN p_sort = 'most_shared' THEN nsc.share_count  END DESC NULLS LAST,
    n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_visible_nodes(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_visible_nodes(UUID, TEXT) TO service_role;

-- ------------------------------------------------------------
-- get_nodes_in_folder
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_nodes_in_folder(
  p_user_id   UUID,
  p_folder_id UUID,
  p_sort      TEXT DEFAULT 'newest'
)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT n.*
  FROM nodes n
  JOIN folder_edges fe ON fe.node_id = n.id
  LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = n.id
  WHERE fe.folder_id = p_folder_id
    AND n.deleted_at IS NULL
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
  ORDER BY
    CASE WHEN p_sort = 'oldest'      THEN n.created_at     END ASC,
    CASE WHEN p_sort = 'rating'      THEN nsc.avg_rating   END DESC NULLS LAST,
    CASE WHEN p_sort = 'most_shared' THEN nsc.share_count  END DESC NULLS LAST,
    n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_nodes_in_folder(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_nodes_in_folder(UUID, UUID, TEXT) TO service_role;
