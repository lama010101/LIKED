-- ============================================================
-- RLS Policy Tightening (P3-T05)
-- ============================================================
-- Drop and recreate policies with stricter rules
-- ============================================================

-- ============================================================
-- nodes table policies
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "nodes_select_policy" ON nodes;
DROP POLICY IF EXISTS "nodes_insert_policy" ON nodes;
DROP POLICY IF EXISTS "nodes_update_policy" ON nodes;
DROP POLICY IF EXISTS "nodes_delete_policy" ON nodes;

-- SELECT: Owner OR has edge, not blocked, not deleted
CREATE POLICY "nodes_select_policy" ON nodes
  FOR SELECT
  TO authenticated
  USING (
    (
      auth.uid() = owner_id
      OR EXISTS (
        SELECT 1 FROM edges e 
        WHERE e.node_id = nodes.id 
          AND e.user_id = auth.uid()
      )
    )
    AND deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM blocks b 
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = nodes.owner_id)
         OR (b.blocker_id = nodes.owner_id AND b.blocked_id = auth.uid())
    )
  );

-- INSERT: Must be owner AND origin_user
CREATE POLICY "nodes_insert_policy" ON nodes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = owner_id 
    AND auth.uid() = origin_user_id
  );

-- UPDATE: Owner only, cannot change origin fields
CREATE POLICY "nodes_update_policy" ON nodes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND origin_user_id = nodes.origin_user_id  -- Prevent changing origin
    AND origin_created_at = nodes.origin_created_at
  );

-- DELETE: Owner only (soft delete)
CREATE POLICY "nodes_delete_policy" ON nodes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- ============================================================
-- edges table policies
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "edges_select_policy" ON edges;
DROP POLICY IF EXISTS "edges_insert_policy" ON edges;
DROP POLICY IF EXISTS "edges_update_policy" ON edges;
DROP POLICY IF EXISTS "edges_delete_policy" ON edges;

-- SELECT: User can see their own edges (as recipient or sender)
CREATE POLICY "edges_select_policy" ON edges
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR sender_id = auth.uid()
  );

-- INSERT: Service role only (edges created via RPC)
CREATE POLICY "edges_insert_policy" ON edges
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: Service role only
CREATE POLICY "edges_update_policy" ON edges
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: Service role only (deletion via cause cascade)
CREATE POLICY "edges_delete_policy" ON edges
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- causes table policies
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "causes_select_policy" ON causes;
DROP POLICY IF EXISTS "causes_insert_policy" ON causes;
DROP POLICY IF EXISTS "causes_update_policy" ON causes;
DROP POLICY IF EXISTS "causes_delete_policy" ON causes;

-- SELECT: Creator only
CREATE POLICY "causes_select_policy" ON causes
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- INSERT: Service role only (created via RPC)
CREATE POLICY "causes_insert_policy" ON causes
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- UPDATE: Service role only
CREATE POLICY "causes_update_policy" ON causes
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE: Service role only (deletion via RPC)
CREATE POLICY "causes_delete_policy" ON causes
  FOR DELETE
  TO service_role
  USING (true);
