-- ============================================================
-- Migration 045: get_node_friend_ratings function
-- P8-T02: Friend rating breakdown in CardDetailSheet
-- Returns ratings on p_node_id by p_user_id and their friends
-- ============================================================

CREATE OR REPLACE FUNCTION get_node_friend_ratings(
  p_node_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_key TEXT,
  score NUMERIC,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.user_id,
    u.display_name,
    u.avatar_key,
    r.score,
    r.updated_at
  FROM ratings r
  JOIN users u ON u.id = r.user_id
  WHERE
    r.node_id = p_node_id
    AND (
      -- Include current user's own rating
      r.user_id = p_user_id
      OR
      -- Include ratings by friends (mutual friend_invites)
      EXISTS (
        SELECT 1 FROM friend_invites fi1
        WHERE fi1.from_user_id = p_user_id
          AND fi1.to_user_id = r.user_id
          AND fi1.to_user_id IS NOT NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM friend_invites fi2
        WHERE fi2.to_user_id = p_user_id
          AND fi2.from_user_id = r.user_id
      )
    )
  ORDER BY r.updated_at DESC;
$$;
