-- ============================================================
-- Migration 084 — AUDIT-06 P2-11: get_user_folders RPC
-- ============================================================
-- Replaces the 4-query + in-memory aggregation in
-- lib/db/folders.ts:getUserFolders (card counts, thumbnails, subfolder
-- counts computed in TypeScript).
--
-- Returns folders owned by the user with:
--   - node_count: cards in folder + subfolders in folder
--   - thumbnails: up to 4 thumbnail keys from child nodes
--
-- Single SQL query with subqueries. RLS-respecting (owner filter).
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_folders(
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
  created_at       TIMESTAMPTZ,
  node_count       BIGINT,
  thumbnails       JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.owner_id,
    f.parent_folder_id,
    (f.parent_folder_id IS NULL) AS is_project,
    f.color_hex,
    f.deleted_at,
    f.created_at,
    -- node_count = cards in this folder + subfolders of this folder
    (
      (SELECT COUNT(*) FROM folder_edges fe WHERE fe.folder_id = f.id)
      + (SELECT COUNT(*) FROM folders sub WHERE sub.parent_folder_id = f.id AND sub.deleted_at IS NULL)
    ) AS node_count,
    -- thumbnails: up to 4 thumbnail_key from child nodes
    COALESCE(
      (
        SELECT jsonb_agg(n.nodes_thumbnail)
        FROM (
          SELECT DISTINCT fe2.nodes_thumbnail
          FROM (
            SELECT
              fe_inner.folder_id AS fe_folder_id,
              nodes.thumbnail_key AS nodes_thumbnail
            FROM folder_edges fe_inner
            JOIN nodes ON nodes.id = fe_inner.node_id
            WHERE nodes.thumbnail_key IS NOT NULL
              AND nodes.deleted_at IS NULL
          ) fe2
          WHERE fe2.fe_folder_id = f.id
          LIMIT 4
        ) n
      ),
      '[]'::jsonb
    ) AS thumbnails
  FROM folders f
  WHERE f.owner_id = p_user_id
    AND f.deleted_at IS NULL
  ORDER BY f.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_folders(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_folders(UUID) TO service_role;
