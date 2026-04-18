-- ============================================================
-- Tight Row Level Security Policies
-- Replaces permissive policies from 002_rls.sql
-- ============================================================

-- ============================================================
-- NODES
-- Visibility = edge existence only (PRD §5)
-- This policy MUST match lib/db/visibility.ts exactly
-- ============================================================
CREATE POLICY "nodes_select_visible"
  ON nodes
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM edges e
        WHERE e.node_id = nodes.id
          AND e.user_id = auth.uid()
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = nodes.owner_id)
         OR (b.blocker_id = nodes.owner_id AND b.blocked_id = auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- EDGES
-- ============================================================
CREATE POLICY "edges_select_own"
  ON edges
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR sender_id = auth.uid()
  );

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- CAUSES
-- ============================================================
CREATE POLICY "causes_select_own"
  ON causes
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY "users_select_all"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users_update_own"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- No INSERT/DELETE policies = service role only

-- ============================================================
-- RATINGS
-- ============================================================
CREATE POLICY "ratings_select_authenticated"
  ON ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- NODES SORT CACHE
-- ============================================================
CREATE POLICY "nodes_sort_cache_select_authenticated"
  ON nodes_sort_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- FOLDERS
-- Folder visibility = owner OR has edge through folder_edges → node → edge
-- ============================================================
CREATE POLICY "folders_select_accessible"
  ON folders
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      -- User has an edge to at least one node in this folder
      SELECT 1 FROM folder_edges fe
      JOIN edges e ON e.node_id = fe.node_id AND e.user_id = auth.uid()
      WHERE fe.folder_id = folders.id
    )
  );

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- FOLDER_EDGES
-- ============================================================
CREATE POLICY "folder_edges_select_authenticated"
  ON folder_edges
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- FOLDER_TREE
-- ============================================================
CREATE POLICY "folder_tree_select_authenticated"
  ON folder_tree
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- FOLDER_ADMINS
-- ============================================================
CREATE POLICY "folder_admins_select_authenticated"
  ON folder_admins
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- GROUPS
-- ============================================================
CREATE POLICY "groups_select_member"
  ON groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- GROUP_NODES
-- ============================================================
CREATE POLICY "group_nodes_select_authenticated"
  ON group_nodes
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- GROUP_MEMBERS
-- ============================================================
CREATE POLICY "group_members_select_authenticated"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- GROUP_ADMINS
-- ============================================================
CREATE POLICY "group_admins_select_authenticated"
  ON group_admins
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY "notifications_select_own"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- ACTIVITY_LOG
-- ============================================================
CREATE POLICY "activity_log_select_own"
  ON activity_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- BLOCKS
-- ============================================================
CREATE POLICY "blocks_select_own"
  ON blocks
  FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

CREATE POLICY "blocks_insert_own"
  ON blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "blocks_delete_own"
  ON blocks
  FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- No UPDATE policy = service role only

-- ============================================================
-- TAGS
-- ============================================================
CREATE POLICY "tags_select_authenticated"
  ON tags
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- TAG_TRANSLATIONS
-- ============================================================
CREATE POLICY "tag_translations_select_authenticated"
  ON tag_translations
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- TAG_EDGES
-- ============================================================
CREATE POLICY "tag_edges_select_authenticated"
  ON tag_edges
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- TRANSLATIONS
-- ============================================================
CREATE POLICY "translations_select_authenticated"
  ON translations
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- EXTERNAL_SOURCES
-- ============================================================
CREATE POLICY "external_sources_select_authenticated"
  ON external_sources
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- EXTERNAL_ITEMS_MAP
-- ============================================================
CREATE POLICY "external_items_map_select_authenticated"
  ON external_items_map
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- DIRECT_CHATS
-- ============================================================
CREATE POLICY "direct_chats_select_authenticated"
  ON direct_chats
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY "messages_select_authenticated"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- GROUP_MESSAGES
-- ============================================================
CREATE POLICY "group_messages_select_authenticated"
  ON group_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only

-- ============================================================
-- NODE_MESSAGES
-- ============================================================
CREATE POLICY "node_messages_select_authenticated"
  ON node_messages
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies = service role only
