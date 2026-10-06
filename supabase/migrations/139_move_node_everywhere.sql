-- ============================================================
-- Migration 139 — AUDIT-09 P3-5: move_node_everywhere RPC
-- ============================================================
-- moveNodeEverywhereAction looped move_node_to_folder once per
-- source folder — N transactions, so a mid-loop failure left the
-- node half-moved. It also enumerated sources via a session-RLS
-- read of folder_edges, silently missing folders it can't see.
-- This RPC performs the whole move in ONE transaction:
--   add to target (idempotent, grant expansion + notification),
--   then remove from every OTHER folder the caller may remove
--   from — same per-source rights check as move_node_to_folder.
-- Sources the caller may not touch are skipped (same outcome as
-- the RLS-hidden rows in the old path, minus the partial write).
-- ============================================================

CREATE OR REPLACE FUNCTION public.move_node_everywhere(
  p_node_id          uuid,
  p_target_folder_id uuid,
  p_user_id          uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_fe  folder_edges%ROWTYPE;
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

  -- add to target (idempotent) then expand covering grants — same as
  -- move_node_to_folder
  INSERT INTO folder_edges (node_id, folder_id, added_by)
  VALUES (p_node_id, p_target_folder_id, COALESCE(v_uid, p_user_id))
  ON CONFLICT (node_id, folder_id) DO NOTHING;
  IF FOUND THEN
    PERFORM public._expand_folder_grants_for_node(p_node_id, p_target_folder_id, COALESCE(v_uid, p_user_id));
    PERFORM public._notify_folder_item_added(p_target_folder_id, p_node_id, COALESCE(v_uid, p_user_id));
  END IF;

  -- remove from every other folder the caller may remove from
  FOR v_fe IN
    SELECT * FROM folder_edges
    WHERE node_id = p_node_id AND folder_id <> p_target_folder_id
  LOOP
    v_allowed := TRUE;
    IF auth.role() <> 'service_role' THEN
      v_allowed := ((SELECT owner_id FROM folders WHERE id = v_fe.folder_id) = v_uid)
                   OR ((SELECT owner_id FROM nodes WHERE id = p_node_id) = v_uid)
                   OR (v_fe.added_by = v_uid)
                   OR public._perm_rank(public.effective_folder_permission(v_fe.folder_id, v_uid)) >= 6;
    END IF;
    IF v_allowed THEN
      DELETE FROM folder_edges WHERE id = v_fe.id;
      PERFORM public._revoke_folder_grants_for_node(p_node_id, v_fe.folder_id);
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_node_everywhere(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.move_node_everywhere(uuid, uuid, uuid) FROM PUBLIC, anon;
