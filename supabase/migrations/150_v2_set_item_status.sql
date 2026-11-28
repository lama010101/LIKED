-- ============================================================
-- Migration 150 — v2 Recommendation Inbox: set_item_status
-- DRAFT for CTO audit (V2-W8-MARATHON-1128-002 WP-4). DO NOT
-- APPLY OR MERGE before the audit.
-- ============================================================
-- One new SECURITY DEFINER function, class O (owner):
--   set_item_status(p_item_id uuid, p_status text) RETURNS void
--
-- Security posture identical to migrations 145/148:
--   in-body guard v_uid := auth.uid(); NULL -> 42501.
--   NO user-id/owner-id parameter — owner_id is always
--   auth.uid(), so there is no cross-user write surface.
--   status CHECK is duplicated in the function body because a
--   table CHECK violation after partial work is less explicit
--   than rejecting before the upsert.
--   EXECUTE revoked from PUBLIC/anon and granted to
--   authenticated + service_role (pg_default_acl auto-grants
--   new functions, so the REVOKE is required).
--
-- Semantics: upsert owner_item_state. A later recommendation is
-- inserted only into recommendations; submit_recommendations
-- does not touch owner_item_state, so a Dismissed item is not
-- resurrected. get_inbox (migration 145) derives the
-- Dismissed-tab-only recommended_again marker from
-- latest_at > owner_item_state.updated_at.
--
-- Scope guard: NO new tables, NO policies, NO table grants, NO
-- DROPs, nothing touching edges/causes/folder_edges, get_feed
-- untouched, no link-management object touched.
-- Rollback:
--   REVOKE ALL ON FUNCTION public.set_item_status(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION public.set_item_status(uuid, text);
-- ============================================================

CREATE FUNCTION public.set_item_status(p_item_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('to_watch','watched','dismissed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.owner_item_state (owner_id, item_id, status, updated_at)
  VALUES (v_uid, p_item_id, p_status, now())
  ON CONFLICT (owner_id, item_id)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.set_item_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_item_status(uuid, text) TO authenticated, service_role;
