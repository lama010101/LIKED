-- Migration 044 — FIX-WRITE-03: Increment nodes_sort_cache.share_count on every share write
--
-- The RPCs direct_share, group_share, and share_folder create causes and edges
-- but never update nodes_sort_cache.share_count. This column is used for feed
-- sorting (sort=most_shared) and card detail meta display. It is never incremented,
-- so it reads 0 for all nodes regardless of actual share activity.
--
-- This migration adds share_count increments to all three share RPCs using the
-- UPSERT pattern for defensive correctness (handles missing nodes_sort_cache rows).

-- ============================================================
-- A. Replace direct_share
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
  -- Validate permission value for nodes
  IF p_permission NOT IN ('view', 'comment', 'edit', 'reshare') THEN
    RAISE EXCEPTION 'Invalid permission for node share: %. Must be view, comment, edit, or reshare', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: INSERT into causes with permission in metadata
  INSERT INTO causes (
    id,
    cause_type,
    created_by,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'direct_share',
    p_sharer_id,
    jsonb_build_object(
      'node_id', p_node_id,
      'target_user_id', p_target_user_id,
      'permission', p_permission
    ),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT received edge with permission
  INSERT INTO edges (
    id,
    node_id,
    user_id,
    cause_id,
    sender_id,
    direction,
    depth,
    permission,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_node_id,
    p_target_user_id,
    v_cause_id,
    p_sharer_id,
    'received',
    1,
    p_permission,
    v_now
  );

  -- Step 3: INSERT sent edge with permission
  INSERT INTO edges (
    id,
    node_id,
    user_id,
    cause_id,
    sender_id,
    direction,
    depth,
    permission,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_node_id,
    p_sharer_id,
    v_cause_id,
    p_sharer_id,
    'sent',
    1,
    p_permission,
    v_now
  );

  -- Step 4: Increment share_count
  INSERT INTO nodes_sort_cache (node_id, share_count)
  VALUES (p_node_id, 1)
  ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;

  RETURN v_cause_id;
END;
$$;

-- ============================================================
-- B. Replace group_share
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
  -- Validate permission for node shares
  IF p_permission NOT IN ('view', 'comment', 'edit', 'reshare') THEN
    RAISE EXCEPTION 'Invalid permission for group share: %. Must be view, comment, edit, or reshare', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: INSERT into causes with permission
  INSERT INTO causes (
    id,
    cause_type,
    created_by,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'group_share',
    p_sharer_id,
    jsonb_build_object(
      'node_id', p_node_id,
      'group_id', p_group_id,
      'permission', p_permission
    ),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT into group_nodes
  INSERT INTO group_nodes (
    group_id,
    node_id,
    created_at
  ) VALUES (
    p_group_id,
    p_node_id,
    v_now
  );

  -- Step 3: For each member, INSERT edge with permission
  FOR v_member_id IN
    SELECT user_id FROM group_members WHERE group_id = p_group_id
  LOOP
    INSERT INTO edges (
      id,
      node_id,
      user_id,
      cause_id,
      sender_id,
      direction,
      depth,
      permission,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_node_id,
      v_member_id,
      v_cause_id,
      p_sharer_id,
      'received',
      1,
      p_permission,
      v_now
    );
  END LOOP;

  -- Step 4: Increment share_count (one increment per node per group share event)
  INSERT INTO nodes_sort_cache (node_id, share_count)
  VALUES (p_node_id, 1)
  ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;

  RETURN v_cause_id;
END;
$$;

-- ============================================================
-- C. Replace share_folder
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
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Validate permission for folder shares
  IF p_permission NOT IN ('view', 'contribute', 'edit', 'admin') THEN
    RAISE EXCEPTION 'Invalid permission for folder share: %. Must be view, contribute, edit, or admin', p_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- Get all nodes in the folder
  FOR v_node_id IN
    SELECT fe.node_id FROM folder_edges fe WHERE fe.folder_id = p_folder_id
  LOOP
    -- For each target user
    FOREACH v_target_user_id IN ARRAY p_target_user_ids
    LOOP
      -- INSERT cause with folder info and permission
      INSERT INTO causes (
        id,
        cause_type,
        created_by,
        metadata,
        created_at
      ) VALUES (
        gen_random_uuid(),
        'direct_share',
        p_sharer_id,
        jsonb_build_object(
          'node_id', v_node_id,
          'target_user_id', v_target_user_id,
          'folder_id', p_folder_id,
          'folder_share_op_id', v_folder_share_op_id,
          'permission', p_permission
        ),
        v_now
      )
      RETURNING id INTO v_cause_id;

      -- INSERT received edge
      INSERT INTO edges (
        id,
        node_id,
        user_id,
        cause_id,
        sender_id,
        direction,
        depth,
        permission,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_node_id,
        v_target_user_id,
        v_cause_id,
        p_sharer_id,
        'received',
        1,
        p_permission,
        v_now
      );

      -- INSERT sent edge
      INSERT INTO edges (
        id,
        node_id,
        user_id,
        cause_id,
        sender_id,
        direction,
        depth,
        permission,
        created_at
      ) VALUES (
        gen_random_uuid(),
        v_node_id,
        p_sharer_id,
        v_cause_id,
        p_sharer_id,
        'sent',
        1,
        p_permission,
        v_now
      );
    END LOOP;

    -- Increment share_count (one increment per node per folder share operation)
    INSERT INTO nodes_sort_cache (node_id, share_count)
    VALUES (v_node_id, 1)
    ON CONFLICT (node_id) DO UPDATE SET share_count = nodes_sort_cache.share_count + 1;
  END LOOP;

  RETURN v_folder_share_op_id;
END;
$$;
