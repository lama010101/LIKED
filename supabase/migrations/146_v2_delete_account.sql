-- ============================================================
-- Migration 146 — v2 Recommendation Inbox: delete_account
-- class-S function (PLAN-V2-002 §2.10, §3.2, §3.5; task
-- V2-W2-P0-05, PLAN P0-05)
-- ============================================================
-- One SECURITY DEFINER function, class S (server-only):
--   delete_account(p_user_id uuid, p_email text) RETURNS jsonb
--
-- Security posture identical to migrations 143/144 (§1.3):
--   in-body guard auth.role() = 'service_role' (42501),
--   EXECUTE revoked from PUBLIC/anon/authenticated and granted
--   to service_role only.
--
-- Scope guard (task): NO new tables, NO policies, NO table
-- grants, NO changes/DROPs to existing objects, no direct
-- INSERT/UPDATE/DELETE on edges or folder_edges (O6): edges go
-- only through cause deletion (step 8) and placements only
-- through remove_node_from_folder (step 3); everything else by
-- cascade. Storage and auth.users are NOT touched here (route
-- stages c/d, task P0-20). No EXCEPTION handler: any failure
-- aborts the whole transaction.
-- ============================================================

-- ------------------------------------------------------------
-- §3.2 delete_account — single-transaction account deletion.
-- Step 0 (O1): FOR UPDATE lock on the users row serialises
-- concurrent calls; the ledger row is written in the same
-- transaction as every deletion, so a committed ledger row
-- means the DB phase completed -> {already:true}.
-- ------------------------------------------------------------
CREATE FUNCTION public.delete_account(p_user_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_found      uuid;
  v_place      record;
  v_counts     jsonb := '{}'::jsonb;
  v_n          integer;
  v_claimed    uuid[];
  v_guests     uuid[];
  v_orphans    uuid[];
  v_rated      uuid[];
  v_owned      uuid[];
  v_placements integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid user' USING ERRCODE = '22023';
  END IF;
  IF p_email IS NOT NULL AND char_length(p_email) NOT BETWEEN 3 AND 254 THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;

  -- STEP 0: lock the user row, then ledger (O1)
  SELECT u.id INTO v_found
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;
  IF v_found IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id = p_user_id) THEN
      RETURN jsonb_build_object('already', true, 'deleted', false);
    END IF;
    RETURN jsonb_build_object('already', false, 'deleted', false, 'not_found', true);
  END IF;
  INSERT INTO public.account_deletion_jobs (user_id, email)
  VALUES (p_user_id, p_email)
  ON CONFLICT DO NOTHING;

  -- STEP 1: sent side — contributors claimed by this user and
  -- every trace of them in other owners' inboxes (O2). The id
  -- set is captured BEFORE the contributors rows are deleted.
  SELECT array_agg(c.id) INTO v_claimed
  FROM public.contributors c
  WHERE c.claimed_by_user_id = p_user_id;
  v_claimed := COALESCE(v_claimed, '{}'::uuid[]);

  DELETE FROM public.notifications n
  WHERE n.type = 'recommendation_received'
    AND n.payload->>'contributor_id' IN (SELECT x::text FROM unnest(v_claimed) AS x);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s1_notifications', v_n);

  DELETE FROM public.email_outbox e
  WHERE e.kind = 'recommendation_received'
    AND e.payload->>'contributor_id' IN (SELECT x::text FROM unnest(v_claimed) AS x);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s1_email_outbox', v_n);

  DELETE FROM public.youtube_search_budget b
  WHERE b.scope IN (SELECT 'c:' || x::text FROM unnest(v_claimed) AS x);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s1_youtube_search_budget', v_n);

  DELETE FROM public.contributors c
  WHERE c.claimed_by_user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s1_contributors', v_n);

  -- STEP 2: remember unclaimed guest candidates — contributors
  -- who submitted to this owner's ask (evaluated while the
  -- asks still exist; orphan test runs at step 11).
  SELECT array_agg(DISTINCT s.contributor_id) INTO v_guests
  FROM public.submissions s
  JOIN public.asks a ON a.id = s.ask_id
  WHERE a.owner_id = p_user_id;
  v_guests := COALESCE(v_guests, '{}'::uuid[]);
  v_counts := v_counts || jsonb_build_object('s2_guest_candidates', COALESCE(array_length(v_guests, 1), 0));

  -- STEP 3: placements the user made in folders owned by others
  -- of nodes owned by others — remove via the authorised path
  -- (service branch deletes the folder_edges row and revokes
  -- covering folder_grant_expand causes). Must precede the
  -- user delete or folder_edges.added_by would be SET NULL.
  FOR v_place IN
    SELECT fe.node_id, fe.folder_id
    FROM public.folder_edges fe
    JOIN public.folders f ON f.id = fe.folder_id
    JOIN public.nodes nd ON nd.id = fe.node_id
    WHERE fe.added_by = p_user_id
      AND f.owner_id <> p_user_id
      AND nd.owner_id <> p_user_id
  LOOP
    PERFORM public.remove_node_from_folder(v_place.node_id, v_place.folder_id);
    v_placements := v_placements + 1;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('s3_placements_removed', v_placements);

  -- STEP 4: ratings the user gave + same-transaction recompute
  -- of nodes_sort_cache.avg_rating for the affected nodes (I-16).
  SELECT array_agg(DISTINCT r.node_id) INTO v_rated
  FROM public.ratings r
  WHERE r.user_id = p_user_id;
  v_rated := COALESCE(v_rated, '{}'::uuid[]);

  DELETE FROM public.ratings r WHERE r.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s4_ratings', v_n);

  IF v_rated IS NOT NULL THEN
    UPDATE public.nodes_sort_cache c
    SET avg_rating = (SELECT AVG(r.score) FROM public.ratings r WHERE r.node_id = c.node_id),
        updated_at = now()
    WHERE c.node_id = ANY (v_rated);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('s4_sort_cache_updated', v_n);
  END IF;

  -- STEP 5: chats — node_messages sent, direct-chat messages,
  -- then the direct_chats rows themselves (NO ACTION FKs).
  DELETE FROM public.node_messages m WHERE m.sender_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s5_node_messages', v_n);

  DELETE FROM public.messages m
  WHERE m.sender_id = p_user_id
     OR m.chat_id IN (SELECT d.id FROM public.direct_chats d
                      WHERE d.user_1_id = p_user_id OR d.user_2_id = p_user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s5_messages', v_n);

  DELETE FROM public.direct_chats d
  WHERE d.user_1_id = p_user_id OR d.user_2_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s5_direct_chats', v_n);

  -- STEP 6: groups (O4) — every child of groups the user owns
  -- (group_id FKs are NO ACTION), the user's own membership /
  -- admin rows and sent messages in OTHER groups too.
  SELECT array_agg(g.id) INTO v_owned
  FROM public.groups g
  WHERE g.owner_id = p_user_id;
  v_owned := COALESCE(v_owned, '{}'::uuid[]);

  DELETE FROM public.group_messages m
  WHERE m.sender_id = p_user_id OR m.group_id = ANY (v_owned);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s6_group_messages', v_n);

  DELETE FROM public.group_nodes gn WHERE gn.group_id = ANY (v_owned);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s6_group_nodes', v_n);

  DELETE FROM public.group_admins ga
  WHERE ga.user_id = p_user_id OR ga.granted_by = p_user_id OR ga.group_id = ANY (v_owned);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s6_group_admins', v_n);

  DELETE FROM public.group_members gm
  WHERE gm.user_id = p_user_id OR gm.group_id = ANY (v_owned);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s6_group_members', v_n);

  DELETE FROM public.groups g WHERE g.owner_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s6_groups', v_n);

  -- STEP 7: remaining NO ACTION tables + notifications of other
  -- users that name this user in the payload (O3: actor_id per
  -- plan, sender_id per live payload keys).
  DELETE FROM public.folder_admins fa
  WHERE fa.user_id = p_user_id OR fa.granted_by = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_folder_admins', v_n);

  DELETE FROM public.blocks b
  WHERE b.blocker_id = p_user_id OR b.blocked_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_blocks', v_n);

  DELETE FROM public.categorization_suggestions cs WHERE cs.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_categorization_suggestions', v_n);

  DELETE FROM public.categorization_suggestions_backup_20260927 cs
  WHERE cs.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_categorization_backup', v_n);

  DELETE FROM public.notifications n WHERE n.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_notifications_owned', v_n);

  DELETE FROM public.notifications n
  WHERE n.payload->>'actor_id' = p_user_id::text
     OR n.payload->>'sender_id' = p_user_id::text;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_notifications_actor', v_n);

  DELETE FROM public.activity_log al WHERE al.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s7_activity_log', v_n);

  -- STEP 8: causes — created by the user, or the cause behind
  -- any edge the user sent. Cascades every such edge (I-03/I-06);
  -- this is the only edge-removal path and it clears the
  -- edges_sender_id_fkey NO ACTION blocker.
  DELETE FROM public.causes c
  WHERE c.created_by = p_user_id
     OR c.id IN (SELECT e.cause_id FROM public.edges e WHERE e.sender_id = p_user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s8_causes', v_n);

  -- STEP 9: tokens — encrypted OAuth material leaves the DB in
  -- the same transaction (CASCADE would also get them at step
  -- 10; explicit delete keeps the counts exact).
  DELETE FROM public.youtube_connections y WHERE y.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s9_youtube_connections', v_n);

  DELETE FROM public.card_positions cp WHERE cp.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s9_card_positions', v_n);

  -- STEP 10: the user row — cascades nodes/folders and every
  -- remaining owned object (inbox owner side included).
  DELETE FROM public.users u WHERE u.id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s10_users', v_n);

  -- STEP 11: orphan guests (O5) — unclaimed contributors whose
  -- only audience was this owner (no submissions left after the
  -- cascade). Their email_outbox / budget rows go first.
  SELECT array_agg(c.id) INTO v_orphans
  FROM public.contributors c
  WHERE c.id = ANY (v_guests)
    AND c.claimed_by_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.submissions s WHERE s.contributor_id = c.id);
  v_orphans := COALESCE(v_orphans, '{}'::uuid[]);

  DELETE FROM public.email_outbox e
  WHERE e.kind = 'recommendation_received'
    AND e.payload->>'contributor_id' IN (SELECT x::text FROM unnest(v_orphans) AS x);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s11_email_outbox', v_n);

  DELETE FROM public.youtube_search_budget b
  WHERE b.scope IN (SELECT 'c:' || x::text FROM unnest(v_orphans) AS x);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s11_youtube_search_budget', v_n);

  DELETE FROM public.notifications n
  WHERE n.type = 'recommendation_received'
    AND n.payload->>'contributor_id' IN (SELECT x::text FROM unnest(v_orphans) AS x);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s11_notifications', v_n);

  DELETE FROM public.contributors c WHERE c.id = ANY (v_orphans);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s11_contributors', v_n);

  -- STEP 12: ledger stage hand-over (explicit no-op by default).
  UPDATE public.account_deletion_jobs j
  SET stage = 'storage'
  WHERE j.user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('s12_ledger_stage', v_n);

  RETURN jsonb_build_object('already', false, 'deleted', true, 'counts', v_counts);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_account(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account(uuid, text) TO service_role;
