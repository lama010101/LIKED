-- ============================================================
-- Migration 152 — v2 Promote recommendation to Library
-- V2-W9-LIBRARY-1128-001 / PLAN-V2-002 §2.7, decisions D33-D34
-- ============================================================
-- Class-O functions. Every function is SECURITY DEFINER, pins
-- search_path=public, guards auth.uid() first, revokes PUBLIC/anon,
-- and grants EXECUTE to authenticated + service_role. get_feed is
-- not touched. Edge/cause writes remain inside the existing
-- import_url/add_node_to_folder engine functions.
-- ============================================================

-- ------------------------------------------------------------
-- promote_recommendation — promote one owner-visible recommendation
-- into the caller's Library. p_folder_id NULL means the D33 default
-- folder "From friends" (created on first use, then reused by name).
-- ------------------------------------------------------------
CREATE FUNCTION public.promote_recommendation(p_recommendation_id uuid, p_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_item_id    uuid;
  v_source     text;
  v_kind       text;
  v_external   text;
  v_name       text;
  v_overview   text;
  v_localized  jsonb;
  v_lang_tag   text;
  v_node_lang  text;
  v_url        text;
  v_node_type  text;
  v_folder_id  uuid;
  v_node_id    uuid;
  v_node_del   timestamptz;
  v_msg        text;
  v_already    boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT r.item_id, i.source, i.kind, i.external_id, i.name, i.overview, i.localized
    INTO v_item_id, v_source, v_kind, v_external, v_name, v_overview, v_localized
    FROM public.recommendations r
    JOIN public.items i ON i.id = r.item_id
   WHERE r.id = p_recommendation_id
     AND r.owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_kind NOT IN ('movie', 'series', 'video', 'playlist') THEN
    RAISE EXCEPTION 'UNSUPPORTED_KIND' USING ERRCODE = '22023';
  END IF;

  SELECT n.id INTO v_node_id
    FROM public.node_items ni
    JOIN public.nodes n ON n.id = ni.node_id
   WHERE ni.item_id = v_item_id
     AND n.owner_id = v_uid
     AND n.deleted_at IS NULL
   ORDER BY n.created_at DESC
   LIMIT 1;
  IF v_node_id IS NOT NULL THEN
    RETURN jsonb_build_object('node_id', v_node_id, 'already', true);
  END IF;

  v_folder_id := p_folder_id;
  IF v_folder_id IS NULL THEN
    SELECT f.id INTO v_folder_id
      FROM public.folders f
     WHERE f.owner_id = v_uid
       AND f.name = 'From friends'
       AND f.deleted_at IS NULL
     ORDER BY f.created_at, f.id
     LIMIT 1;
    IF v_folder_id IS NULL THEN
      SELECT public.create_folder('From friends', NULL, NULL, NULL) INTO v_folder_id;
    END IF;
  END IF;

  v_url := CASE
    WHEN v_kind = 'movie' THEN 'https://www.themoviedb.org/movie/' || v_external
    WHEN v_kind = 'series' THEN 'https://www.themoviedb.org/tv/' || v_external
    WHEN v_kind = 'video' THEN 'https://www.youtube.com/watch?v=' || v_external
    WHEN v_kind = 'playlist' THEN 'https://www.youtube.com/playlist?list=' || v_external
  END;
  v_node_type := CASE WHEN v_kind = 'video' THEN 'video' ELSE 'link' END;

  SELECT COALESCE(up.tmdb_lang, 'en-US'), COALESCE(u.language_code, 'en')
    INTO v_lang_tag, v_node_lang
    FROM public.users u
    LEFT JOIN public.user_prefs up ON up.user_id = u.id
   WHERE u.id = v_uid;
  v_lang_tag := COALESCE(v_lang_tag, 'en-US');
  v_node_lang := COALESCE(NULLIF(split_part(v_node_lang, '-', 1), ''), 'en');
  v_name := COALESCE(NULLIF(v_localized -> v_lang_tag ->> 'name', ''),
                     NULLIF(v_localized -> 'en-US' ->> 'name', ''),
                     v_name,
                     v_kind || ' ' || v_external);
  v_overview := COALESCE(NULLIF(v_localized -> v_lang_tag ->> 'overview', ''),
                         NULLIF(v_localized -> 'en-US' ->> 'overview', ''),
                         v_overview);

  BEGIN
    SELECT ir.id INTO v_node_id
      FROM public.import_url(
        p_owner_id := v_uid,
        p_url := v_url,
        p_title := v_name,
        p_thumbnail_key := NULL,
        p_language_code := v_node_lang,
        p_node_type := v_node_type,
        p_description := v_overview,
        p_new_tag_labels := NULL,
        p_existing_tag_ids := NULL,
        p_folder_id := v_folder_id,
        p_note := NULL,
        p_auto_folder_name := NULL
      ) AS ir;
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'DUPLICATE_NODE' THEN
      RAISE;
    END IF;

    SELECT n.id, n.deleted_at INTO v_node_id, v_node_del
      FROM public.nodes n
     WHERE n.owner_id = v_uid AND n.url = v_url
     ORDER BY n.created_at DESC
     LIMIT 1;
    IF v_node_id IS NULL THEN
      RAISE;
    END IF;
    IF v_node_del IS NOT NULL THEN
      PERFORM public.set_node_deleted(v_node_id, false);
    END IF;
    PERFORM public.add_node_to_folder(v_node_id, v_folder_id);
    v_already := true;
  END;

  INSERT INTO public.node_items (node_id, item_id)
  VALUES (v_node_id, v_item_id)
  ON CONFLICT (node_id) DO NOTHING;

  RETURN jsonb_build_object('node_id', v_node_id, 'already', v_already);
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_recommendation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_recommendation(uuid, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- get_promote_folder_choices — owner-only folder rows for the
-- promote sheet, with nesting depth and the most recently used
-- Library folder derived from node_items + folder_edges (DB state).
-- ------------------------------------------------------------
CREATE FUNCTION public.get_promote_folder_choices()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'last_used_folder_id', (
      SELECT fe.folder_id
        FROM public.folder_edges fe
        JOIN public.nodes n ON n.id = fe.node_id
        JOIN public.node_items ni ON ni.node_id = n.id
        JOIN public.folders f ON f.id = fe.folder_id
       WHERE n.owner_id = v_uid
         AND f.owner_id = v_uid
         AND f.deleted_at IS NULL
       ORDER BY fe.created_at DESC, fe.id DESC
       LIMIT 1),
    'folders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', x.id,
               'name', x.name,
               'parent_folder_id', x.parent_folder_id,
               'depth', x.depth,
               'system_kind', x.system_kind)
             ORDER BY x.name, x.id)
      FROM (
        SELECT f.id, f.name, f.parent_folder_id, f.system_kind,
               1 + COALESCE((SELECT max(ft.depth) FROM public.folder_tree ft WHERE ft.folder_id = f.id), 0) AS depth
          FROM public.folders f
         WHERE f.owner_id = v_uid
           AND f.deleted_at IS NULL
      ) x
      WHERE x.depth <= 5), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_promote_folder_choices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promote_folder_choices() TO authenticated, service_role;


