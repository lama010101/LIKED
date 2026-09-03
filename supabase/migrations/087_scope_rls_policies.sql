-- ============================================================
-- Migration 087 — AUDIT-06 P1-7/P2-7: Scope permissive RLS policies
-- ============================================================
-- Drops USING (true) SELECT policies on active tables and recreates
-- them scoped to ownership/membership/edge-based visibility.
--
-- Reference-data tables (tags, tag_translations, tag_edges, translations,
-- external_sources, external_items_map, ratings, nodes_sort_cache) keep
-- USING (true) for authenticated SELECT — intentional public read access
-- (documented here for clarity).
--
-- Messaging tables (direct_chats, messages, group_messages, node_messages)
-- are scoped to participant membership (defensive — currently unused by app).
-- ============================================================

-- ── users: self or friend (edge exists either direction) ──
DROP POLICY IF EXISTS "users_select_all" ON users;
CREATE POLICY "users_select_scoped" ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM edges e
      WHERE (e.user_id = auth.uid() AND e.sender_id = users.id)
         OR (e.user_id = users.id AND e.sender_id = auth.uid())
    )
  );

-- ── folder_edges: folder owner or user with share edge to folder ──
DROP POLICY IF EXISTS "folder_edges_select_authenticated" ON folder_edges;
CREATE POLICY "folder_edges_select_scoped" ON folder_edges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM folders f
      WHERE f.id = folder_edges.folder_id
        AND f.deleted_at IS NULL
        AND (
          f.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM causes c
            JOIN edges e ON e.cause_id = c.id
            WHERE c.cause_type = 'direct_share'
              AND (c.metadata->>'folder_id')::UUID = f.id
              AND e.user_id = auth.uid()
          )
        )
    )
  );

-- ── folder_tree: same scoping as folder_edges (via folder_id) ──
DROP POLICY IF EXISTS "folder_tree_select_authenticated" ON folder_tree;
CREATE POLICY "folder_tree_select_scoped" ON folder_tree
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM folders f
      WHERE f.id = folder_tree.folder_id
        AND f.deleted_at IS NULL
        AND (
          f.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM causes c
            JOIN edges e ON e.cause_id = c.id
            WHERE c.cause_type = 'direct_share'
              AND (c.metadata->>'folder_id')::UUID = f.id
              AND e.user_id = auth.uid()
          )
        )
    )
  );

-- ── folder_admins: folder owner or existing admin ──
DROP POLICY IF EXISTS "folder_admins_select_authenticated" ON folder_admins;
CREATE POLICY "folder_admins_select_scoped" ON folder_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM folders f
      WHERE f.id = folder_admins.folder_id
        AND f.owner_id = auth.uid()
    )
  );

-- ── group_nodes: group member or owner ──
DROP POLICY IF EXISTS "group_nodes_select_authenticated" ON group_nodes;
CREATE POLICY "group_nodes_select_scoped" ON group_nodes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_nodes.group_id
        AND g.deleted_at IS NULL
        AND (
          g.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = auth.uid()
          )
        )
    )
  );

-- ── group_members: member or group owner ──
DROP POLICY IF EXISTS "group_members_select_authenticated" ON group_members;
CREATE POLICY "group_members_select_scoped" ON group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.owner_id = auth.uid()
    )
  );

-- ── group_admins: admin or group owner ──
DROP POLICY IF EXISTS "group_admins_select_authenticated" ON group_admins;
CREATE POLICY "group_admins_select_scoped" ON group_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_admins.group_id
        AND g.owner_id = auth.uid()
    )
  );

-- ── Messaging tables (defensive — currently unused) ──
DROP POLICY IF EXISTS "direct_chats_select_authenticated" ON direct_chats;
CREATE POLICY "direct_chats_select_scoped" ON direct_chats
  FOR SELECT TO authenticated
  USING (user_1_id = auth.uid() OR user_2_id = auth.uid());

DROP POLICY IF EXISTS "messages_select_authenticated" ON messages;
CREATE POLICY "messages_select_scoped" ON messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM direct_chats dc
      WHERE dc.id = messages.chat_id
        AND (dc.user_1_id = auth.uid() OR dc.user_2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "group_messages_select_authenticated" ON group_messages;
CREATE POLICY "group_messages_select_scoped" ON group_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "node_messages_select_authenticated" ON node_messages;
CREATE POLICY "node_messages_select_scoped" ON node_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM edges e
      WHERE e.node_id = node_messages.node_id AND e.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM nodes n
      WHERE n.id = node_messages.node_id AND n.owner_id = auth.uid()
    )
  );

-- Note: tags, tag_translations, tag_edges, translations, external_sources,
-- external_items_map, ratings, nodes_sort_cache retain USING (true) SELECT
-- for authenticated users — intentional public read access for reference data.
