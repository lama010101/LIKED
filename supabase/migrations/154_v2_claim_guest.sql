-- ============================================================
-- Migration 154 — v2 Recommendation Inbox: guest claim
-- (PLAN-V2-002 §2.8, PRD v2.6 §4/§5.5; task V2-W9-CLAIM-1128-001)
-- ============================================================
-- One SECURITY DEFINER class-S function:
--   claim_guest(p_contributor_id uuid, p_user_id uuid)
--
-- Security posture identical to migrations 143/144/146/147 (§1.3):
--   in-body guard auth.role() = 'service_role' (42501),
--   EXECUTE revoked from PUBLIC/anon/authenticated and granted
--   to service_role only. pg_default_acl auto-grants new
--   functions to anon/authenticated, so the REVOKE is required.
--
-- Merge semantics for the return payload:
--   merged_into             surviving contributors.id
--   moved_recommendations   non-conflicting recommendation rows re-pointed
--   merged_conflicts        (owner_id,item_id) pairs present on both sides
--   dropped_self            surviving contributor's rows owned by p_user_id
-- Self-drop is scoped to the surviving contributor: owner_id alone is the
-- recipient, not the author; deleting every row with owner_id=p_user_id
-- would erase recommendations sent to that user by other people.
-- ============================================================

CREATE FUNCTION public.claim_guest(p_contributor_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_guest_claimed        uuid;
  v_target_id            uuid;
  v_moved_recommendations integer := 0;
  v_merged_conflicts      integer := 0;
  v_dropped_self          integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- §2.8 step 1: lock the guest row. A row already claimed by this
  -- user is the idempotent replay; a row claimed by another user is invalid.
  SELECT c.claimed_by_user_id
  INTO v_guest_claimed
  FROM public.contributors c
  WHERE c.id = p_contributor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF v_guest_claimed IS NOT NULL THEN
    IF v_guest_claimed = p_user_id THEN
      RETURN jsonb_build_object(
        'merged_into', p_contributor_id,
        'moved_recommendations', 0,
        'merged_conflicts', 0,
        'dropped_self', 0
      );
    END IF;
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- §2.8 step 2: an existing claimed contributor is the merge target T.
  SELECT c.id
  INTO v_target_id
  FROM public.contributors c
  WHERE c.claimed_by_user_id = p_user_id
  FOR UPDATE;

  IF v_target_id IS NULL THEN
    -- §2.8 step 3, no-T path: claim in place; submissions and
    -- recommendations keep this contributor id.
    UPDATE public.contributors c
    SET claimed_by_user_id = p_user_id,
        claimed_at = now()
    WHERE c.id = p_contributor_id;
    v_target_id := p_contributor_id;
  ELSE
    -- §2.8 step 3, T path: move submissions first. client_batch_id is
    -- nulled on moved rows so the (contributor_id, client_batch_id)
    -- uniqueness constraint cannot clash with the target's history.
    UPDATE public.submissions s
    SET contributor_id = v_target_id,
        client_batch_id = NULL
    WHERE s.contributor_id = p_contributor_id;

    -- Count disjoint report buckets before the merge: rows with no
    -- target-side conflict are "moved"; owner/item pairs present on both
    -- sides are "merged_conflicts" regardless of which updated_at wins.
    SELECT count(*)::integer
    INTO v_moved_recommendations
    FROM public.recommendations g
    WHERE g.contributor_id = p_contributor_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.recommendations t
        WHERE t.contributor_id = v_target_id
          AND t.owner_id = g.owner_id
          AND t.item_id = g.item_id
      );

    SELECT count(*)::integer
    INTO v_merged_conflicts
    FROM public.recommendations g
    JOIN public.recommendations t
      ON t.contributor_id = v_target_id
     AND t.owner_id = g.owner_id
     AND t.item_id = g.item_id
    WHERE g.contributor_id = p_contributor_id;

    -- Conflict rule: keep the row with the greater updated_at. The target
    -- row wins ties deterministically (updated_at is NOT NULL; equality is
    -- possible when rows were written in one transaction).
    DELETE FROM public.recommendations g
    USING public.recommendations t
    WHERE g.contributor_id = p_contributor_id
      AND t.contributor_id = v_target_id
      AND t.owner_id = g.owner_id
      AND t.item_id = g.item_id
      AND t.updated_at >= g.updated_at;

    DELETE FROM public.recommendations t
    USING public.recommendations g
    WHERE g.contributor_id = p_contributor_id
      AND t.contributor_id = v_target_id
      AND t.owner_id = g.owner_id
      AND t.item_id = g.item_id
      AND g.updated_at > t.updated_at;

    -- Survivors on the guest side (non-conflicts plus strictly newer
    -- conflict winners) now re-point to T without violating the
    -- (owner_id,item_id,contributor_id) uniqueness constraint.
    UPDATE public.recommendations g
    SET contributor_id = v_target_id
    WHERE g.contributor_id = p_contributor_id;

    -- Notification payloads carry contributor_id for the rail/claim/delete
    -- paths; re-point only that key and leave the name snapshot untouched.
    UPDATE public.notifications n
    SET payload = jsonb_set(n.payload, '{contributor_id}', to_jsonb(v_target_id::text), false)
    WHERE n.type = 'recommendation_received'
      AND n.payload->>'contributor_id' = p_contributor_id::text;

    -- owner_contributor_blocks.contributor_id is ON DELETE CASCADE
    -- (migration 142): deleting the guest row below would silently lift
    -- every owner block (PRD 10.1). Re-point each block to the surviving
    -- contributor first; ON CONFLICT keeps an existing (owner,T) row.
    INSERT INTO public.owner_contributor_blocks (owner_id, contributor_id)
    SELECT b.owner_id, v_target_id
    FROM public.owner_contributor_blocks b
    WHERE b.contributor_id = p_contributor_id
    ON CONFLICT (owner_id, contributor_id) DO NOTHING;

    DELETE FROM public.contributors c
    WHERE c.id = p_contributor_id;
  END IF;

  -- Nobody recommends to himself. Scoped to the surviving contributor:
  -- owner_id is the recipient and other contributors' rows in that inbox
  -- are not part of this claim.
  DELETE FROM public.recommendations r
  WHERE r.owner_id = p_user_id
    AND r.contributor_id = v_target_id;
  GET DIAGNOSTICS v_dropped_self = ROW_COUNT;

  RETURN jsonb_build_object(
    'merged_into', v_target_id,
    'moved_recommendations', v_moved_recommendations,
    'merged_conflicts', v_merged_conflicts,
    'dropped_self', v_dropped_self
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_guest(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest(uuid, uuid) TO service_role;

-- §2.8 step 5 persistence helper. Routes may not write domain tables
-- directly (Tier-0 REPO-15), so rotation of the surviving contributor's
-- cookie secret is itself a class-S RPC. Only the sha256 hash is stored.
CREATE FUNCTION public.guest_rotate_secret(p_contributor_id uuid, p_secret_hash bytea)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_secret_hash IS NULL OR octet_length(p_secret_hash) <> 32 THEN
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.contributors c
  SET secret_hash = p_secret_hash
  WHERE c.id = p_contributor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_rotate_secret(uuid, bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_rotate_secret(uuid, bytea) TO service_role;
