-- ============================================================
-- Migration 095 — Drop dead RPCs + gate unshare + least privilege
-- ============================================================
-- Follow-up to 092/094 (RPC authz). A full pg_proc sweep found functions
-- that slipped through the earlier enumerations:
--
-- 1. create_node(UUID, TEXT, TEXT, TEXT)
--    The broken overload from 054 (CHECK-violating cause_type/permission).
--    Migration 079's DROP was never applied to the remote DB — the function
--    is still live and GRANTed to anon/authenticated → anyone could call it
--    with an arbitrary p_owner_id (impersonation). Drop it.
--
-- 2. search_nodes(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
--    Legacy search RPC. The feed lock mandates search via get_feed's
--    p_search_query. No live callers. Drop it.
--
-- 3. get_feed_custom_sort(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID,
--                         UUID[], UUID[], UUID[], TEXT, INTEGER, INTEGER)
--    Legacy custom-sort RPC. Custom sort now flows through get_feed's
--    p_custom_order_ids. No live callers. Drop it.
--
-- 4. unshare(p_cause_id, p_requesting_user_id)
--    Used by the app (service client) but its ownership check compared the
--    cause owner against the CALLER-SUPPLIED p_requesting_user_id → an
--    attacker could pass the victim's id to unshare the victim's content,
--    and anon/PUBLIC had EXECUTE. Add the role-aware auth gate (same as
--    092/094) so only service_role or the matching authenticated user can
--    run it.
--
-- 5. Least privilege on remaining functions:
--    - grant/revoke folder/group admin: called from app/lib/actions/admin.ts
--      via the USER-SESSION client (authenticated role) → keep authenticated,
--      revoke PUBLIC + anon.
--    - increment_view_count: called from lib/db/cardDetail.ts via the
--      service client only → revoke PUBLIC + anon + authenticated.
-- ============================================================

-- ── 1-3. Drop dead / broken RPCs ─────────────────────────────
DROP FUNCTION IF EXISTS public.create_node(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.search_nodes(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_feed_custom_sort(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID[], UUID[], UUID[], TEXT, INTEGER, INTEGER);

-- ── 4. unshare: add role-aware auth gate ─────────────────────
CREATE OR REPLACE FUNCTION public.unshare(
  p_cause_id UUID,
  p_requesting_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cause_created_by UUID;
  v_cause_exists BOOLEAN;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_requesting_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  -- Step 1: Verify cause exists and get ownership
  SELECT created_by INTO v_cause_created_by
  FROM causes
  WHERE id = p_cause_id;

  v_cause_exists := FOUND;

  -- Step 2: Authorization check
  IF NOT v_cause_exists THEN
    RAISE EXCEPTION 'Cause % not found', p_cause_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_cause_created_by != p_requesting_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cause % was created by %, not %',
      p_cause_id, v_cause_created_by, p_requesting_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 3: DELETE the cause - edges cascade automatically via FK
  DELETE FROM causes WHERE id = p_cause_id;

  -- Return true to indicate successful deletion
  RETURN true;
END;
$function$;

-- ── 5. Least-privilege revokes ───────────────────────────────
-- admin grant/revoke: authenticated (server actions via user session) + service_role
REVOKE EXECUTE ON FUNCTION public.grant_folder_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_group_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_folder_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_group_admin(UUID, UUID) FROM PUBLIC, anon;
-- increment_view_count: service-only
REVOKE EXECUTE ON FUNCTION public.increment_view_count(UUID) FROM PUBLIC, anon, authenticated;
