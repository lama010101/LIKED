-- ============================================================
-- Migration 092 — AUDIT-08 P0: Fix RPC authorization (IDOR)
-- ============================================================
-- 42 SECURITY DEFINER functions accepted caller-supplied user IDs
-- without validating against auth.uid() → any authenticated user could
-- read any user's data or impersonate any user for writes.
--
-- Fix: add an auth.uid() gate at the top of each function body.
--   - authenticated callers must pass their OWN user id (else P0003)
--   - service_role calls (auth.uid() = NULL) pass through unchanged
--
-- Resource-only functions (set_node_deleted, delete_folder,
-- add/remove_node_from_folder) now derive ownership/access from
-- auth.uid() with service-role bypass.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_feed(p_user_id uuid, p_language_code text DEFAULT 'en'::text, p_view text DEFAULT 'all'::text, p_friend_id uuid DEFAULT NULL::uuid, p_folder_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_filter_tag_ids uuid[] DEFAULT NULL::uuid[], p_filter_friend_ids uuid[] DEFAULT NULL::uuid[], p_filter_folder_ids uuid[] DEFAULT NULL::uuid[], p_search_query text DEFAULT NULL::text, p_sort text DEFAULT 'newest'::text, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_node_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_exclude_foldered boolean DEFAULT false, p_custom_order_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(node_id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, created_at timestamp with time zone, avg_rating numeric, view_count integer, share_count integer, direction text, sender_id uuid, sender_name text, sender_avatar_key text, tags jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
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
          WHEN 'custom'         THEN TRUE  -- custom sort applies ORDER BY separately; cursor not used
          ELSE TRUE
        END
      )
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
      -- Standard sorts (unchanged from 051)
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

CREATE OR REPLACE FUNCTION public.get_social_timeline(p_user_id uuid, p_language_code text DEFAULT 'en'::text, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, url text, text_content text, title text, thumbnail_key text, owner_id uuid, direction text, sender_id uuid, sender_name text, sender_avatar_key text, avg_rating numeric, tags jsonb, folder_name text, folder_color text, folder_count bigint, folder_thumbnails jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  WITH
  -- ── Cards: visible nodes (mirrors get_feed visibility) ──
  cards AS (
    SELECT DISTINCT ON (n.id)
      'card'::TEXT AS kind,
      n.id,
      n.created_at,
      n.url,
      n.text_content,
      COALESCE(
        (SELECT t1.title FROM translations t1
         WHERE t1.node_id = n.id AND t1.language_code = p_language_code LIMIT 1),
        (SELECT t2.title FROM translations t2
         WHERE t2.node_id = n.id AND t2.language_code = n.language_code LIMIT 1),
        n.title
      ) AS title,
      n.thumbnail_key,
      n.owner_id,
      CASE
        WHEN n.owner_id = p_user_id THEN 'own'
        WHEN e.direction = 'sent' THEN 'sent'
        ELSE 'received'
      END AS direction,
      e.sender_id,
      u.display_name AS sender_name,
      u.avatar_key AS sender_avatar_key,
      nsc.avg_rating,
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'tag_id', t.id,
            'color_hex', t.color_hex,
            'label', COALESCE(
              (SELECT tt1.label FROM tag_translations tt1
               WHERE tt1.tag_id = t.id AND tt1.language_code = p_language_code LIMIT 1),
              (SELECT tt2.label FROM tag_translations tt2
               WHERE tt2.tag_id = t.id AND tt2.language_code = 'en' LIMIT 1),
              LEFT(t.id::TEXT, 8)
            )
          ) ORDER BY te.created_at ASC
        ), '[]'::jsonb)
        FROM tag_edges te
        JOIN tags t ON t.id = te.tag_id
        WHERE te.node_id = n.id
      ) AS tags,
      NULL::TEXT AS folder_name,
      NULL::TEXT AS folder_color,
      NULL::BIGINT AS folder_count,
      NULL::JSONB AS folder_thumbnails
    FROM nodes n
    LEFT JOIN edges e ON e.node_id = n.id AND e.user_id = p_user_id
    LEFT JOIN users u ON u.id = e.sender_id
    LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = n.id
    WHERE n.deleted_at IS NULL
      AND (n.owner_id = p_user_id OR e.id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
           OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
      )
  ),
  -- ── Folders: owned by user ──
  folders AS (
    SELECT
      'folder'::TEXT AS kind,
      f.id,
      f.created_at,
      NULL::TEXT AS url,
      NULL::TEXT AS text_content,
      f.name AS title,
      NULL::TEXT AS thumbnail_key,
      f.owner_id,
      NULL::TEXT AS direction,
      NULL::UUID AS sender_id,
      NULL::TEXT AS sender_name,
      NULL::TEXT AS sender_avatar_key,
      NULL::NUMERIC AS avg_rating,
      '[]'::JSONB AS tags,
      f.name AS folder_name,
      f.color_hex AS folder_color,
      (SELECT COUNT(*) FROM folder_edges fe WHERE fe.folder_id = f.id) AS folder_count,
      COALESCE(
        (SELECT jsonb_agg(n.thumbnail_key) FROM (
          SELECT DISTINCT nodes.thumbnail_key
          FROM folder_edges fe2
          JOIN nodes ON nodes.id = fe2.node_id
          WHERE nodes.thumbnail_key IS NOT NULL
            AND nodes.deleted_at IS NULL
            AND fe2.folder_id = f.id
          LIMIT 4
        ) n),
        '[]'::jsonb
      ) AS folder_thumbnails
    FROM folders f
    WHERE f.owner_id = p_user_id
      AND f.deleted_at IS NULL
  ),
  -- ── Union + paginate ──
  combined AS (
    SELECT * FROM cards
    UNION ALL
    SELECT * FROM folders
  ),
  paginated AS (
    SELECT
      c.*,
      COUNT(*) OVER() AS total_count
    FROM combined c
    WHERE
      p_cursor_created_at IS NULL
      OR (c.created_at < p_cursor_created_at)
      OR (c.created_at = p_cursor_created_at AND c.id < p_cursor_id)
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT p_limit
  )
  SELECT
    p.kind, p.id, p.created_at,
    p.url, p.text_content, p.title, p.thumbnail_key,
    p.owner_id, p.direction, p.sender_id, p.sender_name, p.sender_avatar_key,
    p.avg_rating, p.tags,
    p.folder_name, p.folder_color, p.folder_count, p.folder_thumbnails,
    p.total_count
  FROM paginated p;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_folders(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, owner_id uuid, parent_folder_id uuid, is_project boolean, color_hex text, deleted_at timestamp with time zone, created_at timestamp with time zone, node_count bigint, thumbnails jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
    (
      (SELECT COUNT(*) FROM folder_edges fe WHERE fe.folder_id = f.id)
      + (SELECT COUNT(*) FROM folders sub WHERE sub.parent_folder_id = f.id AND sub.deleted_at IS NULL)
    ) AS node_count,
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_folder_tree(p_user_id uuid)
 RETURNS TABLE(id uuid, name text, owner_id uuid, parent_folder_id uuid, is_project boolean, color_hex text, deleted_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_visible_node_by_id(p_user_id uuid, p_node_id uuid)
 RETURNS SETOF nodes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT n.*
  FROM nodes n
  WHERE n.id = p_node_id
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
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_visible_nodes(p_user_id uuid, p_exclude_foldered boolean DEFAULT false)
 RETURNS SETOF nodes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY SELECT n.* FROM nodes n WHERE n.deleted_at IS NULL AND (n.owner_id = p_user_id OR EXISTS (SELECT 1 FROM edges e WHERE e.node_id = n.id AND e.user_id = p_user_id)) AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id) OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)) AND (p_exclude_foldered IS FALSE OR NOT EXISTS (SELECT 1 FROM folder_edges fe_excl WHERE fe_excl.node_id = n.id)) ORDER BY n.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_visible_nodes(p_user_id uuid, p_sort text DEFAULT 'newest'::text, p_view text DEFAULT 'all'::text, p_mine_filter text DEFAULT 'all'::text)
 RETURNS SETOF nodes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
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
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_friend_bar(p_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_key text, to_email text, is_pending boolean, last_activity timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT
    u.id                                              AS user_id,
    u.display_name,
    u.avatar_key,
    fi.to_email,
    (fi.to_user_id IS NULL)                          AS is_pending,
    MAX(e.created_at)                                AS last_activity
  FROM friend_invites fi

  LEFT JOIN users u ON u.id = CASE
    WHEN fi.from_user_id = p_user_id THEN fi.to_user_id
    ELSE fi.from_user_id
  END

  LEFT JOIN edges e ON (
    (e.sender_id = p_user_id AND e.user_id = u.id)
    OR
    (e.sender_id = u.id AND e.user_id = p_user_id)
  )

  WHERE
    (fi.from_user_id = p_user_id OR fi.to_user_id = p_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE u.id IS NOT NULL
        AND ((b.blocker_id = p_user_id AND b.blocked_id = u.id)
          OR (b.blocker_id = u.id     AND b.blocked_id = p_user_id))
    )

  GROUP BY u.id, u.display_name, u.avatar_key, fi.to_email, fi.to_user_id
  ORDER BY last_activity DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_node_friend_ratings(p_node_id uuid, p_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_key text, score numeric, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT
    r.user_id,
    u.display_name,
    u.avatar_key,
    r.score,
    r.updated_at
  FROM ratings r
  JOIN users u ON u.id = r.user_id
  WHERE
    r.node_id = p_node_id
    AND (
      -- Include current user's own rating
      r.user_id = p_user_id
      OR
      -- Include ratings by friends (mutual friend_invites)
      EXISTS (
        SELECT 1 FROM friend_invites fi1
        WHERE fi1.from_user_id = p_user_id
          AND fi1.to_user_id = r.user_id
          AND fi1.to_user_id IS NOT NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM friend_invites fi2
        WHERE fi2.to_user_id = p_user_id
          AND fi2.from_user_id = r.user_id
      )
    )
  ORDER BY r.updated_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_visible_tags(p_user_id uuid, p_language_code text DEFAULT 'en'::text)
 RETURNS TABLE(id uuid, color_hex text, label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT DISTINCT
    t.id,
    t.color_hex,
    tt.label
  FROM tag_edges te
  JOIN tags t ON t.id = te.tag_id
  JOIN tag_translations tt ON tt.tag_id = t.id AND tt.language_code = p_language_code
  JOIN nodes n ON n.id = te.node_id
  JOIN edges e ON e.node_id = n.id AND e.user_id = p_user_id
  WHERE n.deleted_at IS NULL
  ORDER BY tt.label ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_nodes_in_folder(p_user_id uuid, p_folder_id uuid, p_sort text DEFAULT 'newest'::text)
 RETURNS SETOF nodes
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
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
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_folder_admin(p_folder_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN (
  SELECT EXISTS (
    SELECT 1 FROM folders
    WHERE id = p_folder_id
      AND owner_id = p_user_id
      AND deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM folder_admins
    WHERE folder_id = p_folder_id
      AND user_id = p_user_id
  ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN (
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id
      AND owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM group_admins
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  ));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.folder_is_accessible(p_folder_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
$function$
;

CREATE OR REPLACE FUNCTION public.folder_is_owned(p_folder_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = p_folder_id
      AND f.owner_id = p_user_id
      AND f.deleted_at IS NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.group_is_member(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
$function$
;

CREATE OR REPLACE FUNCTION public.group_is_owned(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = p_group_id
      AND g.owner_id = p_user_id
      AND g.deleted_at IS NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_node_permission(p_user_id uuid, p_node_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_owner_id UUID;
  v_permission TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Check if user is owner
  SELECT owner_id INTO v_owner_id
  FROM nodes
  WHERE id = p_node_id;

  IF v_owner_id = p_user_id THEN
    RETURN 'admin'; -- Owner has implicit admin
  END IF;

  -- Get max permission from edges
  SELECT MAX(permission) INTO v_permission
  FROM edges
  WHERE node_id = p_node_id
    AND user_id = p_user_id;

  RETURN v_permission;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_folder_permission(p_user_id uuid, p_folder_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_owner_id UUID;
  v_permission TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Check if user is owner
  SELECT owner_id INTO v_owner_id
  FROM folders
  WHERE id = p_folder_id;

  IF v_owner_id = p_user_id THEN
    RETURN 'admin'; -- Owner has implicit admin
  END IF;

  -- Get max permission from edges on nodes in this folder
  SELECT MAX(e.permission) INTO v_permission
  FROM edges e
  JOIN causes c ON e.cause_id = c.id
  WHERE c.metadata->>'folder_id' = p_folder_id::text
    AND e.user_id = p_user_id;

  RETURN v_permission;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_node_permission(p_user_id uuid, p_node_id uuid, p_required_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_permission_rank INT;
  v_required_rank INT;
  v_user_permission TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Permission ranks
  v_required_rank := CASE p_required_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  v_user_permission := get_node_permission(p_user_id, p_node_id);

  IF v_user_permission IS NULL THEN
    RETURN false;
  END IF;

  v_permission_rank := CASE v_user_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  RETURN v_permission_rank >= v_required_rank;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_folder_permission(p_user_id uuid, p_folder_id uuid, p_required_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_permission_rank INT;
  v_required_rank INT;
  v_user_permission TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Permission ranks
  v_required_rank := CASE p_required_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  v_user_permission := get_folder_permission(p_user_id, p_folder_id);

  IF v_user_permission IS NULL THEN
    RETURN false;
  END IF;

  v_permission_rank := CASE v_user_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  RETURN v_permission_rank >= v_required_rank;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hard_delete_node(p_node_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner UUID;
  v_deleted TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  SELECT owner_id, deleted_at INTO v_owner, v_deleted
  FROM nodes
  WHERE id = p_node_id
  FOR UPDATE;  -- lock row to prevent concurrent changes

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Node not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner != p_user_id THEN
    RAISE EXCEPTION 'Not authorized: only the owner can hard-delete'
      USING ERRCODE = 'P0003';
  END IF;

  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'Node must be soft-deleted before hard-delete'
      USING ERRCODE = 'P0004';
  END IF;

  DELETE FROM nodes WHERE id = p_node_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_node_to_folder(p_node_id uuid, p_target_folder_id uuid, p_source_folder_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Verify target folder exists and user has access (owner or contributor)
  IF NOT EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = p_target_folder_id
      AND f.deleted_at IS NULL
      AND (
        f.owner_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM folder_admins fa
          WHERE fa.folder_id = f.id AND fa.user_id = p_user_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Target folder not found or no access'
      USING ERRCODE = 'P0003';
  END IF;

  -- Add to target (idempotent)
  INSERT INTO folder_edges (node_id, folder_id)
  VALUES (p_node_id, p_target_folder_id)
  ON CONFLICT DO NOTHING;

  -- Remove from source if different
  IF p_source_folder_id IS NOT NULL AND p_source_folder_id != p_target_folder_id THEN
    DELETE FROM folder_edges
    WHERE node_id = p_node_id
      AND folder_id = p_source_folder_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_folder_with_nodes(p_name text, p_parent_folder_id uuid DEFAULT NULL::uuid, p_node_ids uuid[] DEFAULT NULL::uuid[], p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_id UUID;
  v_is_project BOOLEAN;
  v_folder_count BIGINT;
  v_color TEXT;
  v_node_id UUID;
  v_owner UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  v_owner := COALESCE(p_user_id, auth.uid());
  v_is_project := (p_parent_folder_id IS NULL);

  SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
  v_color := liked_tag_palette(v_folder_count::INT);

  INSERT INTO folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), p_name, v_owner, p_parent_folder_id, v_is_project, v_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  -- folder_tree self-reference
  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  -- folder_tree ancestor references (if nested)
  IF p_parent_folder_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT v_folder_id, ancestor_id, depth + 1
    FROM folder_tree
    WHERE folder_id = p_parent_folder_id;
  END IF;

  -- Bulk assign nodes to the new folder
  IF p_node_ids IS NOT NULL THEN
    FOREACH v_node_id IN ARRAY p_node_ids
    LOOP
      CONTINUE WHEN v_node_id IS NULL;
      INSERT INTO folder_edges (node_id, folder_id)
      VALUES (v_node_id, v_folder_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_folder_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_unsorted_folder(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_id UUID;
  v_folder_count BIGINT;
  v_color TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Check for existing Unsorted folder
  SELECT id INTO v_folder_id
  FROM folders
  WHERE owner_id = p_user_id
    AND name = 'Unsorted'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_folder_id IS NOT NULL THEN
    RETURN v_folder_id;
  END IF;

  -- Create with deterministic color
  SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
  v_color := liked_tag_palette(v_folder_count::INT);

  INSERT INTO folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), 'Unsorted', p_user_id, NULL, TRUE, v_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  -- folder_tree self-reference
  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  RETURN v_folder_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_named_folder(p_user_id uuid, p_name text, p_color text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_id UUID;
  v_folder_count BIGINT;
  v_resolved_color TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  SELECT id INTO v_folder_id
  FROM folders
  WHERE owner_id = p_user_id
    AND name = p_name
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_folder_id IS NOT NULL THEN
    RETURN v_folder_id;
  END IF;

  -- Deterministic color: explicit override or palette cycle
  IF p_color IS NOT NULL THEN
    v_resolved_color := p_color;
  ELSE
    SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
    v_resolved_color := liked_tag_palette(v_folder_count::INT);
  END IF;

  INSERT INTO folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), p_name, p_user_id, NULL, TRUE, v_resolved_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  RETURN v_folder_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_display_name(p_user_id uuid, p_display_name text)
 RETURNS TABLE(success boolean, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_old_name TEXT;
  v_changed_at TIMESTAMPTZ;
  v_exists INT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Lock user row
  SELECT display_name, username_changed_at
  INTO v_old_name, v_changed_at
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'USER_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Rate limit: 1 per 24 hours
  IF v_changed_at IS NOT NULL AND NOW() - v_changed_at < interval '24 hours' THEN
    RETURN QUERY SELECT false, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Uniqueness check on normalized name
  SELECT 1 INTO v_exists
  FROM users
  WHERE normalized_display_name = LOWER(TRIM(REGEXP_REPLACE(p_display_name, '\s+', ' ', 'g')))
    AND id != p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT false, 'NAME_TAKEN'::TEXT;
    RETURN;
  END IF;

  -- Update user
  UPDATE users
  SET
    display_name = p_display_name,
    normalized_display_name = LOWER(TRIM(REGEXP_REPLACE(p_display_name, '\s+', ' ', 'g'))),
    username_changed_at = NOW()
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'username_change',
    NULL,
    NULL,
    jsonb_build_object('old', v_old_name, 'new', p_display_name)
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_display_name(p_user_id uuid, p_display_name text, p_normalized text, p_old_display_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Update user display name
  UPDATE users
  SET
    display_name = p_display_name,
    normalized_display_name = p_normalized,
    username_changed_at = now()
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'username_change',
    NULL,
    NULL,
    jsonb_build_object('old', p_old_display_name, 'new', p_display_name)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_avatar_key(p_user_id uuid, p_avatar_key text)
 RETURNS TABLE(success boolean, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER;
  v_last_reset DATE;
  v_old_key TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Lock user row
  SELECT avatar_change_count_today, avatar_last_reset_date, avatar_key
  INTO v_count, v_last_reset, v_old_key
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'USER_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  -- Reset count if new calendar day
  IF v_last_reset IS NULL OR v_last_reset < CURRENT_DATE THEN
    v_count := 0;
    v_last_reset := CURRENT_DATE;
  END IF;

  -- Rate limit: 5 per day
  IF v_count >= 5 THEN
    RETURN QUERY SELECT false, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Update user
  UPDATE users
  SET
    avatar_key = p_avatar_key,
    avatar_change_count_today = v_count + 1,
    avatar_last_reset_date = v_last_reset
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'avatar_change',
    NULL,
    NULL,
    jsonb_build_object('old', v_old_key, 'new', p_avatar_key)
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_avatar_key(p_user_id uuid, p_avatar_key text, p_new_count integer, p_today text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Update user avatar
  UPDATE users
  SET
    avatar_key = p_avatar_key,
    avatar_change_count_today = p_new_count,
    avatar_last_reset_date = p_today
  WHERE id = p_user_id;

  -- Log activity
  INSERT INTO activity_log (user_id, action, target_id, target_type, metadata)
  VALUES (
    p_user_id,
    'avatar_change',
    NULL,
    NULL,
    jsonb_build_object('avatar_key', p_avatar_key)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_node_title(p_user_id uuid, p_node_id uuid, p_title text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_title text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Verify caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM nodes
    WHERE id = p_node_id AND owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Not owner';
  END IF;

  -- Trim and validate title length
  v_title := trim(p_title);
  IF length(v_title) = 0 OR length(v_title) > 512 THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;

  -- Update title
  UPDATE nodes
  SET title = v_title
  WHERE id = p_node_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_node_with_metadata(p_owner_id uuid, p_url text, p_text_content text, p_title text, p_thumbnail_key text, p_language_code text, p_tag_labels text[], p_description text DEFAULT NULL::text, p_auto_folder_name text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
  v_label TEXT;
  v_tag_id UUID;
  v_tag_count BIGINT;
  v_color TEXT;
  v_lang TEXT;
  v_desc TEXT;
  v_auto_folder_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');

  -- 1. Insert node
  INSERT INTO nodes (
    id, url, text_content, title, thumbnail_key,
    owner_id, language_code,
    origin_user_id, origin_created_at,
    deleted_at, created_at
  ) VALUES (
    gen_random_uuid(),
    p_url, p_text_content, p_title, p_thumbnail_key,
    p_owner_id, v_lang,
    p_owner_id, v_now,
    NULL, v_now
  )
  RETURNING nodes.id INTO v_node_id;

  -- 2. nodes_sort_cache
  INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at)
  VALUES (v_node_id, NULL, 0, 0, v_now);

  -- 3. Import cause + owner edge (PRD §6.8)
  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES (
    'import',
    p_owner_id,
    jsonb_build_object('node_id', v_node_id)
  )
  RETURNING causes.id INTO v_cause_id;

  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (
    v_node_id,
    p_owner_id,
    v_cause_id,
    NULL,
    'sent',
    0
  );

  -- 4. Tags (§19.3): for each label, lookup or create, then tag_edges
  IF p_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      SELECT tag_id INTO v_tag_id
      FROM tag_translations
      WHERE tag_translations.language_code = v_lang
        AND label = v_label
      LIMIT 1;

      IF v_tag_id IS NULL THEN
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);

        INSERT INTO tags (color_hex) VALUES (v_color)
        RETURNING tags.id INTO v_tag_id;

        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id
          FROM tag_translations
          WHERE tag_translations.language_code = v_lang
            AND label = v_label
          LIMIT 1;
        END;
      END IF;

      IF v_tag_id IS NOT NULL THEN
        INSERT INTO tag_edges (tag_id, node_id, folder_id)
        VALUES (v_tag_id, v_node_id, NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- 5. Optional description → translations row
  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  -- 6. Auto-folder assignment (AUDIT-06 P1-4): in-transaction.
  --    If no explicit folder, auto-assign to Unsorted or a named folder.
  v_auto_folder_id := get_or_create_named_folder(
    p_owner_id,
    COALESCE(NULLIF(btrim(p_auto_folder_name), ''), 'Unsorted'),
    NULL
  );
  INSERT INTO folder_edges (node_id, folder_id)
  VALUES (v_node_id, v_auto_folder_id)
  ON CONFLICT DO NOTHING;

  -- 7. Return
  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code,
         n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.import_url(p_owner_id uuid, p_url text, p_title text, p_thumbnail_key text, p_language_code text, p_description text DEFAULT NULL::text, p_new_tag_labels text[] DEFAULT NULL::text[], p_existing_tag_ids uuid[] DEFAULT NULL::uuid[], p_folder_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_auto_folder_name text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
  v_label TEXT;
  v_tag_id UUID;
  v_tag_count BIGINT;
  v_color TEXT;
  v_lang TEXT;
  v_desc TEXT;
  v_note TEXT;
  v_existing_tag UUID;
  v_folder_owner UUID;
  v_auto_folder_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');
  v_note := NULLIF(btrim(p_note), '');

  -- 1. Insert node — NO pre-check for duplicates (Rule 9).
  BEGIN
    INSERT INTO nodes (
      id, url, text_content, title, thumbnail_key,
      owner_id, language_code,
      origin_user_id, origin_created_at,
      deleted_at, created_at
    ) VALUES (
      gen_random_uuid(),
      p_url, NULL, p_title, p_thumbnail_key,
      p_owner_id, v_lang,
      p_owner_id, v_now,
      NULL, v_now
    )
    RETURNING nodes.id INTO v_node_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_NODE'
      USING ERRCODE = 'P0001';
  END;

  -- 2. nodes_sort_cache
  INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at)
  VALUES (v_node_id, NULL, 0, 0, v_now);

  -- 3. Import cause + owner edge (PRD §6.8)
  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES (
    'import',
    p_owner_id,
    jsonb_build_object('node_id', v_node_id)
  )
  RETURNING causes.id INTO v_cause_id;

  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (
    v_node_id,
    p_owner_id,
    v_cause_id,
    NULL,
    'sent',
    0
  );

  -- 4. New tag labels: lookup or create tag + tag_translations, then tag_edges
  IF p_new_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_new_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      SELECT tag_id INTO v_tag_id
      FROM tag_translations
      WHERE tag_translations.language_code = v_lang
        AND label = v_label
      LIMIT 1;

      IF v_tag_id IS NULL THEN
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);

        INSERT INTO tags (color_hex) VALUES (v_color)
        RETURNING tags.id INTO v_tag_id;

        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id
          FROM tag_translations
          WHERE tag_translations.language_code = v_lang
            AND label = v_label
          LIMIT 1;
        END;
      END IF;

      IF v_tag_id IS NOT NULL THEN
        INSERT INTO tag_edges (tag_id, node_id, folder_id)
        VALUES (v_tag_id, v_node_id, NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- 5. Existing tag IDs: attach via tag_edges (idempotent)
  IF p_existing_tag_ids IS NOT NULL THEN
    FOREACH v_existing_tag IN ARRAY p_existing_tag_ids
    LOOP
      CONTINUE WHEN v_existing_tag IS NULL;
      INSERT INTO tag_edges (tag_id, node_id, folder_id)
      VALUES (v_existing_tag, v_node_id, NULL)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- 6. Folder assignment (AUDIT-06 P1-4): in-transaction.
  --    Explicit folder takes priority; otherwise auto-folder.
  IF p_folder_id IS NOT NULL THEN
    SELECT folders.owner_id INTO v_folder_owner
    FROM folders
    WHERE folders.id = p_folder_id
      AND folders.deleted_at IS NULL
    LIMIT 1;

    IF v_folder_owner IS NULL THEN
      RAISE EXCEPTION 'Folder not found or deleted'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_folder_owner != p_owner_id THEN
      RAISE EXCEPTION 'Folder not owned by user'
        USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO folder_edges (node_id, folder_id)
    VALUES (v_node_id, p_folder_id)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Auto-folder: named folder (e.g. "YouTube") or "Unsorted"
    v_auto_folder_id := get_or_create_named_folder(
      p_owner_id,
      COALESCE(NULLIF(btrim(p_auto_folder_name), ''), 'Unsorted'),
      NULL
    );
    INSERT INTO folder_edges (node_id, folder_id)
    VALUES (v_node_id, v_auto_folder_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 7. Personal note → node_notes (upsert: one note per node per user)
  IF v_note IS NOT NULL THEN
    INSERT INTO node_notes (node_id, user_id, content, created_at, updated_at)
    VALUES (v_node_id, p_owner_id, v_note, v_now, v_now)
    ON CONFLICT (node_id, user_id)
    DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at;
  END IF;

  -- 8. Optional description → translations (upsert)
  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  -- 9. Return the created node
  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code,
         n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group(p_owner_id uuid, p_name text, p_member_ids uuid[])
 RETURNS TABLE(id uuid, name text, owner_id uuid, deleted_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_group_id UUID;
  v_member_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Step 1: INSERT into groups
  INSERT INTO groups (
    id,
    name,
    owner_id,
    deleted_at,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_name,
    p_owner_id,
    NULL,
    v_now
  )
  RETURNING groups.id INTO v_group_id;

  -- Step 2: INSERT owner as member
  INSERT INTO group_members (
    group_id,
    user_id
  ) VALUES (
    v_group_id,
    p_owner_id
  );

  -- Step 3: INSERT additional members
  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    -- Skip if already the owner
    IF v_member_id != p_owner_id THEN
      INSERT INTO group_members (
        group_id,
        user_id
      ) VALUES (
        v_group_id,
        v_member_id
      )
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  -- Return the created group
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.owner_id,
    g.deleted_at,
    g.created_at
  FROM groups g
  WHERE g.id = v_group_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.direct_share(p_sharer_id uuid, p_node_id uuid, p_target_user_id uuid, p_permission text DEFAULT 'view'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF p_permission NOT IN ('view', 'comment', 'edit', 'reshare') THEN
    RAISE EXCEPTION 'Invalid permission for node share: %. Must be view, comment, edit, or reshare', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: INSERT into causes
  INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
  VALUES (
    gen_random_uuid(),
    'direct_share',
    p_sharer_id,
    jsonb_build_object('node_id', p_node_id, 'target_user_id', p_target_user_id, 'permission', p_permission),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT received edge
  INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
  VALUES (gen_random_uuid(), p_node_id, p_target_user_id, v_cause_id, p_sharer_id, 'received', 1, p_permission, v_now);

  -- Step 3: INSERT sent edge
  INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
  VALUES (gen_random_uuid(), p_node_id, p_sharer_id, v_cause_id, p_sharer_id, 'sent', 1, p_permission, v_now);

  -- Step 4: Increment share_count
  INSERT INTO nodes_sort_cache (node_id, share_count)
  VALUES (p_node_id, 1)
  ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;

  -- Step 5: Create notification for target user
  INSERT INTO notifications (id, user_id, type, payload, read, created_at)
  VALUES (
    gen_random_uuid(),
    p_target_user_id,
    'share_received',
    jsonb_build_object('node_id', p_node_id, 'sender_id', p_sharer_id, 'permission', p_permission),
    false,
    v_now
  );

  RETURN v_cause_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.group_share(p_sharer_id uuid, p_node_id uuid, p_group_id uuid, p_permission text DEFAULT 'view'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cause_id UUID;
  v_member_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF p_permission NOT IN ('view', 'comment', 'edit', 'reshare') THEN
    RAISE EXCEPTION 'Invalid permission for group share: %. Must be view, comment, edit, or reshare', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: INSERT into causes
  INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
  VALUES (
    gen_random_uuid(),
    'group_share',
    p_sharer_id,
    jsonb_build_object('node_id', p_node_id, 'group_id', p_group_id, 'permission', p_permission),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT into group_nodes
  INSERT INTO group_nodes (group_id, node_id, created_at)
  VALUES (p_group_id, p_node_id, v_now);

  -- Step 3: For each member, INSERT edge + notification
  FOR v_member_id IN
    SELECT user_id FROM group_members WHERE group_id = p_group_id
  LOOP
    INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
    VALUES (gen_random_uuid(), p_node_id, v_member_id, v_cause_id, p_sharer_id, 'received', 1, p_permission, v_now);

    -- Notification for each member (except sharer themselves)
    IF v_member_id != p_sharer_id THEN
      INSERT INTO notifications (id, user_id, type, payload, read, created_at)
      VALUES (
        gen_random_uuid(),
        v_member_id,
        'group_share',
        jsonb_build_object('node_id', p_node_id, 'group_id', p_group_id, 'sender_id', p_sharer_id, 'permission', p_permission),
        false,
        v_now
      );
    END IF;
  END LOOP;

  -- Step 4: Increment share_count
  INSERT INTO nodes_sort_cache (node_id, share_count)
  VALUES (p_node_id, 1)
  ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;

  RETURN v_cause_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.share_folder(p_sharer_id uuid, p_folder_id uuid, p_target_user_ids uuid[], p_permission text DEFAULT 'view'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_folder_share_op_id UUID := gen_random_uuid();
  v_target_user_id UUID;
  v_notified_users UUID[] := ARRAY[]::UUID[];
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF p_permission NOT IN ('view', 'contribute', 'edit', 'admin') THEN
    RAISE EXCEPTION 'Invalid permission for folder share: %. Must be view, contribute, edit, or admin', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_node_id IN
    SELECT fe.node_id FROM folder_edges fe WHERE fe.folder_id = p_folder_id
  LOOP
    FOREACH v_target_user_id IN ARRAY p_target_user_ids
    LOOP
      INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
      VALUES (
        gen_random_uuid(),
        'direct_share',
        p_sharer_id,
        jsonb_build_object('node_id', v_node_id, 'target_user_id', v_target_user_id, 'folder_id', p_folder_id, 'folder_share_op_id', v_folder_share_op_id, 'permission', p_permission),
        v_now
      )
      RETURNING id INTO v_cause_id;

      INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
      VALUES (gen_random_uuid(), v_node_id, v_target_user_id, v_cause_id, p_sharer_id, 'received', 1, p_permission, v_now);

      INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
      VALUES (gen_random_uuid(), v_node_id, p_sharer_id, v_cause_id, p_sharer_id, 'sent', 1, p_permission, v_now);

      -- Notification: one per target user (not per node)
      IF NOT (v_target_user_id = ANY(v_notified_users)) AND v_target_user_id != p_sharer_id THEN
        v_notified_users := array_append(v_notified_users, v_target_user_id);
        INSERT INTO notifications (id, user_id, type, payload, read, created_at)
        VALUES (
          gen_random_uuid(),
          v_target_user_id,
          'folder_share',
          jsonb_build_object('folder_id', p_folder_id, 'sender_id', p_sharer_id, 'permission', p_permission),
          false,
          v_now
        );
      END IF;
    END LOOP;

    INSERT INTO nodes_sort_cache (node_id, share_count)
    VALUES (v_node_id, 1)
    ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;
  END LOOP;

  RETURN v_folder_share_op_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.group_unshare(p_sharer_id uuid, p_node_id uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cause_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_sharer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Step 1: DELETE from group_nodes
  DELETE FROM group_nodes
  WHERE node_id = p_node_id
    AND group_id = p_group_id;

  -- Step 2: DELETE from causes (cascades to edges)
  -- Find and delete the matching cause
  DELETE FROM causes
  WHERE cause_type = 'group_share'
    AND created_by = p_sharer_id
    AND metadata->>'node_id' = p_node_id::text
    AND metadata->>'group_id' = p_group_id::text
  RETURNING id INTO v_cause_id;

  IF v_cause_id IS NULL THEN
    RAISE EXCEPTION 'Group share cause not found for node % and group %', p_node_id, p_group_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN true;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.change_node_permission(p_cause_id uuid, p_requesting_user_id uuid, p_new_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cause_created_by UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Verify requesting user is the cause creator
  SELECT created_by INTO v_cause_created_by
  FROM causes
  WHERE id = p_cause_id;

  IF v_cause_created_by IS NULL THEN
    RAISE EXCEPTION 'Cause not found: %', p_cause_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_cause_created_by != p_requesting_user_id THEN
    RAISE EXCEPTION 'Unauthorized: only the original sharer can change permission'
      USING ERRCODE = 'P0001';
  END IF;

  -- Update edges.permission for both edges
  UPDATE edges
  SET permission = p_new_permission
  WHERE cause_id = p_cause_id;

  -- Update causes.metadata.permission
  UPDATE causes
  SET metadata = metadata || jsonb_build_object('permission', p_new_permission)
  WHERE id = p_cause_id;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.change_folder_permission(p_folder_id uuid, p_target_user_id uuid, p_requesting_user_id uuid, p_new_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_folder_owner_id UUID;
  v_cause_id UUID;
  v_cause_ids UUID[];
BEGIN
  IF auth.uid() IS NOT NULL AND p_requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.uid() IS NOT NULL AND p_requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Check if requesting user is folder owner or has admin permission
  SELECT owner_id INTO v_folder_owner_id
  FROM folders
  WHERE id = p_folder_id;

  IF v_folder_owner_id IS NULL THEN
    RAISE EXCEPTION 'Folder not found: %', p_folder_id
      USING ERRCODE = 'P0001';
  END IF;

  -- TODO: Check for admin permission via edges when hasFolderPermission is implemented
  -- For now, only owner can change permissions
  IF v_folder_owner_id != p_requesting_user_id THEN
    RAISE EXCEPTION 'Unauthorized: only folder owner can change permissions'
      USING ERRCODE = 'P0001';
  END IF;

  -- Find all causes for this folder and target user
  SELECT array_agg(DISTINCT c.id) INTO v_cause_ids
  FROM causes c
  WHERE c.metadata->>'folder_id' = p_folder_id::text
    AND c.metadata->>'target_user_id' = p_target_user_id::text;

  IF v_cause_ids IS NULL OR array_length(v_cause_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No share found for user % in folder %', p_target_user_id, p_folder_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Update all edges for these causes
  UPDATE edges
  SET permission = p_new_permission
  WHERE cause_id = ANY(v_cause_ids);

  -- Update all causes metadata
  UPDATE causes
  SET metadata = metadata || jsonb_build_object('permission', p_new_permission)
  WHERE id = ANY(v_cause_ids);

  RETURN true;
END;
$function$
;

-- set_node_deleted (resource-only: ownership from auth.uid())
CREATE OR REPLACE FUNCTION public.set_node_deleted(p_node_id uuid, p_deleted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE nodes
  SET deleted_at = CASE WHEN p_deleted THEN now() ELSE NULL END
  WHERE id = p_node_id
    AND (owner_id = auth.uid() OR auth.uid() IS NULL);
END;
$function$;

-- delete_folder (resource-only: ownership from auth.uid())
CREATE OR REPLACE FUNCTION public.delete_folder(p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE folders
  SET deleted_at = now()
  WHERE id = p_folder_id
    AND deleted_at IS NULL
    AND (
      auth.uid() IS NULL
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM folder_admins fa
        WHERE fa.folder_id = p_folder_id AND fa.user_id = auth.uid()
      )
    );
END;
$function$;

-- add_node_to_folder (resource-only: ownership from auth.uid())
CREATE OR REPLACE FUNCTION public.add_node_to_folder(p_node_id uuid, p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO folder_edges (node_id, folder_id)
  SELECT p_node_id, p_folder_id
  WHERE auth.uid() IS NULL OR folder_is_accessible(p_folder_id, auth.uid())
  ON CONFLICT DO NOTHING;
END;
$function$;

-- remove_node_from_folder (resource-only: ownership from auth.uid())
CREATE OR REPLACE FUNCTION public.remove_node_from_folder(p_node_id uuid, p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM folder_edges
  WHERE node_id = p_node_id
    AND folder_id = p_folder_id
    AND (auth.uid() IS NULL OR folder_is_accessible(p_folder_id, auth.uid()));
END;
$function$;