-- ------------------------------------------------------------
-- get_node_item_posters — additive read bridge for promoted cards.
-- get_feed remains untouched. Only nodes visible to the caller return
-- rows, and the image URL is resolved entirely in SQL.
-- ------------------------------------------------------------
CREATE FUNCTION public.get_node_item_posters(p_node_ids uuid[])
 RETURNS TABLE(node_id uuid, image_url text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ni.node_id,
         CASE
           WHEN i.poster_path IS NOT NULL THEN 'https://image.tmdb.org/t/p/w342' || i.poster_path
           WHEN i.kind = 'video' AND i.external_id ~ '^[A-Za-z0-9_-]{11}$'
             THEN 'https://i.ytimg.com/vi/' || i.external_id || '/hqdefault.jpg'
           ELSE i.thumb_url
         END AS image_url
    FROM public.node_items ni
    JOIN public.items i ON i.id = ni.item_id
   WHERE ni.node_id = ANY(COALESCE(p_node_ids, '{}'))
     AND public._node_visible(ni.node_id, auth.uid())
     AND (
       i.poster_path IS NOT NULL
       OR (i.kind = 'video' AND i.external_id ~ '^[A-Za-z0-9_-]{11}$')
       OR i.thumb_url IS NOT NULL
     );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_node_item_posters(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_node_item_posters(uuid[]) TO authenticated, service_role;

-- ------------------------------------------------------------
-- get_inbox_library_target — additive owner read for the detail
-- sheet: one owner-scoped recommendation id (needed by promote) and
-- the live promoted node id when present. No contributor id is exposed.
-- ------------------------------------------------------------
CREATE FUNCTION public.get_inbox_library_target(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recommendations r WHERE r.owner_id = v_uid AND r.item_id = p_item_id) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'recommendation_id', (
      SELECT r.id FROM public.recommendations r
       WHERE r.owner_id = v_uid AND r.item_id = p_item_id
       ORDER BY r.updated_at DESC, r.id DESC LIMIT 1),
    'library_node_id', (
      SELECT ni.node_id FROM public.node_items ni
       JOIN public.nodes n ON n.id = ni.node_id
       WHERE ni.item_id = p_item_id AND n.owner_id = v_uid AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC, n.id DESC LIMIT 1)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inbox_library_target(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_library_target(uuid) TO authenticated, service_role;
