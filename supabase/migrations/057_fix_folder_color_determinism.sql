-- ============================================================
-- Migration 057 — FIX-AUDIT-04: Fix folder color assignment determinism
-- ============================================================
--
-- Changes:
-- 1. Replace custom palette lookup with liked_tag_palette function
-- 2. Use deterministic cycling based on total folder count
-- 3. Remove ORDER BY random() (if present in earlier version)
--
-- Ref: LIKED / FIX-AUDIT-04

CREATE OR REPLACE FUNCTION create_folder(
  p_name TEXT,
  p_parent_folder_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_folder_id UUID;
  v_is_project BOOLEAN;
  v_color_hex TEXT;
  v_folder_count BIGINT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Determine is_project: true if no parent
  v_is_project := (p_parent_folder_id IS NULL);

  -- Assign deterministic color using liked_tag_palette (same as tags)
  SELECT COUNT(*) INTO v_folder_count FROM folders WHERE deleted_at IS NULL;
  v_color_hex := liked_tag_palette(v_folder_count::INT);

  -- INSERT folder
  INSERT INTO folders (
    id,
    name,
    owner_id,
    parent_folder_id,
    is_project,
    color_hex,
    deleted_at,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_name,
    auth.uid(),
    p_parent_folder_id,
    v_is_project,
    v_color_hex,
    NULL,
    v_now
  )
  RETURNING id INTO v_folder_id;

  -- INSERT folder_tree self-reference
  INSERT INTO folder_tree (folder_id, ancestor_id, depth)
  VALUES (v_folder_id, v_folder_id, 0);

  -- INSERT folder_tree ancestor references
  IF p_parent_folder_id IS NOT NULL THEN
    INSERT INTO folder_tree (folder_id, ancestor_id, depth)
    SELECT v_folder_id, ancestor_id, depth + 1
    FROM folder_tree
    WHERE folder_id = p_parent_folder_id;
  END IF;

  RETURN v_folder_id;
END;
$$;

-- Grant execute on function
GRANT EXECUTE ON FUNCTION create_folder(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_folder(TEXT, UUID) TO service_role;
