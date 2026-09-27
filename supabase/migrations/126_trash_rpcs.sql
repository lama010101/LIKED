-- ============================================================
-- Migration 126 — MVP2 P2-05: trash RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Soft delete never removes causes or edges (T0-4). trash_folder marks the
-- whole subtree + each contained card whose only live folder memberships are
-- inside the subtree (Q17) with one trash_batch_id; restore reverses exactly
-- that batch. hard_delete_folder and empty_trash are cascade-only row
-- deletes (T0-13). Trash is retained indefinitely; no purge job (Q7).
-- System folders cannot be trashed (Q15).
-- ============================================================

CREATE OR REPLACE FUNCTION public.trash_folder(p_folder_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch UUID := gen_random_uuid();
  v_system TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT system_kind INTO v_system FROM folders
   WHERE id = p_folder_id AND owner_id = v_uid AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'folder not found' USING ERRCODE = '42501'; END IF;
  IF v_system IS NOT NULL THEN
    RAISE EXCEPTION 'system folders cannot be trashed' USING ERRCODE = '22023';
  END IF;

  UPDATE folders f
     SET deleted_at = now(), trash_batch_id = v_batch
   WHERE f.owner_id = v_uid AND f.deleted_at IS NULL
     AND f.id IN (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id);

  -- sole-membership rule (Q17): a contained card is trashed only if every
  -- live folder membership it has is inside the trashed subtree
  UPDATE nodes n
     SET deleted_at = now(), trash_batch_id = v_batch
   WHERE n.deleted_at IS NULL
     AND EXISTS (
       SELECT 1 FROM folder_edges fe
        WHERE fe.node_id = n.id
          AND fe.folder_id IN (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id))
     AND NOT EXISTS (
       SELECT 1 FROM folder_edges fe
        JOIN folders f2 ON f2.id = fe.folder_id AND f2.deleted_at IS NULL
        WHERE fe.node_id = n.id
          AND fe.folder_id NOT IN (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id));

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.trash_folder(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trash_folder(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restore_folder(p_folder_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT trash_batch_id INTO v_batch FROM folders
   WHERE id = p_folder_id AND owner_id = v_uid AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'folder not in trash' USING ERRCODE = '42501'; END IF;

  UPDATE folders SET deleted_at = NULL, trash_batch_id = NULL
   WHERE owner_id = v_uid AND trash_batch_id = v_batch;
  -- batch-mates may be owned by contributors (Q17), not just the caller
  UPDATE nodes SET deleted_at = NULL, trash_batch_id = NULL
   WHERE trash_batch_id = v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_folder(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_folder(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restore_node(p_node_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE nodes SET deleted_at = NULL, trash_batch_id = NULL
   WHERE id = p_node_id AND owner_id = v_uid AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'node not in trash' USING ERRCODE = '42501'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_node(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_node(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hard_delete_folder(p_folder_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT trash_batch_id INTO v_batch FROM folders
   WHERE id = p_folder_id AND owner_id = v_uid AND deleted_at IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'folder must be in trash before permanent delete' USING ERRCODE = '22023';
  END IF;

  -- other owners' nodes trashed by this batch lose the batch link but stay
  -- soft-deleted; only the caller's own nodes are permanently removed
  UPDATE nodes SET trash_batch_id = NULL
   WHERE trash_batch_id = v_batch AND owner_id <> v_uid;
  DELETE FROM nodes WHERE trash_batch_id = v_batch AND owner_id = v_uid;

  DELETE FROM folders
   WHERE owner_id = v_uid AND deleted_at IS NOT NULL
     AND id IN (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id);
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_folder(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_folder(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.empty_trash()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_nodes INT;
  v_folders INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  -- folders first: their memberships cascade, nodes follow (cascade-only)
  DELETE FROM folders WHERE owner_id = v_uid AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_folders = ROW_COUNT;
  DELETE FROM nodes WHERE owner_id = v_uid AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_nodes = ROW_COUNT;
  RETURN v_nodes + v_folders;
END;
$$;

REVOKE ALL ON FUNCTION public.empty_trash() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empty_trash() TO authenticated, service_role;
