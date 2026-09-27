-- ============================================================
-- Migration 125 — MVP2 P2-04: sharing RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- share_folder_v2: creates folder_grants (live sharing, Q10) and expands each
-- grant into causes+edges over the whole subtree. Recipients = explicit ids
-- ∪ all current friends (snapshot, Q3) ∪ current group members (snapshot,
-- Q4). Re-sharing to an existing grantee updates the role in place (folder
-- grant uniqueness keeps access lists unambiguous) and emits
-- 'permission_changed' instead of a second share notification.
-- share_node: multi-target card share; one direct_share cause per recipient
-- (per-cause unshare granularity preserved). Caller must own the node or
-- hold reshare+ on it.
-- ============================================================

-- Resolve a share recipient set: explicit ∪ friends ∪ group members,
-- minus the caller and blocked pairs. Returns distinct user ids.
CREATE OR REPLACE FUNCTION public._share_recipients(
  p_caller UUID,
  p_target_user_ids UUID[],
  p_all_friends BOOLEAN,
  p_group_id UUID
) RETURNS SETOF UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM groups g
     WHERE g.id = p_group_id AND g.deleted_at IS NULL
       AND (g.owner_id = p_caller
            OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = p_group_id AND gm.user_id = p_caller)
            OR EXISTS (SELECT 1 FROM group_admins ga WHERE ga.group_id = p_group_id AND ga.user_id = p_caller))
  ) THEN
    RAISE EXCEPTION 'not a member of target group' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT r FROM (
      SELECT unnest(COALESCE(p_target_user_ids, '{}')) AS r
      UNION
      SELECT CASE WHEN fi.from_user_id = p_caller THEN fi.to_user_id ELSE fi.from_user_id END
        FROM friend_invites fi
       WHERE p_all_friends AND fi.to_user_id IS NOT NULL
         AND (fi.from_user_id = p_caller OR fi.to_user_id = p_caller)
      UNION
      SELECT gm.user_id FROM group_members gm WHERE p_group_id IS NOT NULL AND gm.group_id = p_group_id
    ) x
    WHERE r IS NOT NULL
      AND r <> p_caller
      AND NOT public._blocked_pair(r, p_caller);
END;
$$;

