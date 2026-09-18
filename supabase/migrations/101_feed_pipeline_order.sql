-- ============================================================
-- Migration 101 — FEED-ORDER-001: align get_feed pipeline order to spec
-- ============================================================
-- 04_FEED_SQL_SPEC.md §1 mandates pipeline order:
--   cursor → ordering → dedup → limit
-- Live order (through migration 094) was:
--   dedup → cursor+ordering → limit
--
-- This migration recreates get_feed with the spec order. The 16-parameter
-- signature, auth gates, visibility predicate, filters, and final column
-- projection are unchanged — ONLY the stage ordering differs:
--
--   BEFORE: deduped AS (DISTINCT ON ...) → paginated AS (cursor WHERE + ORDER BY + LIMIT)
--   AFTER:  cursored AS (cursor WHERE) → ordered AS (ORDER BY) →
--           deduped AS (DISTINCT ON picks first-in-pipeline-order per node,
--                       direction preference 'received'>'sent'>'own' preserved
--                       as final tiebreaker) →
--           paginated AS (COUNT(*) OVER() + ORDER BY + LIMIT)
--
-- total_count semantics unchanged: count of distinct nodes matching all
-- filters incl. cursor exclusion, computed before LIMIT.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_feed(p_user_id uuid, p_language_code text DEFAULT 'en'::text, p_view text DEFAULT 'all'::text, p_friend_id uuid DEFAULT NULL::uuid, p_folder_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_filter_tag_ids uuid[] DEFAULT NULL::uuid[], p_filter_friend_ids uuid[] DEFAULT NULL::uuid[], p_filter_folder_ids uuid[] DEFAULT NULL::uuid[], p_search_query text DEFAULT NULL::text, p_sort text DEFAULT 'newest'::text, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_node_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_exclude_foldered boolean DEFAULT false, p_custom_order_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(node_id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, created_at timestamp with time zone, avg_rating numeric, view_count integer, share_count integer, direction text, sender_id uuid, sender_name text, sender_avatar_key text, tags jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
      AND (
        p_exclude_foldered IS FALSE
        OR NOT EXISTS (
          SELECT 1 FROM folder_edges fe_excl
          WHERE fe_excl.node_id = vn.node_id
        )
      )
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

  -- ================================================================
  -- FEED-ORDER-001: spec pipeline order is cursor → ordering → dedup → limit.
  -- Stages below differ from the previous definition only in ordering.
  -- ================================================================

  -- STAGE: CURSOR — filter pre-dedup rows to the pagination window
  cursored AS (
    SELECT wt.*
    FROM with_tags wt
    WHERE
      p_cursor_created_at IS NULL
      OR (
        CASE p_sort
          WHEN 'newest'         THEN wt.created_at < p_cursor_created_at
                                  OR (wt.created_at = p_cursor_created_at AND wt.node_id < p_cursor_node_id)
          WHEN 'oldest'         THEN wt.created_at > p_cursor_created_at
                                  OR (wt.created_at = p_cursor_created_at AND wt.node_id > p_cursor_node_id)
          WHEN 'most_shared'    THEN wt.share_count < (SELECT nsc_cur.share_count FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id)
                                  OR (wt.share_count = (SELECT nsc_cur.share_count FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id) AND wt.node_id < p_cursor_node_id)
          WHEN 'highest_rated'  THEN COALESCE(wt.avg_rating, -1) < COALESCE((SELECT nsc_cur.avg_rating FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id), -1)
                                  OR (COALESCE(wt.avg_rating, -1) = COALESCE((SELECT nsc_cur.avg_rating FROM nodes_sort_cache nsc_cur WHERE nsc_cur.node_id = p_cursor_node_id), -1) AND wt.node_id < p_cursor_node_id)
          WHEN 'custom'         THEN TRUE  -- custom sort applies ORDER BY separately; cursor not used
          ELSE TRUE
        END
      )
  ),

  -- STAGE: ORDERING — pipeline sort over the cursored rows
  ordered AS (
    SELECT *
    FROM cursored
    ORDER BY
      -- Custom sort: matched rows by array_position, unmatched after by created_at
      CASE
        WHEN p_sort = 'custom' AND p_custom_order_ids IS NOT NULL THEN
          array_position(p_custom_order_ids, cursored.node_id)
      END ASC NULLS LAST,
      CASE
        WHEN p_sort = 'custom' AND p_custom_order_ids IS NOT NULL THEN
          (array_position(p_custom_order_ids, cursored.node_id) IS NULL)
      END ASC,
      -- Standard sorts
      CASE p_sort
        WHEN 'newest'        THEN cursored.created_at  END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN cursored.created_at  END ASC  NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN cursored.share_count END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN cursored.avg_rating  END DESC NULLS LAST,
      CASE p_sort
        WHEN 'newest'        THEN cursored.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN cursored.node_id END ASC NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN cursored.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN cursored.node_id END DESC NULLS LAST,
      -- Custom sort tiebreaker
      CASE p_sort
        WHEN 'custom'        THEN cursored.created_at  END DESC NULLS LAST,
      CASE p_sort
        WHEN 'custom'        THEN cursored.node_id     END DESC NULLS LAST
  ),

  -- STAGE: DEDUP — collapse to one row per node_id.
  -- The row kept is the first in pipeline order (sort keys repeated below);
  -- the previous direction preference 'received' > 'sent' > 'own' is kept as
  -- the final tiebreaker for rows identical on all sort keys.
  deduped AS (
    SELECT DISTINCT ON (o.node_id)
      *
    FROM ordered o
    ORDER BY
      o.node_id,
      CASE
        WHEN p_sort = 'custom' AND p_custom_order_ids IS NOT NULL THEN
          array_position(p_custom_order_ids, o.node_id)
      END ASC NULLS LAST,
      CASE
        WHEN p_sort = 'custom' AND p_custom_order_ids IS NOT NULL THEN
          (array_position(p_custom_order_ids, o.node_id) IS NULL)
      END ASC,
      CASE p_sort
        WHEN 'newest'        THEN o.created_at           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN o.created_at           END ASC  NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN o.share_count          END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN o.avg_rating           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'newest'        THEN o.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN o.node_id END ASC NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN o.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN o.node_id END DESC NULLS LAST,
      CASE p_sort
        WHEN 'custom'        THEN o.created_at           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'custom'        THEN o.node_id              END DESC NULLS LAST,
      CASE o.direction
        WHEN 'received' THEN 1
        WHEN 'sent'     THEN 2
        WHEN 'own'      THEN 3
      END
  ),

  -- STAGE: LIMIT — total_count over the post-cursor deduped set, then page cap
  paginated AS (
    SELECT
      d.*,
      COUNT(*) OVER() AS total_count
    FROM deduped d
    ORDER BY
      -- Custom sort: matched rows by array_position, unmatched after by created_at
      CASE
        WHEN p_sort = 'custom' AND p_custom_order_ids IS NOT NULL THEN
          array_position(p_custom_order_ids, d.node_id)
      END ASC NULLS LAST,
      CASE
        WHEN p_sort = 'custom' AND p_custom_order_ids IS NOT NULL THEN
          (array_position(p_custom_order_ids, d.node_id) IS NULL)
      END ASC,
      -- Standard sorts
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
        WHEN 'highest_rated' THEN d.node_id END DESC NULLS LAST,
      -- Custom sort tiebreaker
      CASE p_sort
        WHEN 'custom'        THEN d.created_at           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'custom'        THEN d.node_id              END DESC NULLS LAST
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
$function$
;

-- Grants preserved: authenticated + service_role only (unchanged from 086/094).
GRANT EXECUTE ON FUNCTION public.get_feed(uuid, text, text, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, text, timestamp with time zone, uuid, integer, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feed(uuid, text, text, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, text, timestamp with time zone, uuid, integer, boolean, uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_feed(uuid, text, text, uuid, uuid, uuid, uuid[], uuid[], uuid[], text, text, timestamp with time zone, uuid, integer, boolean, uuid[]) FROM PUBLIC, anon;
