-- ============================================================
-- Migration: Unified Permissions + Projects Naming (P13-T01)
-- ============================================================
-- Part A: Schema Migration
-- Part B-D: Permission system foundation
-- Part E: Projects naming (folders.is_project)
-- ============================================================

-- ============================================================
-- A1. Extend edges.permission enum
-- ============================================================

-- Add permission column to edges table
ALTER TABLE edges
  ADD COLUMN permission TEXT NOT NULL DEFAULT 'view'
  CHECK (permission IN ('view', 'comment', 'contribute', 'edit', 'reshare', 'admin'));

-- Add index for efficient permission lookups
CREATE INDEX edges_permission_idx ON edges(node_id, user_id, permission);

-- ============================================================
-- A2. Drop folder_admins and group_admins tables
-- ============================================================

-- Note: Their RLS policies will also be dropped automatically
DROP TABLE IF EXISTS folder_admins CASCADE;
DROP TABLE IF EXISTS group_admins CASCADE;

-- ============================================================
-- A3. Add folders.is_project BOOLEAN
-- ============================================================

-- Add is_project column
ALTER TABLE folders
  ADD COLUMN is_project BOOLEAN NOT NULL DEFAULT FALSE;

-- Add CHECK constraint: is_project only allowed when parent_folder_id IS NULL
ALTER TABLE folders
  ADD CONSTRAINT chk_folder_is_project_root_only
  CHECK (NOT (is_project = TRUE AND parent_folder_id IS NOT NULL));

-- Index for efficient filtering
CREATE INDEX folders_is_project_idx ON folders(is_project);
CREATE INDEX folders_owner_is_project_idx ON folders(owner_id, is_project);

-- ============================================================
-- A4. Backfill data
-- ============================================================

-- All existing edges get 'view' permission (already set by DEFAULT)
UPDATE edges SET permission = 'view' WHERE permission IS NULL;

-- All root-level folders become projects
UPDATE folders SET is_project = TRUE WHERE parent_folder_id IS NULL;

-- ============================================================
-- B & C. Update RPC Functions with Permission Support
-- ============================================================

-- Update direct_share function to include permission parameter
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

  RETURN v_cause_id;
END;
$$;

-- Update group_share function to include permission
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

  RETURN v_cause_id;
END;
$$;

-- Function: share_folder (create folder share with permission)
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
  END LOOP;

  RETURN v_folder_share_op_id;
END;
$$;

