-- ============================================================
-- Migration 123 — MVP2 P2-02: folder lifecycle RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- create_folder: depth cap 5 (Q1), contribute+ gate on parent, per-owner
-- palette colour (fixes global-count bug), live grant expansion for folders
-- created inside a shared subtree (Q10).
-- move_folder: owner-only on the moved folder, contribute+ on target parent,
-- cycle + depth checks, system folders immovable (Q15), ancestor-grant
-- causes revoked/re-expanded around the move (Q10/Q11).
-- rename_folder: owner or edit+; system folders not renamable (Q15).
-- set_folder_details: owner or edit+; description/colour only.
-- ============================================================

-- Drop the 2-arg overload so the new signature (with defaults) is the only one.
DROP FUNCTION IF EXISTS public.create_folder(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.create_folder(
  p_name TEXT,
  p_parent_folder_id UUID DEFAULT NULL,
  p_color_hex TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_folder_id UUID;
  v_color TEXT;
  v_count BIGINT;
  v_parent_level INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid folder name' USING ERRCODE = '22023';
  END IF;
  IF p_color_hex IS NOT NULL AND p_color_hex !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'invalid color_hex' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 2000 THEN
    RAISE EXCEPTION 'description too long' USING ERRCODE = '22023';
  END IF;

  IF p_parent_folder_id IS NOT NULL THEN
    IF public._perm_rank(public.effective_folder_permission(p_parent_folder_id, v_uid)) < 3 THEN
      RAISE EXCEPTION 'folder not accessible (need contribute)' USING ERRCODE = '42501';
    END IF;
    v_parent_level := public._folder_level(p_parent_folder_id);
    IF v_parent_level + 1 > 5 THEN
      RAISE EXCEPTION 'max folder depth (5) exceeded' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_color_hex IS NOT NULL THEN
    v_color := p_color_hex;
  ELSE
    SELECT COUNT(*) INTO v_count FROM folders WHERE owner_id = v_uid AND deleted_at IS NULL;
    v_color := liked_tag_palette(v_count::INT);
  END IF;

  INSERT INTO folders (id, name, owner_id, parent_folder_id, is_project, color_hex, description, deleted_at, created_at)
  VALUES (gen_random_uuid(), btrim(p_name), v_uid, p_parent_folder_id,
          (p_parent_folder_id IS NULL), v_color, NULLIF(btrim(COALESCE(p_description,'')), ''), NULL, now())
  RETURNING id INTO v_folder_id;

  INSERT INTO folder_tree (folder_id, ancestor_id, depth) VALUES (v_folder_id, v_folder_id, 0);
  IF p_parent_folder_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT v_folder_id, ancestor_id, depth + 1
      FROM folder_tree WHERE folder_id = p_parent_folder_id;
    -- live sharing: the new folder inherits every ancestor grant (Q10)
    PERFORM public._expand_folder_grants_for_folder(v_folder_id, v_uid);
  END IF;

  RETURN v_folder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_folder(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_folder(TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.move_folder(p_folder_id UUID, p_new_parent_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_system TEXT;
  v_old_ancestors UUID[];
  v_new_ancestors UUID[];
  v_height INT;
  v_new_level INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT system_kind INTO v_system FROM folders
   WHERE id = p_folder_id AND owner_id = v_uid AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folder not found or not owned by caller' USING ERRCODE = '42501';
  END IF;
  IF v_system IS NOT NULL THEN
    RAISE EXCEPTION 'system folders cannot be moved' USING ERRCODE = '22023';
  END IF;

  -- subtree height (self = 1)
  SELECT 1 + COALESCE(MAX(depth), 0) INTO v_height
    FROM folder_tree WHERE ancestor_id = p_folder_id AND depth > 0;

  IF p_new_parent_id IS NOT NULL THEN
    IF p_new_parent_id = p_folder_id THEN
      RAISE EXCEPTION 'Cannot move folder under itself' USING ERRCODE = '22023';
    END IF;
    -- cycle check
    IF EXISTS (SELECT 1 FROM folder_tree
                WHERE ancestor_id = p_folder_id AND folder_id = p_new_parent_id) THEN
      RAISE EXCEPTION 'Cannot move folder: would create a cycle' USING ERRCODE = '22023';
    END IF;
    -- target needs contribute+ (owner or grant)
    IF public._perm_rank(public.effective_folder_permission(p_new_parent_id, v_uid)) < 3 THEN
      RAISE EXCEPTION 'target folder not accessible (need contribute)' USING ERRCODE = '42501';
    END IF;
    v_new_level := public._folder_level(p_new_parent_id) + 1;
    IF v_new_level + v_height - 1 > 5 THEN
      RAISE EXCEPTION 'max folder depth (5) exceeded' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ancestor grant sets before/after (strict ancestors only; grants ON the
  -- folder itself travel with it and stay valid)
  SELECT COALESCE(array_agg(ancestor_id), '{}') INTO v_old_ancestors
    FROM folder_tree WHERE folder_id = p_folder_id AND ancestor_id <> p_folder_id;

  -- re-point + rebuild tree (unchanged logic)
  UPDATE folders
     SET parent_folder_id = p_new_parent_id,
         is_project = (p_new_parent_id IS NULL)
   WHERE id = p_folder_id;

  DELETE FROM folder_tree
   WHERE folder_id IN (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id)
     AND ancestor_id <> folder_id;

  IF p_new_parent_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT subtree.folder_id, new_ancestors.ancestor_id,
           new_ancestors.depth + 1 + subtree.depth
      FROM (SELECT folder_id, depth FROM folder_tree WHERE ancestor_id = p_folder_id) AS subtree,
           (SELECT ancestor_id, depth FROM folder_tree WHERE folder_id = p_new_parent_id) AS new_ancestors;
  END IF;

  SELECT COALESCE(array_agg(ancestor_id), '{}') INTO v_new_ancestors
    FROM folder_tree WHERE folder_id = p_folder_id AND ancestor_id <> p_folder_id;

  -- revoke causes from grants that no longer cover the subtree, then expand
  -- grants that newly cover it (Q10/Q11)
  PERFORM public._revoke_ancestor_grants_for_subtree(
    p_folder_id,
    (SELECT COALESCE(array_agg(a), '{}') FROM unnest(v_old_ancestors) a WHERE a <> ALL(v_new_ancestors)));

  PERFORM public._expand_folder_grants_for_folder(p_folder_id, v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.move_folder(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_folder(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rename_folder(p_folder_id UUID, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_system TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid folder name' USING ERRCODE = '22023';
  END IF;
  SELECT system_kind INTO v_system FROM folders WHERE id = p_folder_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'folder not found' USING ERRCODE = '42501'; END IF;
  IF v_system IS NOT NULL THEN
    RAISE EXCEPTION 'system folders cannot be renamed' USING ERRCODE = '22023';
  END IF;
  IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 4 THEN
    RAISE EXCEPTION 'need edit permission' USING ERRCODE = '42501';
  END IF;
  UPDATE folders SET name = btrim(p_name) WHERE id = p_folder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_folder(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_folder(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_folder_details(
  p_folder_id UUID,
  p_description TEXT DEFAULT NULL,
  p_color_hex TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_color_hex IS NOT NULL AND p_color_hex !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'invalid color_hex' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 2000 THEN
    RAISE EXCEPTION 'description too long' USING ERRCODE = '22023';
  END IF;
  IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 4 THEN
    RAISE EXCEPTION 'need edit permission' USING ERRCODE = '42501';
  END IF;
  UPDATE folders
     SET description = CASE WHEN p_description IS NULL THEN description
                            ELSE NULLIF(btrim(p_description), '') END,
         color_hex   = COALESCE(p_color_hex, color_hex)
   WHERE id = p_folder_id AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.set_folder_details(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_folder_details(UUID, TEXT, TEXT) TO authenticated, service_role;