REVOKE ALL ON FUNCTION public._share_recipients(UUID, UUID[], BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.share_folder_v2(
  p_folder_id UUID,
  p_permission TEXT,
  p_target_user_ids UUID[] DEFAULT NULL,
  p_all_friends BOOLEAN DEFAULT false,
  p_group_id UUID DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_recipient UUID;
  v_grant_id UUID;
  v_count INT := 0;
  v_folder_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_permission NOT IN ('view','comment','contribute','edit','reshare','admin') THEN
    RAISE EXCEPTION 'invalid permission' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_folder_name FROM folders WHERE id = p_folder_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'folder not found' USING ERRCODE = '42501'; END IF;
  -- owner or reshare+
  IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 5 THEN
    RAISE EXCEPTION 'need reshare permission' USING ERRCODE = '42501';
  END IF;

  FOR v_recipient IN SELECT public._share_recipients(v_uid, p_target_user_ids, p_all_friends, p_group_id)
  LOOP
    INSERT INTO folder_grants (id, folder_id, grantee_id, permission, granted_by, created_at, updated_at)
    VALUES (gen_random_uuid(), p_folder_id, v_recipient, p_permission, v_uid, now(), now())
    ON CONFLICT (folder_id, grantee_id)
    DO UPDATE SET permission = EXCLUDED.permission, granted_by = EXCLUDED.granted_by, updated_at = now()
    RETURNING id INTO v_grant_id;

    IF EXISTS (SELECT 1 FROM causes WHERE folder_grant_id = v_grant_id) THEN
      -- re-share = role change on an existing live grant
      UPDATE edges e SET permission = p_permission
        FROM causes c WHERE c.id = e.cause_id AND c.folder_grant_id = v_grant_id;
      INSERT INTO notifications (id, user_id, type, payload, read, created_at)
      VALUES (gen_random_uuid(), v_recipient, 'permission_changed',
              jsonb_build_object('folder_id', p_folder_id, 'folder_name', v_folder_name,
                                 'permission', p_permission, 'actor_id', v_uid), false, now());
    ELSE
      PERFORM public._expand_grant_on_scope(v_grant_id, p_folder_id);
      INSERT INTO notifications (id, user_id, type, payload, read, created_at)
      VALUES (gen_random_uuid(), v_recipient, 'folder_share',
              jsonb_build_object('folder_id', p_folder_id, 'folder_name', v_folder_name,
                                 'permission', p_permission, 'sender_id', v_uid), false, now());
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.share_folder_v2(UUID, TEXT, UUID[], BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_folder_v2(UUID, TEXT, UUID[], BOOLEAN, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_folder_grant(p_folder_id UUID, p_grantee_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 6 THEN
    RAISE EXCEPTION 'need admin permission' USING ERRCODE = '42501';
  END IF;
  -- grant row delete cascades its expansion causes, which cascade their edges
  DELETE FROM folder_grants WHERE folder_id = p_folder_id AND grantee_id = p_grantee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_folder_grant(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_folder_grant(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_folder_grant_permission(p_folder_id UUID, p_grantee_id UUID, p_permission TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_grant_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_permission NOT IN ('view','comment','contribute','edit','reshare','admin') THEN
    RAISE EXCEPTION 'invalid permission' USING ERRCODE = '22023';
  END IF;
  IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 6 THEN
    RAISE EXCEPTION 'need admin permission' USING ERRCODE = '42501';
  END IF;
  UPDATE folder_grants SET permission = p_permission, updated_at = now()
   WHERE folder_id = p_folder_id AND grantee_id = p_grantee_id
   RETURNING id INTO v_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'grant not found' USING ERRCODE = '22023'; END IF;
  UPDATE edges e SET permission = p_permission
    FROM causes c WHERE c.id = e.cause_id AND c.folder_grant_id = v_grant_id;
  INSERT INTO notifications (id, user_id, type, payload, read, created_at)
  VALUES (gen_random_uuid(), p_grantee_id, 'permission_changed',
          jsonb_build_object('folder_id', p_folder_id, 'permission', p_permission, 'actor_id', v_uid), false, now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_folder_grant_permission(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_folder_grant_permission(UUID, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.share_node(
  p_node_id UUID,
  p_permission TEXT,
  p_target_user_ids UUID[] DEFAULT NULL,
  p_all_friends BOOLEAN DEFAULT false
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_recipient UUID;
  v_cause UUID;
  v_count INT := 0;
  v_title TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_permission NOT IN ('view','comment','edit','reshare') THEN
    RAISE EXCEPTION 'invalid permission' USING ERRCODE = '22023';
  END IF;
  SELECT title INTO v_title FROM nodes WHERE id = p_node_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public._node_visible(p_node_id, v_uid) THEN
    RAISE EXCEPTION 'node not accessible' USING ERRCODE = '42501';
  END IF;
  IF public._perm_rank(public.effective_node_permission(p_node_id, v_uid)) < 5 THEN
    RAISE EXCEPTION 'need reshare permission' USING ERRCODE = '42501';
  END IF;

  FOR v_recipient IN SELECT public._share_recipients(v_uid, p_target_user_ids, p_all_friends, NULL)
  LOOP
    INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
    VALUES (gen_random_uuid(), 'direct_share', v_uid,
            jsonb_build_object('node_id', p_node_id, 'target_user_id', v_recipient, 'permission', p_permission), now())
    RETURNING id INTO v_cause;
    INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
    VALUES (gen_random_uuid(), p_node_id, v_recipient, v_cause, v_uid, 'received', 1, p_permission, now()),
           (gen_random_uuid(), p_node_id, v_uid, v_cause, v_uid, 'sent', 1, p_permission, now());
    INSERT INTO notifications (id, user_id, type, payload, read, created_at)
    VALUES (gen_random_uuid(), v_recipient, 'share_received',
            jsonb_build_object('node_id', p_node_id, 'node_title', v_title, 'sender_id', v_uid, 'permission', p_permission),
            false, now());
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    INSERT INTO nodes_sort_cache (node_id, share_count) VALUES (p_node_id, v_count)
    ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + EXCLUDED.share_count;
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.share_node(UUID, TEXT, UUID[], BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_node(UUID, TEXT, UUID[], BOOLEAN) TO authenticated, service_role;
