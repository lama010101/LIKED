-- ============================================================
-- Migration 122 — MVP2 P2-01: folder visibility + grant expansion helpers
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Visibility stays edge-existence only (T0-1). folder_grants is a write-time
-- instruction table — these helpers turn grants into causes+edges and remove
-- them again on revocation. All helpers are internal (EXECUTE revoked from
-- everyone; they run under the calling SECURITY DEFINER function's owner).
--
-- causes.cause_type gains 'folder_grant_expand' — every edge produced by
-- grant expansion carries a cause of this type whose folder_grant_id points
-- at the grant, so grant deletion cascades to exactly its expanded edges.
-- ============================================================

ALTER TABLE public.causes DROP CONSTRAINT IF EXISTS causes_cause_type_check;
ALTER TABLE public.causes ADD CONSTRAINT causes_cause_type_check
  CHECK (cause_type IN ('direct_share','group_share','import','folder_grant_expand'));

-- ── permission ranks (Q3): view<comment<contribute<edit<reshare<admin ──
CREATE OR REPLACE FUNCTION public._perm_rank(p_permission TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE SET search_path = 'public' AS $$
  SELECT CASE p_permission
    WHEN 'view' THEN 1 WHEN 'comment' THEN 2 WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4 WHEN 'reshare' THEN 5 WHEN 'admin' THEN 6 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public._perm_name(p_rank INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = 'public' AS $$
  SELECT CASE p_rank
    WHEN 1 THEN 'view' WHEN 2 THEN 'comment' WHEN 3 THEN 'contribute'
    WHEN 4 THEN 'edit' WHEN 5 THEN 'reshare' WHEN 6 THEN 'admin' ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public._blocked_pair(p_a UUID, p_b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM blocks b
    WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
       OR (b.blocker_id = p_b AND b.blocked_id = p_a));
$$;

-- ── folder visibility: owner OR a live folder edge; blocks excluded ──
CREATE OR REPLACE FUNCTION public.folder_is_visible(p_folder_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = p_folder_id
      AND f.deleted_at IS NULL
      AND (f.owner_id = p_user_id
           OR EXISTS (SELECT 1 FROM edges e WHERE e.folder_id = f.id AND e.user_id = p_user_id))
      AND NOT public._blocked_pair(p_user_id, f.owner_id));
$$;

-- ── effective folder permission: owner→admin, else max folder-edge rank ──
CREATE OR REPLACE FUNCTION public.effective_folder_permission(p_folder_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_owner UUID;
  v_max INT;
BEGIN
  SELECT owner_id INTO v_owner FROM folders WHERE id = p_folder_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF v_owner = p_user_id THEN RETURN 'admin'; END IF;
  IF public._blocked_pair(p_user_id, v_owner) THEN RETURN NULL; END IF;
  SELECT MAX(public._perm_rank(e.permission)) INTO v_max
    FROM edges e WHERE e.folder_id = p_folder_id AND e.user_id = p_user_id;
  RETURN public._perm_name(v_max);
END;
$$;

-- ── effective node permission: owner→admin, else max node-edge rank ──
CREATE OR REPLACE FUNCTION public.effective_node_permission(p_node_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_owner UUID;
  v_max INT;
BEGIN
  SELECT owner_id INTO v_owner FROM nodes WHERE id = p_node_id AND deleted_at IS NULL;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF v_owner = p_user_id THEN RETURN 'admin'; END IF;
  IF public._blocked_pair(p_user_id, v_owner) THEN RETURN NULL; END IF;
  SELECT MAX(public._perm_rank(e.permission)) INTO v_max
    FROM edges e WHERE e.node_id = p_node_id AND e.user_id = p_user_id;
  RETURN public._perm_name(v_max);
END;
$$;

-- ── nesting level: root = 1; cap is 5 (Q1) ──
CREATE OR REPLACE FUNCTION public._folder_level(p_folder_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT 1 + COALESCE(MAX(depth), 0) FROM folder_tree WHERE folder_id = p_folder_id;
$$;

-- ── grant expansion onto a scope subtree ──
-- For grant G (on folder GF) and scope folder S where GF is an ancestor-or-self
-- of S: creates one 'folder_grant_expand' cause per (G × target) carrying
-- folder_grant_id=G, then received edge (grantee) + sent edge (granter).
-- Targets: every folder in subtree(S) AND every node membership inside it.
-- Blocked pairs are skipped; granter==grantee rows are skipped.
CREATE OR REPLACE FUNCTION public._expand_grant_on_scope(p_grant_id UUID, p_scope_folder_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  g RECORD;
  t RECORD;
  v_cause UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO g FROM folder_grants WHERE id = p_grant_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF g.grantee_id = g.granted_by THEN RETURN; END IF;
  IF public._blocked_pair(g.grantee_id, g.granted_by) THEN RETURN; END IF;

  -- folder edges on every folder in the scope subtree
  FOR t IN SELECT folder_id FROM folder_tree WHERE ancestor_id = p_scope_folder_id
  LOOP
    INSERT INTO causes (cause_type, created_by, folder_grant_id, metadata, created_at)
    VALUES ('folder_grant_expand', g.granted_by, g.id,
            jsonb_build_object('folder_id', t.folder_id), v_now)
    RETURNING id INTO v_cause;
    INSERT INTO edges (id, folder_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
    VALUES (gen_random_uuid(), t.folder_id, g.grantee_id, v_cause, g.granted_by, 'received', 1, g.permission, v_now),
           (gen_random_uuid(), t.folder_id, g.granted_by, v_cause, g.granted_by, 'sent', 1, g.permission, v_now);
  END LOOP;

  -- node edges on every membership inside the scope subtree
  FOR t IN
    SELECT fe.node_id, fe.folder_id AS in_folder_id
      FROM folder_edges fe
      JOIN nodes n ON n.id = fe.node_id AND n.deleted_at IS NULL
     WHERE fe.folder_id IN (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_scope_folder_id)
  LOOP
    INSERT INTO causes (cause_type, created_by, folder_grant_id, metadata, created_at)
    VALUES ('folder_grant_expand', g.granted_by, g.id,
            jsonb_build_object('node_id', t.node_id, 'in_folder_id', t.in_folder_id), v_now)
    RETURNING id INTO v_cause;
    INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
    VALUES (gen_random_uuid(), t.node_id, g.grantee_id, v_cause, g.granted_by, 'received', 1, g.permission, v_now),
           (gen_random_uuid(), t.node_id, g.granted_by, v_cause, g.granted_by, 'sent', 1, g.permission, v_now);
  END LOOP;
END;
$$;

-- ── node added to a folder: expand every covering grant (Q10 live) ──
CREATE OR REPLACE FUNCTION public._expand_folder_grants_for_node(p_node_id UUID, p_folder_id UUID, p_actor_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  g RECORD;
  v_cause UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  FOR g IN
    SELECT fg.id, fg.grantee_id, fg.permission, fg.granted_by
      FROM folder_grants fg
     WHERE fg.folder_id IN (SELECT ancestor_id FROM folder_tree WHERE folder_id = p_folder_id)
  LOOP
    CONTINUE WHEN g.grantee_id = g.granted_by;
    CONTINUE WHEN public._blocked_pair(g.grantee_id, g.granted_by);
    INSERT INTO causes (cause_type, created_by, folder_grant_id, metadata, created_at)
    VALUES ('folder_grant_expand', g.granted_by, g.id,
            jsonb_build_object('node_id', p_node_id, 'in_folder_id', p_folder_id, 'added_by', p_actor_id), v_now)
    RETURNING id INTO v_cause;
    INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
    VALUES (gen_random_uuid(), p_node_id, g.grantee_id, v_cause, g.granted_by, 'received', 1, g.permission, v_now),
           (gen_random_uuid(), p_node_id, g.granted_by, v_cause, g.granted_by, 'sent', 1, g.permission, v_now);
  END LOOP;
END;
$$;

-- ── folder entering granted scope: expand every strict-ancestor grant ──
CREATE OR REPLACE FUNCTION public._expand_folder_grants_for_folder(p_folder_id UUID, p_actor_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN
    SELECT fg.id FROM folder_grants fg
     WHERE fg.folder_id IN (
       SELECT ancestor_id FROM folder_tree
        WHERE folder_id = p_folder_id AND ancestor_id <> p_folder_id)
  LOOP
    PERFORM public._expand_grant_on_scope(g.id, p_folder_id);
  END LOOP;
END;
$$;

-- ── node leaving a folder: delete exactly this membership's grant causes (Q11) ──
CREATE OR REPLACE FUNCTION public._revoke_folder_grants_for_node(p_node_id UUID, p_folder_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  DELETE FROM causes c
   USING folder_grants fg
   WHERE c.folder_grant_id = fg.id
     AND fg.folder_id IN (SELECT ancestor_id FROM folder_tree WHERE folder_id = p_folder_id)
     AND c.metadata->>'node_id' = p_node_id::text
     AND c.metadata->>'in_folder_id' = p_folder_id::text;
END;
$$;

-- ── folder leaving granted scope: delete ancestor-grant causes for subtree ──
CREATE OR REPLACE FUNCTION public._revoke_ancestor_grants_for_subtree(p_folder_id UUID, p_ancestor_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  DELETE FROM causes c
   USING folder_grants fg
   WHERE c.folder_grant_id = fg.id
     AND fg.folder_id = ANY(p_ancestor_ids)
     AND ((c.metadata->>'folder_id')::uuid IN
            (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id)
          OR (c.metadata->>'in_folder_id')::uuid IN
            (SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id));
END;
$$;

-- ── notify folder audience that an item was added (Q6) ──
CREATE OR REPLACE FUNCTION public._notify_folder_item_added(p_folder_id UUID, p_node_id UUID, p_actor_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner FROM folders WHERE id = p_folder_id;
  -- nothing to notify for an owner adding to an unshared folder
  IF v_owner = p_actor_id AND NOT EXISTS (SELECT 1 FROM folder_grants WHERE folder_id = p_folder_id) THEN
    RETURN;
  END IF;
  INSERT INTO notifications (id, user_id, type, payload, read, created_at)
  SELECT gen_random_uuid(), r.user_id, 'folder_item_added',
         jsonb_build_object('folder_id', p_folder_id, 'node_id', p_node_id, 'actor_id', p_actor_id),
         false, now()
    FROM (
      SELECT v_owner AS user_id
      UNION
      SELECT e.user_id FROM edges e WHERE e.folder_id = p_folder_id
    ) r
   WHERE r.user_id IS NOT NULL
     AND r.user_id <> p_actor_id
     AND NOT public._blocked_pair(r.user_id, p_actor_id);
END;
$$;

-- Internal helpers: no direct grants. SECURITY DEFINER callers run as owner.
REVOKE ALL ON FUNCTION public._perm_rank(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perm_name(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._blocked_pair(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._folder_level(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expand_grant_on_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expand_folder_grants_for_node(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._expand_folder_grants_for_folder(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._revoke_folder_grants_for_node(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._revoke_ancestor_grants_for_subtree(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notify_folder_item_added(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Read-side helpers are callable by authenticated users (used by read RPCs).
REVOKE ALL ON FUNCTION public.folder_is_visible(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.folder_is_visible(UUID, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.effective_folder_permission(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_folder_permission(UUID, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.effective_node_permission(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_node_permission(UUID, UUID) TO authenticated, service_role;
