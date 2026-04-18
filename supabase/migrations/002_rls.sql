-- ============================================================
-- Row Level Security (RLS) - Permissive Policies
-- Temporary permissive policies for initial setup
-- Will be tightened in P1-T03/P3-T05
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE causes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes_sort_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_tree ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_items_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Permissive Policies (Temporary - to be tightened in P3-T05)
-- These allow all operations for authenticated users during development
-- ============================================================

-- Users: allow authenticated to read all, update own
CREATE POLICY "users_read_all" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Nodes: allow authenticated full access (temporary permissive)
CREATE POLICY "nodes_all" ON nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Causes: allow authenticated full access (temporary permissive)
CREATE POLICY "causes_all" ON causes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Edges: allow authenticated full access (temporary permissive)
-- Note: In P3-T05, this will be restricted to service role only for writes
CREATE POLICY "edges_all" ON edges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ratings: allow authenticated full access (temporary permissive)
CREATE POLICY "ratings_all" ON ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Nodes sort cache: allow authenticated full access (temporary permissive)
CREATE POLICY "nodes_sort_cache_all" ON nodes_sort_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Groups: allow authenticated full access (temporary permissive)
CREATE POLICY "groups_all" ON groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Group nodes: allow authenticated full access (temporary permissive)
CREATE POLICY "group_nodes_all" ON group_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Group members: allow authenticated full access (temporary permissive)
CREATE POLICY "group_members_all" ON group_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Group admins: allow authenticated full access (temporary permissive)
CREATE POLICY "group_admins_all" ON group_admins FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Folders: allow authenticated full access (temporary permissive)
CREATE POLICY "folders_all" ON folders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Folder edges: allow authenticated full access (temporary permissive)
CREATE POLICY "folder_edges_all" ON folder_edges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Folder tree: allow authenticated full access (temporary permissive)
CREATE POLICY "folder_tree_all" ON folder_tree FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Folder admins: allow authenticated full access (temporary permissive)
CREATE POLICY "folder_admins_all" ON folder_admins FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tags: allow authenticated full access (temporary permissive)
CREATE POLICY "tags_all" ON tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tag translations: allow authenticated full access (temporary permissive)
CREATE POLICY "tag_translations_all" ON tag_translations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Tag edges: allow authenticated full access (temporary permissive)
CREATE POLICY "tag_edges_all" ON tag_edges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Translations: allow authenticated full access (temporary permissive)
CREATE POLICY "translations_all" ON translations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Blocks: allow authenticated full access (temporary permissive)
CREATE POLICY "blocks_all" ON blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- External sources: allow authenticated full access (temporary permissive)
CREATE POLICY "external_sources_all" ON external_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- External items map: allow authenticated full access (temporary permissive)
CREATE POLICY "external_items_map_all" ON external_items_map FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notifications: allow authenticated read own, insert all (temporary permissive)
CREATE POLICY "notifications_read_own" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert_all" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Activity log: allow authenticated read own, insert all (temporary permissive)
CREATE POLICY "activity_log_read_own" ON activity_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "activity_log_insert_all" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- Direct chats: allow authenticated full access (temporary permissive)
CREATE POLICY "direct_chats_all" ON direct_chats FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Messages: allow authenticated full access (temporary permissive)
CREATE POLICY "messages_all" ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Group messages: allow authenticated full access (temporary permissive)
CREATE POLICY "group_messages_all" ON group_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Node messages: allow authenticated full access (temporary permissive)
CREATE POLICY "node_messages_all" ON node_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
