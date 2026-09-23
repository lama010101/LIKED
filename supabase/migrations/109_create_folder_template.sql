-- ============================================================
-- Migration 109 — create_folder_template RPC
-- (COMPLETE-APP-002 / TEMPLATE-001)
-- ============================================================
-- PRD §11.3d v1 presets — exactly four keys, no others:
--   read_later / watch_list / book_notes  → single folder
--   trip_planner                          → folder + 3 subfolders
--                                          (Before / During / After)
-- Structure mirrors create_folder_with_nodes: folders row + folder_tree
-- self-reference + ancestor rows, one transaction. Caller identity is
-- auth.uid() only (G-1); SECURITY DEFINER + search_path; PUBLIC/anon
-- revoked; EXECUTE → authenticated (G-2).
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_folder_template(
  p_template_key TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT;
  v_folder_id UUID;
  v_sub_id UUID;
  v_folder_count BIGINT;
  v_color TEXT;
  v_sub TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_template_key NOT IN ('read_later', 'watch_list', 'trip_planner', 'book_notes') THEN
    RAISE EXCEPTION 'invalid template key: %', p_template_key USING ERRCODE = '22023';
  END IF;

  -- §11.3d: non-empty name input wins; otherwise the template's own name.
  v_name := COALESCE(
    NULLIF(btrim(p_name), ''),
    CASE p_template_key
      WHEN 'read_later'   THEN 'Read Later'
      WHEN 'watch_list'   THEN 'Watch List'
      WHEN 'trip_planner' THEN 'Trip Planner'
      WHEN 'book_notes'   THEN 'Book Notes'
    END
  );

  SELECT COUNT(*) INTO v_folder_count FROM public.folders WHERE deleted_at IS NULL;
  v_color := liked_tag_palette(v_folder_count::INT);

  -- Root folder (is_project: no parent) + folder_tree self-reference
  INSERT INTO public.folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), v_name, v_uid, NULL, TRUE, v_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  INSERT INTO public.folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  -- Trip Planner: three subfolders, each with self-ref + ancestor rows
  IF p_template_key = 'trip_planner' THEN
    FOREACH v_sub IN ARRAY ARRAY['Before', 'During', 'After']::TEXT[] LOOP
      INSERT INTO public.folders (
        id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
      ) VALUES (
        gen_random_uuid(), v_sub, v_uid, v_folder_id, FALSE, v_color, NULL, now()
      )
      RETURNING id INTO v_sub_id;

      INSERT INTO public.folder_tree (folder_id, ancestor_id, depth)
      VALUES (v_sub_id, v_sub_id, 0);

      INSERT INTO public.folder_tree (folder_id, ancestor_id, depth)
      SELECT v_sub_id, ancestor_id, depth + 1
        FROM public.folder_tree
       WHERE folder_id = v_folder_id;
    END LOOP;
  END IF;

  RETURN v_folder_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_folder_template(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_folder_template(TEXT, TEXT) TO authenticated;
