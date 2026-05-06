-- ============================================================
-- FIX-RLS-01: Repair RLS policy layer
-- Drop permissive policies, enforce service-role-only writes
-- ============================================================

-- ============================================================
-- A. Drop all permissive policies from 002_rls.sql
-- ============================================================

DROP POLICY IF EXISTS "users_read_all" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;

DROP POLICY IF EXISTS "nodes_all" ON nodes;

DROP POLICY IF EXISTS "causes_all" ON causes;

DROP POLICY IF EXISTS "edges_all" ON edges;

DROP POLICY IF EXISTS "ratings_all" ON ratings;

DROP POLICY IF EXISTS "nodes_sort_cache_all" ON nodes_sort_cache;

DROP POLICY IF EXISTS "groups_all" ON groups;

DROP POLICY IF EXISTS "group_nodes_all" ON group_nodes;

DROP POLICY IF EXISTS "group_members_all" ON group_members;

DROP POLICY IF EXISTS "group_admins_all" ON group_admins;

DROP POLICY IF EXISTS "folders_all" ON folders;

DROP POLICY IF EXISTS "folder_edges_all" ON folder_edges;

DROP POLICY IF EXISTS "folder_tree_all" ON folder_tree;

DROP POLICY IF EXISTS "folder_admins_all" ON folder_admins;

DROP POLICY IF EXISTS "tags_all" ON tags;

DROP POLICY IF EXISTS "tag_translations_all" ON tag_translations;

DROP POLICY IF EXISTS "tag_edges_all" ON tag_edges;

DROP POLICY IF EXISTS "translations_all" ON translations;

DROP POLICY IF EXISTS "blocks_all" ON blocks;

DROP POLICY IF EXISTS "external_sources_all" ON external_sources;

DROP POLICY IF EXISTS "external_items_map_all" ON external_items_map;

DROP POLICY IF EXISTS "notifications_read_own" ON notifications;
DROP POLICY IF EXISTS "notifications_insert_all" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;

DROP POLICY IF EXISTS "activity_log_read_own" ON activity_log;
DROP POLICY IF EXISTS "activity_log_insert_all" ON activity_log;

DROP POLICY IF EXISTS "direct_chats_all" ON direct_chats;

DROP POLICY IF EXISTS "messages_all" ON messages;

DROP POLICY IF EXISTS "group_messages_all" ON group_messages;

DROP POLICY IF EXISTS "node_messages_all" ON node_messages;

-- ============================================================
-- B. Drop write policies on causes and edges from 037
-- ============================================================

DROP POLICY IF EXISTS "causes_insert_policy" ON causes;
DROP POLICY IF EXISTS "causes_delete_policy" ON causes;

DROP POLICY IF EXISTS "edges_insert_policy" ON edges;
DROP POLICY IF EXISTS "edges_delete_policy" ON edges;

-- ============================================================
-- C. Drop node write policies left over from 009_rls_tighten.sql
-- (033_drop_duplicate_rls.sql dropped nodes_select_policy and
-- nodes_update_policy but missed insert/delete)
-- ============================================================

DROP POLICY IF EXISTS "nodes_insert_policy" ON nodes;
DROP POLICY IF EXISTS "nodes_delete_policy" ON nodes;

-- ============================================================
-- D. Fix folders_select_accessible to exclude soft-deleted folders
-- ============================================================

DROP POLICY IF EXISTS "folders_select_accessible" ON folders;

CREATE POLICY "folders_select_accessible" ON folders
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM folder_edges fe
      JOIN edges e ON e.node_id = fe.node_id AND e.user_id = auth.uid()
      WHERE fe.folder_id = folders.id
    )
  )
);

-- ============================================================
-- POST-MIGRATION RLS STATE (critical tables only)
-- ============================================================
-- nodes:    SELECT = nodes_select_visible (owner OR edge, deleted_at IS NULL, not blocked)
--           | INSERT/UPDATE/DELETE = service role only (nodes_insert_policy and nodes_delete_policy dropped;
--             nodes_update from 010 remains as out-of-scope)
-- edges:    SELECT = edges_select_policy (user_id OR sender_id = auth.uid())
--           | INSERT/UPDATE/DELETE = service role only (edges_insert_policy, edges_update_policy, edges_delete_policy from 009)
-- causes:   SELECT = causes_select_policy (created_by = auth.uid())
--           | INSERT/UPDATE/DELETE = service role only (causes_insert_policy, causes_update_policy, causes_delete_policy from 009)
-- folders:  SELECT = folders_select_accessible (owner OR edge access, deleted_at IS NULL)
--           | INSERT/UPDATE/DELETE = service role only (folders_update from 010 remains as out-of-scope)
-- users:    SELECT = users_select_all (authenticated) | UPDATE = users_update_own (id = auth.uid())
-- ratings:  SELECT = ratings_select_authenticated | INSERT/UPDATE/DELETE = service role only
-- blocks:   SELECT = blocks_select_own (blocker_id = auth.uid()) | INSERT = blocks_insert_own | DELETE = blocks_delete_own
