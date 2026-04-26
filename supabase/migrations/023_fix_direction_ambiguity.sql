-- ============================================================
-- Migration 023 — Fix ambiguous 'direction' column reference
-- ============================================================
-- In PostgreSQL, RETURNS TABLE column names are output parameters
-- that share the function namespace. An unqualified 'direction' in
-- the deduped CTE ORDER BY was ambiguous between the source CTE
-- column and the function's output parameter.
--
-- Fix: qualify with CTE name.
-- ============================================================

-- get_feed (standard path)
CREATE OR REPLACE FUNCTION get_feed(
  p_user_id          UUID,
  p_language_code    TEXT    DEFAULT 'en',
  p_view             TEXT    DEFAULT 'all',
  p_friend_id        UUID    DEFAULT NULL,
  p_folder_id        UUID    DEFAULT NULL,
  p_group_id         UUID    DEFAULT NULL,
  p_filter_tag_ids   UUID[]  DEFAULT NULL,
  p_filter_friend_ids UUID[] DEFAULT NULL,
  p_filter_folder_ids UUID[] DEFAULT NULL,
  p_search_query     TEXT    DEFAULT NULL,
  p_sort             TEXT    DEFAULT 'newest',
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_node_id    UUID        DEFAULT NULL,
  p_limit             INTEGER     DEFAULT 20
) RETURNS TABLE (
  node_id           UUID,
  url               TEXT,
  text_content      TEXT,
  title             TEXT,
  thumbnail_key     TEXT,
  owner_id          UUID,
  language_code     TEXT,
  origin_user_id    UUID,
  origin_created_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ,
  avg_rating        NUMERIC,
  view_count        INTEGER,
  share_count       INTEGER,
  direction         TEXT,
  sender_id         UUID,
  sender_name       TEXT,
  sender_avatar_key TEXT,
  tags              JSONB,
  total_count       BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH

  visible_nodes AS (
    SELECT DISTINCT ON (n.id)
      n.id                  AS node_id,
      n.url,
      n.text_content,
      n.title               AS raw_title,
      n.thumbnail_key,
      n.owner_id,
      n.language_code       AS node_language_code,
      n.origin_user_id,
      n.origin_created_at,
      n.created_at,
      CASE
        WHEN n.owner_id = p_user_id THEN 'own'
        WHEN e.direction = 'sent'   THEN 'sent'
        ELSE 'received'
      END                   AS direction,
      e.sender_id
    FROM nodes n
    LEFT JOIN edges e
      ON e.node_id = n.id
     AND e.user_id = p_user_id
    WHERE
      n.deleted_at IS NULL
      AND (
        n.owner_id = p_user_id
        OR e.id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
           OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
      )
  ),

  context_filtered AS (
    SELECT vn.*
    FROM visible_nodes vn
    WHERE
      (p_friend_id IS NULL OR EXISTS (
        SELECT 1 FROM edges e2
        WHERE e2.node_id = vn.node_id
          AND (
            (e2.user_id = p_friend_id AND e2.sender_id = p_user_id)
            OR
            (e2.user_id = p_user_id AND e2.sender_id = p_friend_id)
          )
      ))
      AND (p_folder_id IS NULL OR EXISTS (
        SELECT 1 FROM folder_edges fe
        WHERE fe.node_id = vn.node_id
          AND fe.folder_id = p_folder_id
      ))
      AND (p_group_id IS NULL OR EXISTS (
        SELECT 1 FROM group_nodes gn
        WHERE gn.node_id = vn.node_id
          AND gn.group_id = p_group_id
      ))
  ),

  view_filtered AS (
    SELECT cf.*
    FROM context_filtered cf
    WHERE
      p_view = 'all'
      OR (p_view = 'mine'     AND cf.node_id IN (
            SELECT id FROM nodes WHERE nodes.origin_user_id = p_user_id
          )
      )
      OR (p_view = 'received' AND cf.direction = 'received')
  ),

  multi_filtered AS (
    SELECT vf.*
    FROM view_filtered vf
    WHERE
      (p_filter_tag_ids IS NULL OR (
        SELECT COUNT(DISTINCT te.tag_id)
        FROM tag_edges te
        WHERE te.node_id = vf.node_id
          AND te.tag_id = ANY(p_filter_tag_ids)
      ) = array_length(p_filter_tag_ids, 1))
      AND (p_filter_friend_ids IS NULL OR (
        SELECT COUNT(DISTINCT shared_friend)
        FROM (
          SELECT UNNEST(p_filter_friend_ids) AS shared_friend
        ) AS required_friends
        WHERE EXISTS (
          SELECT 1 FROM edges ef
          WHERE ef.node_id = vf.node_id
            AND (ef.user_id = shared_friend OR ef.sender_id = shared_friend)
        )
      ) = array_length(p_filter_friend_ids, 1))
      AND (p_filter_folder_ids IS NULL OR (
        SELECT COUNT(DISTINCT fe2.folder_id)
        FROM folder_edges fe2
        WHERE fe2.node_id = vf.node_id
          AND fe2.folder_id = ANY(p_filter_folder_ids)
      ) = array_length(p_filter_folder_ids, 1))
  ),

  search_filtered AS (
    SELECT mf.*
    FROM multi_filtered mf
    WHERE
      p_search_query IS NULL
      OR EXISTS (
        SELECT 1 FROM translations t
        WHERE t.node_id = mf.node_id
          AND t.language_code = p_language_code
          AND (
            t.title ILIKE '%' || p_search_query || '%'
            OR t.description ILIKE '%' || p_search_query || '%'
          )
      )
      OR mf.raw_title ILIKE '%' || p_search_query || '%'
      OR EXISTS (
        SELECT 1 FROM tag_edges te2
        JOIN tag_translations tt ON tt.tag_id = te2.tag_id
        WHERE te2.node_id = mf.node_id
          AND tt.language_code = p_language_code
          AND tt.label ILIKE '%' || p_search_query || '%'
      )
  ),

  with_resolved_title AS (
    SELECT
      sf.*,
      COALESCE(
        (SELECT t1.title FROM translations t1
         WHERE t1.node_id = sf.node_id
           AND t1.language_code = p_language_code
         LIMIT 1),
        (SELECT t2.title FROM translations t2
         WHERE t2.node_id = sf.node_id
           AND t2.language_code = sf.node_language_code
         LIMIT 1),
        sf.raw_title
      ) AS resolved_title
    FROM search_filtered sf
  ),

  with_meta AS (
    SELECT
      wrt.*,
      nsc.avg_rating,
      nsc.view_count,
      nsc.share_count,
      u.display_name   AS sender_name,
      u.avatar_key     AS sender_avatar_key
    FROM with_resolved_title wrt
    LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = wrt.node_id
    LEFT JOIN users u ON u.id = wrt.sender_id
  ),

  with_tags AS (
    SELECT
      wm.*,
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'tag_id',    t.id,
            'color_hex', t.color_hex,
            'label',     COALESCE(
                           (SELECT tt1.label FROM tag_translations tt1
                            WHERE tt1.tag_id = t.id
                              AND tt1.language_code = p_language_code
                            LIMIT 1),
                           (SELECT tt2.label FROM tag_translations tt2
                            WHERE tt2.tag_id = t.id
                              AND tt2.language_code = 'en'
                            LIMIT 1),
                           LEFT(t.id::TEXT, 8)
                         )
          )
          ORDER BY te.created_at ASC
        ), '[]'::jsonb)
        FROM tag_edges te
        JOIN tags t ON t.id = te.tag_id
        WHERE te.node_id = wm.node_id
      ) AS tags
    FROM with_meta wm
  ),

  deduped AS (
    SELECT DISTINCT ON (with_tags.node_id)
      *
    FROM with_tags
    ORDER BY
      with_tags.node_id,
      CASE with_tags.direction
        WHEN 'received' THEN 1
        WHEN 'sent'     THEN 2
        WHEN 'own'      THEN 3
      END
  ),

  paginated AS (
    SELECT
      d.*,
      COUNT(*) OVER() AS total_count
    FROM deduped d
    WHERE
      p_cursor_created_at IS NULL
      OR (
        CASE p_sort
          WHEN 'newest'         THEN d.created_at < p_cursor_created_at
                                  OR (d.created_at = p_cursor_created_at AND d.node_id < p_cursor_node_id)
          WHEN 'oldest'         THEN d.created_at > p_cursor_created_at
                                  OR (d.created_at = p_cursor_created_at AND d.node_id > p_cursor_node_id)
          WHEN 'most_shared'    THEN d.share_count < (SELECT nsc_cur.share_count FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id)
                                  OR (d.share_count = (SELECT nsc_cur.share_count FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id) AND d.node_id < p_cursor_node_id)
          WHEN 'highest_rated'  THEN COALESCE(d.avg_rating, -1) < COALESCE((SELECT nsc_cur.avg_rating FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id), -1)
                                  OR (COALESCE(d.avg_rating, -1) = COALESCE((SELECT nsc_cur.avg_rating FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id), -1) AND d.node_id < p_cursor_node_id)
          WHEN 'custom'         THEN TRUE
          ELSE TRUE
        END
      )
    ORDER BY
      CASE p_sort
        WHEN 'newest'        THEN d.created_at           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN d.created_at           END ASC  NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN d.share_count          END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN d.avg_rating           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'newest'        THEN d.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN d.node_id END ASC NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN d.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN d.node_id END DESC NULLS LAST
    LIMIT p_limit
  )

  SELECT
    p.node_id,
    p.url,
    p.text_content,
    p.resolved_title      AS title,
    p.thumbnail_key,
    p.owner_id,
    p.node_language_code  AS language_code,
    p.origin_user_id,
    p.origin_created_at,
    p.created_at,
    p.avg_rating,
    p.view_count,
    p.share_count,
    p.direction,
    p.sender_id,
    p.sender_name,
    p.sender_avatar_key,
    p.tags,
    p.total_count
  FROM paginated p;

END;
$$;
