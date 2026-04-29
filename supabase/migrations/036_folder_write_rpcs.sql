-- Migration 036 — Folder write RPCs (FIX-H5)
-- Replaces direct PostgREST writes in lib/db/folders.ts with SECURITY DEFINER RPCs.

-- ============================================================
-- add_node_to_folder
-- Inserts a row into folder_edges. ON CONFLICT DO NOTHING (idempotent).
-- ============================================================
CREATE OR REPLACE FUNCTION add_node_to_folder(
  p_node_id   UUID,
  p_folder_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO folder_edges (node_id, folder_id)
  VALUES (p_node_id, p_folder_id)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION add_node_to_folder(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_node_to_folder(UUID, UUID) TO service_role;

-- ============================================================
-- remove_node_from_folder
-- Deletes the folder_edges row for (node_id, folder_id).
-- ============================================================
CREATE OR REPLACE FUNCTION remove_node_from_folder(
  p_node_id   UUID,
  p_folder_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM folder_edges
  WHERE node_id = p_node_id
    AND folder_id = p_folder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_node_from_folder(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_node_from_folder(UUID, UUID) TO service_role;

-- ============================================================
-- delete_folder
-- Soft-deletes a folder by setting deleted_at = now().
-- Preserves all folder_edges, causes, and edges (invariant I-17).
-- ============================================================
CREATE OR REPLACE FUNCTION delete_folder(
  p_folder_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE folders
  SET deleted_at = now()
  WHERE id = p_folder_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_folder(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_folder(UUID) TO service_role;

-- ============================================================
-- move_folder
-- Updates parent_folder_id. Sets is_project = TRUE when new parent is NULL,
-- FALSE otherwise (PRD §4.1 is_project rule).
-- ============================================================
CREATE OR REPLACE FUNCTION move_folder(
  p_folder_id        UUID,
  p_new_parent_id    UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE folders
  SET
    parent_folder_id = p_new_parent_id,
    is_project       = (p_new_parent_id IS NULL)
  WHERE id = p_folder_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION move_folder(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION move_folder(UUID, UUID) TO service_role;
