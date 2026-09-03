-- ============================================================
-- Migration 090 — AUDIT-06 P2-13: hard_delete_node RPC
-- ============================================================
-- Replaces the two-step fetch-then-delete in lib/db/nodes.ts:hardDeleteNode
-- which checked owner_id/deleted_at in one query then deleted in another
-- (permission/row state could change between calls).
--
-- Single function: verify ownership + soft-deleted status, then DELETE
-- (cascades via FKs). Raises if not owner or not soft-deleted.
-- ============================================================

CREATE OR REPLACE FUNCTION hard_delete_node(
  p_node_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_deleted TIMESTAMPTZ;
BEGIN
  SELECT owner_id, deleted_at INTO v_owner, v_deleted
  FROM nodes
  WHERE id = p_node_id
  FOR UPDATE;  -- lock row to prevent concurrent changes

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Node not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner != p_user_id THEN
    RAISE EXCEPTION 'Not authorized: only the owner can hard-delete'
      USING ERRCODE = 'P0003';
  END IF;

  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'Node must be soft-deleted before hard-delete'
      USING ERRCODE = 'P0004';
  END IF;

  DELETE FROM nodes WHERE id = p_node_id;
END;
$$;

GRANT EXECUTE ON FUNCTION hard_delete_node(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_node(UUID, UUID) TO service_role;
