-- CF-02: Fix RLS policies using {public} role instead of {authenticated}
-- Affected tables: friend_invites, user_node_preferences

-- ── friend_invites ──────────────────────────────────────────
DROP POLICY IF EXISTS "friend_invites_select" ON friend_invites;
DROP POLICY IF EXISTS "friend_invites_insert" ON friend_invites;
DROP POLICY IF EXISTS "friend_invites_delete" ON friend_invites;

CREATE POLICY "friend_invites_select" ON friend_invites
  FOR SELECT TO authenticated
  USING ((from_user_id = auth.uid()) OR (to_user_id = auth.uid()));

CREATE POLICY "friend_invites_insert" ON friend_invites
  FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "friend_invites_delete" ON friend_invites
  FOR DELETE TO authenticated
  USING ((from_user_id = auth.uid()) OR (to_user_id = auth.uid()));

-- ── user_node_preferences ───────────────────────────────────
DROP POLICY IF EXISTS "unp_select_own" ON user_node_preferences;
DROP POLICY IF EXISTS "unp_insert_own" ON user_node_preferences;
DROP POLICY IF EXISTS "unp_update_own" ON user_node_preferences;
DROP POLICY IF EXISTS "unp_delete_own" ON user_node_preferences;

CREATE POLICY "unp_select_own" ON user_node_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "unp_insert_own" ON user_node_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "unp_update_own" ON user_node_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "unp_delete_own" ON user_node_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
