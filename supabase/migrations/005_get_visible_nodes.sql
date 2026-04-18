CREATE OR REPLACE FUNCTION get_visible_nodes(p_user_id UUID)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT n.*
  FROM nodes n
  WHERE n.deleted_at IS NULL
  AND (
    n.owner_id = p_user_id
    OR EXISTS (
      SELECT 1 FROM edges e
      WHERE e.node_id = n.id AND e.user_id = p_user_id
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
       OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
  )
  ORDER BY n.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_visible_node_by_id(p_user_id UUID, p_node_id UUID)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT n.*
  FROM nodes n
  WHERE n.id = p_node_id
  AND n.deleted_at IS NULL
  AND (
    n.owner_id = p_user_id
    OR EXISTS (
      SELECT 1 FROM edges e
      WHERE e.node_id = n.id AND e.user_id = p_user_id
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
       OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
  )
  LIMIT 1;
$$;
