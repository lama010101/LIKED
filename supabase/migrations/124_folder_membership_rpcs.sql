-- ============================================================
-- Migration 124 — MVP2 P2-03: folder membership RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- add_node_to_folder: caller must see the node and hold contribute+ on the
-- folder; records added_by; live-expands covering grants (Q10); notifies the
-- folder audience (Q6 'item added to a shared folder').
-- remove_node_from_folder: folder owner, node owner, the membership creator
-- (added_by — contributors remove only their own additions), or admin-rank
-- grantee; revokes exactly this membership's grant-derived edges (Q11).
-- move_node_to_folder: add+remove atomically in one transaction.
-- folder_is_accessible rewritten to the edge model (legacy callers keep the
-- same signature).
-- ============================================================

CREATE OR REPLACE FUNCTION public.folder_is_accessible(p_folder_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN public.folder_is_visible(p_folder_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_node_to_folder(p_node_id UUID, p_folder_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rows INT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
    IF NOT public._node_visible(p_node_id, v_uid) THEN
      RAISE EXCEPTION 'node not accessible' USING ERRCODE = '42501';
    END IF;
    IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 3 THEN
      RAISE EXCEPTION 'folder not accessible (need contribute)' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO folder_edges (node_id, folder_id, added_by)
  VALUES (p_node_id, p_folder_id,
          COALESCE(v_uid, (SELECT owner_id FROM nodes WHERE id = p_node_id)))
  ON CONFLICT (node_id, folder_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    PERFORM public._expand_folder_grants_for_node(p_node_id, p_folder_id, v_uid);
    PERFORM public._notify_folder_item_added(p_folder_id, p_node_id, v_uid);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_node_to_folder(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_node_to_folder(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_node_from_folder(p_node_id UUID, p_folder_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_fe folder_edges%ROWTYPE;
  v_folder_owner UUID;
  v_node_owner UUID;
  v_allowed BOOLEAN;
BEGIN
  IF auth.role() = 'service_role' THEN
    DELETE FROM folder_edges WHERE node_id = p_node_id AND folder_id = p_folder_id;
    IF FOUND THEN PERFORM public._revoke_folder_grants_for_node(p_node_id, p_folder_id); END IF;
    RETURN;
  END IF;

  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_fe FROM folder_edges WHERE node_id = p_node_id AND folder_id = p_folder_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT owner_id INTO v_folder_owner FROM folders WHERE id = p_folder_id;
  SELECT owner_id INTO v_node_owner FROM nodes WHERE id = p_node_id;

  v_allowed := (v_folder_owner = v_uid)
               OR (v_node_owner = v_uid)
               OR (v_fe.added_by = v_uid)
               OR public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) >= 6;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not allowed to remove this membership' USING ERRCODE = '42501';
  END IF;

  DELETE FROM folder_edges WHERE id = v_fe.id;
  PERFORM public._revoke_folder_grants_for_node(p_node_id, p_folder_id);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_node_from_folder(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_node_from_folder(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.move_node_to_folder(
  p_node_id UUID,
  p_target_folder_id UUID,
  p_source_folder_id UUID,
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_fe folder_edges%ROWTYPE;
  v_allowed BOOLEAN;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM v_uid)) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF auth.role() <> 'service_role' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
    IF NOT public._node_visible(p_node_id, v_uid) THEN
      RAISE EXCEPTION 'node not accessible' USING ERRCODE = '42501';
    END IF;
    IF public._perm_rank(public.effective_folder_permission(p_target_folder_id, v_uid)) < 3 THEN
      RAISE EXCEPTION 'target folder not accessible (need contribute)' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- add to target (idempotent) then expand covering grants
  INSERT INTO folder_edges (node_id, folder_id, added_by)
  VALUES (p_node_id, p_target_folder_id, COALESCE(v_uid, p_user_id))
  ON CONFLICT (node_id, folder_id) DO NOTHING;
  IF FOUND THEN
    PERFORM public._expand_folder_grants_for_node(p_node_id, p_target_folder_id, COALESCE(v_uid, p_user_id));
    PERFORM public._notify_folder_item_added(p_target_folder_id, p_node_id, COALESCE(v_uid, p_user_id));
  END IF;

  -- remove from source when different, with the same rights check as
  -- remove_node_from_folder
  IF p_source_folder_id IS NOT NULL AND p_source_folder_id <> p_target_folder_id THEN
    SELECT * INTO v_fe FROM folder_edges WHERE node_id = p_node_id AND folder_id = p_source_folder_id;
    IF FOUND AND auth.role() <> 'service_role' THEN
      v_allowed := ((SELECT owner_id FROM folders WHERE id = p_source_folder_id) = v_uid)
                   OR ((SELECT owner_id FROM nodes WHERE id = p_node_id) = v_uid)
                   OR (v_fe.added_by = v_uid)
                   OR public._perm_rank(public.effective_folder_permission(p_source_folder_id, v_uid)) >= 6;
      IF NOT v_allowed THEN
        RAISE EXCEPTION 'not allowed to remove from source folder' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF FOUND THEN
      DELETE FROM folder_edges WHERE id = v_fe.id;
      PERFORM public._revoke_folder_grants_for_node(p_node_id, p_source_folder_id);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.move_node_to_folder(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_node_to_folder(UUID, UUID, UUID, UUID) TO authenticated, service_role;