-- Function: change_node_permission
CREATE OR REPLACE FUNCTION change_node_permission(
  p_cause_id UUID,
  p_requesting_user_id UUID,
  p_new_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_created_by UUID;
BEGIN
  -- Verify requesting user is the cause creator
  SELECT created_by INTO v_cause_created_by
  FROM causes
  WHERE id = p_cause_id;

  IF v_cause_created_by IS NULL THEN
    RAISE EXCEPTION 'Cause not found: %', p_cause_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_cause_created_by != p_requesting_user_id THEN
    RAISE EXCEPTION 'Unauthorized: only the original sharer can change permission'
      USING ERRCODE = 'P0001';
  END IF;

  -- Update edges.permission for both edges
  UPDATE edges
  SET permission = p_new_permission
  WHERE cause_id = p_cause_id;

  -- Update causes.metadata.permission
  UPDATE causes
  SET metadata = metadata || jsonb_build_object('permission', p_new_permission)
  WHERE id = p_cause_id;

  RETURN true;
END;
$$;

-- Function: change_folder_permission
CREATE OR REPLACE FUNCTION change_folder_permission(
  p_folder_id UUID,
  p_target_user_id UUID,
  p_requesting_user_id UUID,
  p_new_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_folder_owner_id UUID;
  v_cause_id UUID;
  v_cause_ids UUID[];
BEGIN
  -- Check if requesting user is folder owner or has admin permission
  SELECT owner_id INTO v_folder_owner_id
  FROM folders
  WHERE id = p_folder_id;

  IF v_folder_owner_id IS NULL THEN
    RAISE EXCEPTION 'Folder not found: %', p_folder_id
      USING ERRCODE = 'P0001';
  END IF;

  -- TODO: Check for admin permission via edges when hasFolderPermission is implemented
  -- For now, only owner can change permissions
  IF v_folder_owner_id != p_requesting_user_id THEN
    RAISE EXCEPTION 'Unauthorized: only folder owner can change permissions'
      USING ERRCODE = 'P0001';
  END IF;

  -- Find all causes for this folder and target user
  SELECT array_agg(DISTINCT c.id) INTO v_cause_ids
  FROM causes c
  WHERE c.metadata->>'folder_id' = p_folder_id::text
    AND c.metadata->>'target_user_id' = p_target_user_id::text;

  IF v_cause_ids IS NULL OR array_length(v_cause_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No share found for user % in folder %', p_target_user_id, p_folder_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Update all edges for these causes
  UPDATE edges
  SET permission = p_new_permission
  WHERE cause_id = ANY(v_cause_ids);

  -- Update all causes metadata
  UPDATE causes
  SET metadata = metadata || jsonb_build_object('permission', p_new_permission)
  WHERE id = ANY(v_cause_ids);

  RETURN true;
END;
$$;

-- Function: create_folder with is_project logic
CREATE OR REPLACE FUNCTION create_folder(
  p_owner_id UUID,
  p_name TEXT,
  p_parent_folder_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_id UUID,
  parent_folder_id UUID,
  is_project BOOLEAN,
  color_hex TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_folder_id UUID;
  v_is_project BOOLEAN;
  v_color_hex TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Determine is_project: true if no parent
  v_is_project := (p_parent_folder_id IS NULL);

  -- Assign color from palette (use position based on owner_id for determinism)
  SELECT color_hex INTO v_color_hex
  FROM (
    SELECT '#D85A30' as color_hex UNION ALL  -- 1. Primary/Brand
    SELECT '#E8B34B' UNION ALL               -- 2. Amber
    SELECT '#4A9FD4' UNION ALL               -- 3. Blue
    SELECT '#5FB878' UNION ALL               -- 4. Green
    SELECT '#9B6ED5' UNION ALL               -- 5. Purple
    SELECT '#E07A8A' UNION ALL               -- 6. Pink
    SELECT '#6BBAA4' UNION ALL               -- 7. Teal
    SELECT '#F2C94C' UNION ALL               -- 8. Yellow
    SELECT '#56CCF2' UNION ALL               -- 9. Cyan
    SELECT '#EB5757' UNION ALL               -- 10. Red
    SELECT '#27AE60' UNION ALL               -- 11. Forest
    SELECT '#2D9CDB' UNION ALL               -- 12. Sky
    SELECT '#9B51E0' UNION ALL               -- 13. Violet
    SELECT '#F2994A' UNION ALL               -- 14. Orange
    SELECT '#BDBDBD' UNION ALL               -- 15. Gray
    SELECT '#6FCF97' UNION ALL               -- 16. Mint
    SELECT '#2F80ED' UNION ALL               -- 17. Royal Blue
    SELECT '#F9AFAE' UNION ALL               -- 18. Light Pink
    SELECT '#4F4F4F' UNION ALL               -- 19. Charcoal
    SELECT '#8E44AD'                       -- 20. Deep Purple
  ) palette
  ORDER BY random()
  LIMIT 1;

  -- INSERT folder
  INSERT INTO folders (
    id,
    name,
    owner_id,
    parent_folder_id,
    is_project,
    color_hex,
    deleted_at,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_name,
    p_owner_id,
    p_parent_folder_id,
    v_is_project,
    v_color_hex,
    NULL,
    v_now
  )
  RETURNING folders.id INTO v_folder_id;

  -- INSERT folder_tree self-reference
  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  -- INSERT folder_tree ancestor references
  IF p_parent_folder_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT v_folder_id, ancestor_id, depth + 1
    FROM folder_tree
    WHERE folder_id = p_parent_folder_id;
  END IF;

  -- Return the created folder
  RETURN QUERY
  SELECT 
    f.id,
    f.name,
    f.owner_id,
    f.parent_folder_id,
    f.is_project,
    f.color_hex,
    f.deleted_at,
    f.created_at
  FROM folders f
  WHERE f.id = v_folder_id;
END;
$$;

-- ============================================================
-- Permission Check Functions (for use in other RPC functions)
-- ============================================================

-- Function: get_node_permission
-- Returns the highest permission level for a user on a node
CREATE OR REPLACE FUNCTION get_node_permission(
  p_user_id UUID,
  p_node_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_permission TEXT;
BEGIN
  -- Check if user is owner
  SELECT owner_id INTO v_owner_id
  FROM nodes
  WHERE id = p_node_id;

  IF v_owner_id = p_user_id THEN
    RETURN 'admin'; -- Owner has implicit admin
  END IF;

  -- Get max permission from edges
  SELECT MAX(permission) INTO v_permission
  FROM edges
  WHERE node_id = p_node_id
    AND user_id = p_user_id;

  RETURN v_permission;
END;
$$;

-- Function: get_folder_permission
-- Returns the highest permission level for a user on a folder
CREATE OR REPLACE FUNCTION get_folder_permission(
  p_user_id UUID,
  p_folder_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_permission TEXT;
BEGIN
  -- Check if user is owner
  SELECT owner_id INTO v_owner_id
  FROM folders
  WHERE id = p_folder_id;

  IF v_owner_id = p_user_id THEN
    RETURN 'admin'; -- Owner has implicit admin
  END IF;

  -- Get max permission from edges on nodes in this folder
  SELECT MAX(e.permission) INTO v_permission
  FROM edges e
  JOIN causes c ON e.cause_id = c.id
  WHERE c.metadata->>'folder_id' = p_folder_id::text
    AND e.user_id = p_user_id;

  RETURN v_permission;
END;
$$;

-- Function: has_node_permission
-- Returns true if user has at least the required permission on node
CREATE OR REPLACE FUNCTION has_node_permission(
  p_user_id UUID,
  p_node_id UUID,
  p_required_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permission_rank INT;
  v_required_rank INT;
  v_user_permission TEXT;
BEGIN
  -- Permission ranks
  v_required_rank := CASE p_required_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  v_user_permission := get_node_permission(p_user_id, p_node_id);

  IF v_user_permission IS NULL THEN
    RETURN false;
  END IF;

  v_permission_rank := CASE v_user_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  RETURN v_permission_rank >= v_required_rank;
END;
$$;

-- Function: has_folder_permission
-- Returns true if user has at least the required permission on folder
CREATE OR REPLACE FUNCTION has_folder_permission(
  p_user_id UUID,
  p_folder_id UUID,
  p_required_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permission_rank INT;
  v_required_rank INT;
  v_user_permission TEXT;
BEGIN
  -- Permission ranks
  v_required_rank := CASE p_required_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  v_user_permission := get_folder_permission(p_user_id, p_folder_id);

  IF v_user_permission IS NULL THEN
    RETURN false;
  END IF;

  v_permission_rank := CASE v_user_permission
    WHEN 'view' THEN 1
    WHEN 'comment' THEN 2
    WHEN 'contribute' THEN 3
    WHEN 'edit' THEN 4
    WHEN 'reshare' THEN 5
    WHEN 'admin' THEN 6
    ELSE 0
  END;

  RETURN v_permission_rank >= v_required_rank;
END;
$$;

-- ============================================================
-- D. Updated RLS Policies
-- ============================================================

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "nodes_update" ON nodes;
DROP POLICY IF EXISTS "folders_update" ON folders;

-- New nodes UPDATE policy with permission check
CREATE POLICY "nodes_update" ON nodes
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM edges
      WHERE node_id = nodes.id
        AND user_id = auth.uid()
        AND permission IN ('edit', 'reshare', 'admin')
    )
  );

-- New folders UPDATE policy with permission check
CREATE POLICY "folders_update" ON folders
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM edges e
      JOIN causes c ON e.cause_id = c.id
      WHERE c.metadata->>'folder_id' = folders.id::text
        AND e.user_id = auth.uid()
        AND e.permission IN ('edit', 'admin')
    )
  );

-- ============================================================
-- Grant permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION direct_share(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION direct_share(UUID, UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION group_share(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION group_share(UUID, UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION share_folder(UUID, UUID, UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION share_folder(UUID, UUID, UUID[], TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION change_node_permission(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION change_node_permission(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION change_folder_permission(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION change_folder_permission(UUID, UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION get_node_permission(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_node_permission(UUID, UUID) TO service_role;

GRANT EXECUTE ON FUNCTION get_folder_permission(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_folder_permission(UUID, UUID) TO service_role;

GRANT EXECUTE ON FUNCTION has_node_permission(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_node_permission(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION has_folder_permission(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_folder_permission(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION create_folder(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_folder(UUID, TEXT, UUID) TO service_role;
