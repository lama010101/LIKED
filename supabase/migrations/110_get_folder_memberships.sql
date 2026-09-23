-- ============================================================
-- Migration 110 — get_folder_memberships RPC
-- (COMPLETE-APP-002 / HORIZ-001)
-- ============================================================
-- Returns the node_ids inside p_folder_id that the caller can see via
-- edges — the SAME visibility predicate as get_feed's visible_nodes CTE:
--   deleted_at IS NULL AND (owner_id = caller OR caller holds an edge)
--   AND no block in either direction.
-- Gate: caller must pass folder_is_accessible(p_folder_id, auth.uid()).
-- auth.uid() only (G-1); SECURITY DEFINER + search_path; PUBLIC/anon
-- revoked; EXECUTE → authenticated (G-2).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_folder_memberships(p_folder_id UUID)
RETURNS TABLE(node_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.folder_is_accessible(p_folder_id, v_uid) THEN
    RAISE EXCEPTION 'folder not accessible' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT fe.node_id
    FROM public.folder_edges fe
    JOIN public.nodes n ON n.id = fe.node_id
   WHERE fe.folder_id = p_folder_id
     AND n.deleted_at IS NULL
     AND (
       n.owner_id = v_uid
       OR EXISTS (
         SELECT 1 FROM public.edges e
          WHERE e.node_id = n.id AND e.user_id = v_uid
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE (b.blocker_id = v_uid AND b.blocked_id = n.owner_id)
          OR (b.blocker_id = n.owner_id AND b.blocked_id = v_uid)
     );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_folder_memberships(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_folder_memberships(UUID) TO authenticated;
