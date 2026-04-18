CREATE OR REPLACE FUNCTION get_nodes_in_folder(
  p_user_id UUID,
  p_folder_id UUID
)
RETURNS SETOF nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT n.* FROM nodes n
  JOIN folder_edges fe ON fe.node_id = n.id
  WHERE fe.folder_id = p_folder_id
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
  ORDER BY n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_nodes_in_folder(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_nodes_in_folder(UUID, UUID) TO service_role;
