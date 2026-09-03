-- ============================================================
-- Migration 081 — AUDIT-06 P1-4/P1-5/P2-9: Atomic folder RPCs
-- ============================================================
-- New SECURITY DEFINER RPCs that perform folder writes in a single
-- Postgres transaction (function body = implicit transaction).
--
-- Replaces the non-atomic TypeScript patterns:
--   - getOrCreateUnsortedFolder (folders insert + folder_tree insert)
--   - getOrCreateYouTubeFolder  (same pattern)
--   - dndMoveNodeToFolder       (add then remove, not atomic)
--   - dndAutoCreateFolder       (create then loop-add, not atomic)
--
-- All functions use SET search_path for SECURITY DEFINER safety.
-- ============================================================

-- ── get_or_create_unsorted_folder ───────────────────────────
-- Idempotent: returns existing "Unsorted" folder id or creates one.
-- Single transaction: folders + folder_tree self-row.
CREATE OR REPLACE FUNCTION get_or_create_unsorted_folder(
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_id UUID;
  v_folder_count BIGINT;
  v_color TEXT;
BEGIN
  -- Check for existing Unsorted folder
  SELECT id INTO v_folder_id
  FROM folders
  WHERE owner_id = p_user_id
    AND name = 'Unsorted'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_folder_id IS NOT NULL THEN
    RETURN v_folder_id;
  END IF;

  -- Create with deterministic color
  SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
  v_color := liked_tag_palette(v_folder_count::INT);

  INSERT INTO folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), 'Unsorted', p_user_id, NULL, TRUE, v_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  -- folder_tree self-reference
  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  RETURN v_folder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_unsorted_folder(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_unsorted_folder(UUID) TO service_role;

-- ── get_or_create_named_folder ───────────────────────────────
-- Generic version: get or create a named top-level folder for a user.
-- Used for the "YouTube" auto-folder and any future auto-folder.
CREATE OR REPLACE FUNCTION get_or_create_named_folder(
  p_user_id UUID,
  p_name TEXT,
  p_color TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_id UUID;
  v_folder_count BIGINT;
  v_resolved_color TEXT;
BEGIN
  SELECT id INTO v_folder_id
  FROM folders
  WHERE owner_id = p_user_id
    AND name = p_name
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_folder_id IS NOT NULL THEN
    RETURN v_folder_id;
  END IF;

  -- Deterministic color: explicit override or palette cycle
  IF p_color IS NOT NULL THEN
    v_resolved_color := p_color;
  ELSE
    SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
    v_resolved_color := liked_tag_palette(v_folder_count::INT);
  END IF;

  INSERT INTO folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), p_name, p_user_id, NULL, TRUE, v_resolved_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  RETURN v_folder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_named_folder(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_named_folder(UUID, TEXT, TEXT) TO service_role;

-- ── move_node_to_folder ──────────────────────────────────────
-- Atomic: add to target + remove from source in one transaction.
-- If source is NULL or equals target, behaves as add-only.
CREATE OR REPLACE FUNCTION move_node_to_folder(
  p_node_id          UUID,
  p_target_folder_id UUID,
  p_source_folder_id UUID,
  p_user_id          UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify target folder exists and user has access (owner or contributor)
  IF NOT EXISTS (
    SELECT 1 FROM folders f
    WHERE f.id = p_target_folder_id
      AND f.deleted_at IS NULL
      AND (
        f.owner_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM folder_admins fa
          WHERE fa.folder_id = f.id AND fa.user_id = p_user_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Target folder not found or no access'
      USING ERRCODE = 'P0003';
  END IF;

  -- Add to target (idempotent)
  INSERT INTO folder_edges (node_id, folder_id)
  VALUES (p_node_id, p_target_folder_id)
  ON CONFLICT DO NOTHING;

  -- Remove from source if different
  IF p_source_folder_id IS NOT NULL AND p_source_folder_id != p_target_folder_id THEN
    DELETE FROM folder_edges
    WHERE node_id = p_node_id
      AND folder_id = p_source_folder_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION move_node_to_folder(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION move_node_to_folder(UUID, UUID, UUID, UUID) TO service_role;

-- ── create_folder_with_nodes ─────────────────────────────────
-- Atomic: create folder + folder_tree + bulk folder_edges in one transaction.
CREATE OR REPLACE FUNCTION create_folder_with_nodes(
  p_name             TEXT,
  p_parent_folder_id UUID DEFAULT NULL,
  p_node_ids         UUID[] DEFAULT NULL,
  p_user_id          UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder_id UUID;
  v_is_project BOOLEAN;
  v_folder_count BIGINT;
  v_color TEXT;
  v_node_id UUID;
  v_owner UUID;
BEGIN
  v_owner := COALESCE(p_user_id, auth.uid());
  v_is_project := (p_parent_folder_id IS NULL);

  SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
  v_color := liked_tag_palette(v_folder_count::INT);

  INSERT INTO folders (
    id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at
  ) VALUES (
    gen_random_uuid(), p_name, v_owner, p_parent_folder_id, v_is_project, v_color, NULL, now()
  )
  RETURNING id INTO v_folder_id;

  -- folder_tree self-reference
  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  -- folder_tree ancestor references (if nested)
  IF p_parent_folder_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT v_folder_id, ancestor_id, depth + 1
    FROM folder_tree
    WHERE folder_id = p_parent_folder_id;
  END IF;

  -- Bulk assign nodes to the new folder
  IF p_node_ids IS NOT NULL THEN
    FOREACH v_node_id IN ARRAY p_node_ids
    LOOP
      CONTINUE WHEN v_node_id IS NULL;
      INSERT INTO folder_edges (node_id, folder_id)
      VALUES (v_node_id, v_folder_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_folder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_folder_with_nodes(TEXT, UUID, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_folder_with_nodes(TEXT, UUID, UUID[], UUID) TO service_role;
