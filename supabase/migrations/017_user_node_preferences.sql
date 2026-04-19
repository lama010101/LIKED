-- ============================================================
-- Migration 017 — user_node_preferences (P7-T02 custom sort)
-- ============================================================
-- Per-user, per-scope ordering for the Custom sort option (PRD §7.2).
--
-- scope_key is an opaque string representing the feed scope the ordering
-- applies to — e.g. 'feed:all', 'feed:mine', 'folder:<uuid>',
-- 'group:<uuid>', 'friend:<uuid>'. The client is responsible for computing
-- a stable scope_key; the server does not interpret it.
--
-- position is a small integer. Smaller = earlier in the list. Gaps are
-- allowed; the client may re-densify or leave holes.

CREATE TABLE IF NOT EXISTS user_node_preferences (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_key   TEXT NOT NULL,
  node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope_key, node_id)
);

CREATE INDEX IF NOT EXISTS user_node_preferences_lookup_idx
  ON user_node_preferences (user_id, scope_key, position);

-- Basic RLS: a user can read/write only their own preferences.
ALTER TABLE user_node_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unp_select_own ON user_node_preferences;
CREATE POLICY unp_select_own ON user_node_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS unp_insert_own ON user_node_preferences;
CREATE POLICY unp_insert_own ON user_node_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS unp_update_own ON user_node_preferences;
CREATE POLICY unp_update_own ON user_node_preferences
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS unp_delete_own ON user_node_preferences;
CREATE POLICY unp_delete_own ON user_node_preferences
  FOR DELETE USING (user_id = auth.uid());
