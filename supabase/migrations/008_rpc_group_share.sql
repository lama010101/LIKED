-- ============================================================
-- RPC Functions: Group Share Operations (P3-T04)
-- ============================================================
-- 1. group_share: Share node to group (1 cause + 1 group_node + N edges)
-- 2. group_unshare: Remove node from group (cascade deletes edges)
-- 3. create_group: Create group with members
--
-- All operations run in atomic transactions per PRD §6.3
-- ============================================================

-- ============================================================
-- Function: group_share
-- ============================================================
CREATE OR REPLACE FUNCTION group_share(
  p_sharer_id UUID,
  p_node_id UUID,
  p_group_id UUID
)
RETURNS UUID  -- Returns the created cause_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_id UUID;
  v_member_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Step 1: INSERT into causes
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
      'group_id', p_group_id
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

  -- Step 3: For each member, INSERT edge
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
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_node_id,
      v_member_id,
      v_cause_id,
      p_sharer_id,
      'received',
      1,
      v_now
    );
  END LOOP;

  RETURN v_cause_id;
END;
$$;

-- ============================================================
-- Function: group_unshare
-- ============================================================
CREATE OR REPLACE FUNCTION group_unshare(
  p_sharer_id UUID,
  p_node_id UUID,
  p_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_id UUID;
BEGIN
  -- Step 1: DELETE from group_nodes
  DELETE FROM group_nodes 
  WHERE node_id = p_node_id 
    AND group_id = p_group_id;

  -- Step 2: DELETE from causes (cascades to edges)
  -- Find and delete the matching cause
  DELETE FROM causes 
  WHERE cause_type = 'group_share'
    AND created_by = p_sharer_id
    AND metadata->>'node_id' = p_node_id::text
    AND metadata->>'group_id' = p_group_id::text
  RETURNING id INTO v_cause_id;

  IF v_cause_id IS NULL THEN
    RAISE EXCEPTION 'Group share cause not found for node % and group %', p_node_id, p_group_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN true;
END;
$$;

-- ============================================================
-- Function: create_group
-- ============================================================
CREATE OR REPLACE FUNCTION create_group(
  p_owner_id UUID,
  p_name TEXT,
  p_member_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
  v_member_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Step 1: INSERT into groups
  INSERT INTO groups (
    id,
    name,
    owner_id,
    deleted_at,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_name,
    p_owner_id,
    NULL,
    v_now
  )
  RETURNING groups.id INTO v_group_id;

  -- Step 2: INSERT owner as member
  INSERT INTO group_members (
    group_id,
    user_id
  ) VALUES (
    v_group_id,
    p_owner_id
  );

  -- Step 3: INSERT additional members
  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    -- Skip if already the owner
    IF v_member_id != p_owner_id THEN
      INSERT INTO group_members (
        group_id,
        user_id
      ) VALUES (
        v_group_id,
        v_member_id
      )
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  -- Return the created group
  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.owner_id,
    g.deleted_at,
    g.created_at
  FROM groups g
  WHERE g.id = v_group_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION group_share(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION group_share(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION group_unshare(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION group_unshare(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION create_group(UUID, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_group(UUID, TEXT, UUID[]) TO service_role;
