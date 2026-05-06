-- Migration 040: Fix move_folder to include cycle check and folder_tree rebuild
-- Fixes AUDIT-01/M2: move_folder previously only updated folders.parent_folder_id
-- without touching folder_tree, causing stale ancestry data and allowing cycles

CREATE OR REPLACE FUNCTION public.move_folder(p_folder_id uuid, p_new_parent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Verify caller owns the folder
  IF NOT EXISTS (
    SELECT 1 FROM folders
    WHERE id = p_folder_id
      AND owner_id = auth.uid()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Folder not found or not owned by caller';
  END IF;

  -- 2. Cycle check: p_new_parent_id must not be a descendant of p_folder_id
  -- (also blocks moving a folder under itself)
  IF p_new_parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM folder_tree
    WHERE ancestor_id = p_folder_id
      AND folder_id = p_new_parent_id
  ) THEN
    RAISE EXCEPTION 'Cannot move folder: would create a cycle';
  END IF;

  -- 3. Update the folder row
  UPDATE folders
  SET
    parent_folder_id = p_new_parent_id,
    is_project = (p_new_parent_id IS NULL)
  WHERE id = p_folder_id;

  -- 4. Rebuild folder_tree for p_folder_id and all its descendants
  -- Step 4a: delete all existing non-self folder_tree rows for the subtree
  DELETE FROM folder_tree
  WHERE folder_id IN (
    SELECT folder_id FROM folder_tree WHERE ancestor_id = p_folder_id
  )
  AND ancestor_id != folder_id;

  -- Step 4b: re-insert ancestor rows for each node in the subtree
  -- For each descendant D of p_folder_id (including itself):
  --   insert (D, A, depth_from_new_parent + depth_D_from_p_folder_id)
  --   for each ancestor A of p_new_parent_id (including itself)
  IF p_new_parent_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT
      subtree.folder_id,
      new_ancestors.ancestor_id,
      new_ancestors.depth + 1 + subtree.depth
    FROM
      (SELECT folder_id, depth FROM folder_tree WHERE ancestor_id = p_folder_id) AS subtree,
      (SELECT ancestor_id, depth FROM folder_tree WHERE folder_id = p_new_parent_id) AS new_ancestors;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_folder(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_folder(uuid, uuid) TO service_role;
