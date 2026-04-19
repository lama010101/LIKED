-- ============================================================
-- Feed view tabs + Mine sub-filter (P9-T01)
-- Extends get_visible_nodes with p_view and p_mine_filter
-- ============================================================

DROP FUNCTION IF EXISTS get_visible_nodes(UUID, TEXT);

-- ------------------------------------------------------------
-- get_visible_nodes with view filter
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_visible_nodes(
  p_user_id       UUID,
  p_sort          TEXT    DEFAULT 'newest',
  p_view          TEXT    DEFAULT 'all',        -- 'all' | 'mine' | 'received'
  p_mine_filter   TEXT    DEFAULT 'all'         -- 'all' | 'not_shared' | 'shared'  (only when p_view='mine')
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

    -- Visibility base: owner OR has edge to user
    AND (
      n.owner_id = p_user_id
      OR EXISTS (
        SELECT 1 FROM edges e
        WHERE e.node_id = n.id AND e.user_id = p_user_id
      )
    )

    -- Block filter
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
         OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
    )

    -- View filter
    AND (
      p_view = 'all'
      OR (
        p_view = 'mine'
        AND n.origin_user_id = p_user_id
        AND (
          p_mine_filter = 'all'
          OR (
            p_mine_filter = 'shared'
            AND EXISTS (
              SELECT 1 FROM edges e
              WHERE e.node_id = n.id
                AND e.sender_id = p_user_id
                AND e.direction = 'sent'
            )
          )
          OR (
            p_mine_filter = 'not_shared'
            AND NOT EXISTS (
              SELECT 1 FROM edges e
              WHERE e.node_id = n.id
                AND e.sender_id = p_user_id
                AND e.direction = 'sent'
            )
          )
        )
      )
      OR (
        p_view = 'received'
        AND EXISTS (
          SELECT 1 FROM edges e
          WHERE e.node_id = n.id
            AND e.user_id = p_user_id
            AND e.direction = 'received'
        )
      )
    )

  ORDER BY
    CASE WHEN p_sort = 'oldest'      THEN n.created_at     END ASC,
    CASE WHEN p_sort = 'rating'      THEN nsc.avg_rating   END DESC NULLS LAST,
    CASE WHEN p_sort = 'most_shared' THEN nsc.share_count  END DESC NULLS LAST,
    n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_visible_nodes(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_visible_nodes(UUID, TEXT, TEXT, TEXT) TO service_role;
