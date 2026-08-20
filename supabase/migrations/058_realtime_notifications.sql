-- ============================================================
-- Migration 058 — P10: Enable Realtime + Notification creation
-- ============================================================
--
-- Changes:
-- 1. Enable Supabase Realtime on edges, notifications, ratings, users, nodes
-- 2. Add notification INSERT to direct_share, group_share, share_folder RPCs
-- 3. Add INSERT/UPDATE RLS policies on notifications table
--
-- Ref: LIKED PRD §22 (real-time sync), §25 (notifications), §32.5 (profile propagation)

-- ============================================================
-- A. Enable Realtime publication on key tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.edges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ratings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;

-- ============================================================
-- B. RLS policies on notifications (INSERT + UPDATE for owner)
-- ============================================================

-- INSERT: service_role only (RPCs create notifications, not client)
CREATE POLICY "notifications_insert_service_role"
  ON notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: user can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: user can delete their own notifications
CREATE POLICY "notifications_delete_own"
  ON notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- C. direct_share — add notification INSERT for target user
-- ============================================================

CREATE OR REPLACE FUNCTION direct_share(
  p_sharer_id UUID,
  p_node_id UUID,
  p_target_user_id UUID,
  p_permission TEXT DEFAULT 'view'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_permission NOT IN ('view', 'comment', 'edit', 'reshare') THEN
    RAISE EXCEPTION 'Invalid permission for node share: %. Must be view, comment, edit, or reshare', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: INSERT into causes
  INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
  VALUES (
    gen_random_uuid(),
    'direct_share',
    p_sharer_id,
    jsonb_build_object('node_id', p_node_id, 'target_user_id', p_target_user_id, 'permission', p_permission),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT received edge
  INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
  VALUES (gen_random_uuid(), p_node_id, p_target_user_id, v_cause_id, p_sharer_id, 'received', 1, p_permission, v_now);

  -- Step 3: INSERT sent edge
  INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
  VALUES (gen_random_uuid(), p_node_id, p_sharer_id, v_cause_id, p_sharer_id, 'sent', 1, p_permission, v_now);

  -- Step 4: Increment share_count
  INSERT INTO nodes_sort_cache (node_id, share_count)
  VALUES (p_node_id, 1)
  ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;

  -- Step 5: Create notification for target user
  INSERT INTO notifications (id, user_id, type, payload, read, created_at)
  VALUES (
    gen_random_uuid(),
    p_target_user_id,
    'share_received',
    jsonb_build_object('node_id', p_node_id, 'sender_id', p_sharer_id, 'permission', p_permission),
    false,
    v_now
  );

  RETURN v_cause_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ============================================================
-- D. group_share — add notification INSERT for each member
-- ============================================================

CREATE OR REPLACE FUNCTION group_share(
  p_sharer_id UUID,
  p_node_id UUID,
  p_group_id UUID,
  p_permission TEXT DEFAULT 'view'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_id UUID;
  v_member_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_permission NOT IN ('view', 'comment', 'edit', 'reshare') THEN
    RAISE EXCEPTION 'Invalid permission for group share: %. Must be view, comment, edit, or reshare', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: INSERT into causes
  INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
  VALUES (
    gen_random_uuid(),
    'group_share',
    p_sharer_id,
    jsonb_build_object('node_id', p_node_id, 'group_id', p_group_id, 'permission', p_permission),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT into group_nodes
  INSERT INTO group_nodes (group_id, node_id, created_at)
  VALUES (p_group_id, p_node_id, v_now);

  -- Step 3: For each member, INSERT edge + notification
  FOR v_member_id IN
    SELECT user_id FROM group_members WHERE group_id = p_group_id
  LOOP
    INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
    VALUES (gen_random_uuid(), p_node_id, v_member_id, v_cause_id, p_sharer_id, 'received', 1, p_permission, v_now);

    -- Notification for each member (except sharer themselves)
    IF v_member_id != p_sharer_id THEN
      INSERT INTO notifications (id, user_id, type, payload, read, created_at)
      VALUES (
        gen_random_uuid(),
        v_member_id,
        'group_share',
        jsonb_build_object('node_id', p_node_id, 'group_id', p_group_id, 'sender_id', p_sharer_id, 'permission', p_permission),
        false,
        v_now
      );
    END IF;
  END LOOP;

  -- Step 4: Increment share_count
  INSERT INTO nodes_sort_cache (node_id, share_count)
  VALUES (p_node_id, 1)
  ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;

  RETURN v_cause_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ============================================================
-- E. share_folder — add notification INSERT for each target user
-- ============================================================

CREATE OR REPLACE FUNCTION share_folder(
  p_sharer_id UUID,
  p_folder_id UUID,
  p_target_user_ids UUID[],
  p_permission TEXT DEFAULT 'view'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_folder_share_op_id UUID := gen_random_uuid();
  v_target_user_id UUID;
  v_notified_users UUID[] := ARRAY[]::UUID[];
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_permission NOT IN ('view', 'contribute', 'edit', 'admin') THEN
    RAISE EXCEPTION 'Invalid permission for folder share: %. Must be view, contribute, edit, or admin', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_node_id IN
    SELECT fe.node_id FROM folder_edges fe WHERE fe.folder_id = p_folder_id
  LOOP
    FOREACH v_target_user_id IN ARRAY p_target_user_ids
    LOOP
      INSERT INTO causes (id, cause_type, created_by, metadata, created_at)
      VALUES (
        gen_random_uuid(),
        'direct_share',
        p_sharer_id,
        jsonb_build_object('node_id', v_node_id, 'target_user_id', v_target_user_id, 'folder_id', p_folder_id, 'folder_share_op_id', v_folder_share_op_id, 'permission', p_permission),
        v_now
      )
      RETURNING id INTO v_cause_id;

      INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
      VALUES (gen_random_uuid(), v_node_id, v_target_user_id, v_cause_id, p_sharer_id, 'received', 1, p_permission, v_now);

      INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, permission, created_at)
      VALUES (gen_random_uuid(), v_node_id, p_sharer_id, v_cause_id, p_sharer_id, 'sent', 1, p_permission, v_now);

      -- Notification: one per target user (not per node)
      IF NOT (v_target_user_id = ANY(v_notified_users)) AND v_target_user_id != p_sharer_id THEN
        v_notified_users := array_append(v_notified_users, v_target_user_id);
        INSERT INTO notifications (id, user_id, type, payload, read, created_at)
        VALUES (
          gen_random_uuid(),
          v_target_user_id,
          'folder_share',
          jsonb_build_object('folder_id', p_folder_id, 'sender_id', p_sharer_id, 'permission', p_permission),
          false,
          v_now
        );
      END IF;
    END LOOP;

    INSERT INTO nodes_sort_cache (node_id, share_count)
    VALUES (v_node_id, 1)
    ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;
  END LOOP;

  RETURN v_folder_share_op_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ============================================================
-- F. Grant execute permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION direct_share(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION direct_share(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION group_share(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION group_share(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION share_folder(UUID, UUID, UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION share_folder(UUID, UUID, UUID[], TEXT) TO service_role;
