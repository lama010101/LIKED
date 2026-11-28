-- ============================================================
-- Migration 155 — v2 owner remove/block contributor
-- (PLAN-V2-002 §10.1; DRAFT for V2-W9-PLAYLIST-1128-001 PR-2,
-- not pre-authorized)
-- ============================================================
-- Class O (owner): SECURITY DEFINER, search_path=public,
-- auth.uid() guard first, EXECUTE revoked from PUBLIC/anon and
-- granted to authenticated (+ service_role, same as the other
-- class-O RPCs of migration 145).
--
-- owner_contributor_blocks exists since migration 142 and
-- CONTRIBUTOR_BLOCKED is enforced in submit_recommendations
-- (migration 144); get_friend_rail / get_inbox_item already
-- exclude blocked contributors. These three RPCs add the owner
-- management actions:
--
--   remove_contributor_recommendations(p_contributor_id)
--     delete that contributor's recommendations AND submissions
--     for the CALLER only. The rail and the unseen counts are
--     derived from those rows, so both update with no extra work.
--   block_contributor(p_contributor_id)
--     same deletion + insert the block row (future submits raise
--     CONTRIBUTOR_BLOCKED, surfaced to the guest as the neutral
--     generic send error — the block is never revealed).
--   unblock_contributor(p_contributor_id)
--     delete the block row. Deleted recommendations/submissions
--     are NOT restored (the removal is permanent by design).
--
-- Anti-enumeration: each function raises the same NOT_FOUND for
-- an unknown contributor id and for a contributor who never
-- submitted to the caller. The evidence check accepts current
-- submissions, current recommendations OR an existing block row
-- (the block row is itself proof of a past relationship), which
-- keeps repeat calls idempotent in the REST/DELETE sense: the
-- first call applies the change, a repeat call either no-ops
-- successfully (block/unblock evidence still present) or answers
-- NOT_FOUND once every trace is gone — server state after N
-- calls equals state after 1 call. Notifications are
-- deliberately untouched: payload-only history rows, no FK.
-- Each function body is one implicit transaction (atomic).
-- ============================================================

CREATE FUNCTION public.remove_contributor_recommendations(p_contributor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_evidence boolean;
  v_recs     integer;
  v_subs     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_contributor_id IS NULL THEN
    RAISE EXCEPTION 'invalid contributor' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.submissions s
                  JOIN public.asks a ON a.id = s.ask_id
                  WHERE a.owner_id = v_uid AND s.contributor_id = p_contributor_id)
      OR EXISTS (SELECT 1 FROM public.recommendations r
                  WHERE r.owner_id = v_uid AND r.contributor_id = p_contributor_id)
      OR EXISTS (SELECT 1 FROM public.owner_contributor_blocks b
                  WHERE b.owner_id = v_uid AND b.contributor_id = p_contributor_id)
    INTO v_evidence;
  IF NOT v_evidence THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.recommendations r
  WHERE r.owner_id = v_uid AND r.contributor_id = p_contributor_id;
  GET DIAGNOSTICS v_recs = ROW_COUNT;
  DELETE FROM public.submissions s USING public.asks a
  WHERE s.ask_id = a.id AND a.owner_id = v_uid AND s.contributor_id = p_contributor_id;
  GET DIAGNOSTICS v_subs = ROW_COUNT;
  RETURN jsonb_build_object('removed_recommendations', v_recs, 'removed_submissions', v_subs);
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_contributor_recommendations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_contributor_recommendations(uuid) TO authenticated, service_role;

CREATE FUNCTION public.block_contributor(p_contributor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_evidence boolean;
  v_recs     integer;
  v_subs     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_contributor_id IS NULL THEN
    RAISE EXCEPTION 'invalid contributor' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.submissions s
                  JOIN public.asks a ON a.id = s.ask_id
                  WHERE a.owner_id = v_uid AND s.contributor_id = p_contributor_id)
      OR EXISTS (SELECT 1 FROM public.recommendations r
                  WHERE r.owner_id = v_uid AND r.contributor_id = p_contributor_id)
      OR EXISTS (SELECT 1 FROM public.owner_contributor_blocks b
                  WHERE b.owner_id = v_uid AND b.contributor_id = p_contributor_id)
    INTO v_evidence;
  IF NOT v_evidence THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.recommendations r
  WHERE r.owner_id = v_uid AND r.contributor_id = p_contributor_id;
  GET DIAGNOSTICS v_recs = ROW_COUNT;
  DELETE FROM public.submissions s USING public.asks a
  WHERE s.ask_id = a.id AND a.owner_id = v_uid AND s.contributor_id = p_contributor_id;
  GET DIAGNOSTICS v_subs = ROW_COUNT;
  INSERT INTO public.owner_contributor_blocks (owner_id, contributor_id)
  VALUES (v_uid, p_contributor_id)
  ON CONFLICT (owner_id, contributor_id) DO NOTHING;
  RETURN jsonb_build_object('blocked', true, 'removed_recommendations', v_recs, 'removed_submissions', v_subs);
END;
$function$;

REVOKE ALL ON FUNCTION public.block_contributor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_contributor(uuid) TO authenticated, service_role;

CREATE FUNCTION public.unblock_contributor(p_contributor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_evidence boolean;
  v_rows     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_contributor_id IS NULL THEN
    RAISE EXCEPTION 'invalid contributor' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.submissions s
                  JOIN public.asks a ON a.id = s.ask_id
                  WHERE a.owner_id = v_uid AND s.contributor_id = p_contributor_id)
      OR EXISTS (SELECT 1 FROM public.recommendations r
                  WHERE r.owner_id = v_uid AND r.contributor_id = p_contributor_id)
      OR EXISTS (SELECT 1 FROM public.owner_contributor_blocks b
                  WHERE b.owner_id = v_uid AND b.contributor_id = p_contributor_id)
    INTO v_evidence;
  IF NOT v_evidence THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.owner_contributor_blocks b
  WHERE b.owner_id = v_uid AND b.contributor_id = p_contributor_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('unblocked', v_rows > 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.unblock_contributor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unblock_contributor(uuid) TO authenticated, service_role;
