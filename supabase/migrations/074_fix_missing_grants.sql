-- ============================================================
-- Migration 074 — AUDIT-03: Fix missing GRANT EXECUTE + SECURITY DEFINER
-- ============================================================
--
-- Four functions were created with SECURITY DEFINER (or without it)
-- but never granted EXECUTE to the authenticated/service_role roles.
-- This means RLS-authorized callers cannot invoke them.
--
-- Functions fixed:
--   1. get_visible_node_by_id(UUID, UUID) — SECURITY DEFINER, no GRANT
--   2. get_friend_bar(UUID) — SECURITY DEFINER, no GRANT
--   3. create_user_profile(UUID, TEXT, TEXT) — no SECURITY DEFINER, no GRANT
--   4. get_node_friend_ratings(UUID, UUID) — SECURITY DEFINER, no GRANT
--
-- Note: get_visible_nodes was already granted in migration 048.

-- 1. get_visible_node_by_id — already SECURITY DEFINER from migration 005
GRANT EXECUTE ON FUNCTION get_visible_node_by_id(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_visible_node_by_id(UUID, UUID) TO service_role;

-- 2. get_friend_bar — already SECURITY DEFINER from migration 011
GRANT EXECUTE ON FUNCTION get_friend_bar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_friend_bar(UUID) TO service_role;

-- 3. create_user_profile — needs SECURITY DEFINER (inserts into users + activity_log)
ALTER FUNCTION create_user_profile(UUID, TEXT, TEXT) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION create_user_profile(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile(UUID, TEXT, TEXT) TO service_role;

-- 4. get_node_friend_ratings — already SECURITY DEFINER from migration 045
GRANT EXECUTE ON FUNCTION get_node_friend_ratings(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_node_friend_ratings(UUID, UUID) TO service_role;
