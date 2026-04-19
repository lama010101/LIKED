-- ============================================================
-- Search functionality (P9-T02)
-- Translation-aware search with ILIKE on title, description, and tag labels
-- ============================================================

-- Enable pg_trgm for trigram search support (optional, enables % operator)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- GIN indexes for fast text search
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_translations_title_gin ON translations USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_translations_description_gin ON translations USING gin(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tag_translations_label_gin ON tag_translations USING gin(label gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nodes_title_gin ON nodes USING gin(title gin_trgm_ops);

-- ------------------------------------------------------------
-- search_nodes: Translation-aware search RPC
-- Searches translations (title, description), tag_translations (label), 
-- and falls back to nodes.title
-- All results filtered through visibility model
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_nodes(
  p_user_id       UUID,
  p_query         TEXT,
  p_language_code TEXT DEFAULT 'en',
  p_sort          TEXT DEFAULT 'newest',
  p_view          TEXT DEFAULT 'all',        -- 'all' | 'mine' | 'received'
  p_mine_filter   TEXT DEFAULT 'all'         -- 'all' | 'not_shared' | 'shared' (only when p_view='mine')
)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT n.*
  FROM nodes n
  LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = n.id

  -- Search matching: translations, tag_translations, or nodes.title fallback
  WHERE (
    -- Match in translations (title or description) for user's language
    EXISTS (
      SELECT 1 FROM translations t
      WHERE t.node_id = n.id
        AND t.language_code = p_language_code
        AND (
          t.title ILIKE '%' || p_query || '%'
          OR t.description ILIKE '%' || p_query || '%'
        )
    )
    -- Match in tag_translations (label) -> find nodes via tag_edges
    OR EXISTS (
      SELECT 1 FROM tag_translations tt
      JOIN tag_edges te ON te.tag_id = tt.tag_id
      WHERE te.node_id = n.id
        AND tt.language_code = p_language_code
        AND tt.label ILIKE '%' || p_query || '%'
    )
    -- Fallback: match in nodes.title (for nodes without translation)
    OR n.title ILIKE '%' || p_query || '%'
  )

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

  -- View filter (same logic as get_visible_nodes)
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

  -- Exclude soft-deleted nodes
  AND n.deleted_at IS NULL

  ORDER BY
    CASE WHEN p_sort = 'oldest'      THEN n.created_at     END ASC,
    CASE WHEN p_sort = 'rating'      THEN nsc.avg_rating   END DESC NULLS LAST,
    CASE WHEN p_sort = 'most_shared' THEN nsc.share_count  END DESC NULLS LAST,
    n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION search_nodes(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_nodes(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
