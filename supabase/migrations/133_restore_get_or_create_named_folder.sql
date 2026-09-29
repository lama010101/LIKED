-- ============================================================
-- Migration 133 — restore public.get_or_create_named_folder
-- ============================================================
-- Migration 132 dropped get_or_create_named_folder(UUID,TEXT,TEXT)
-- as superseded, but two SECURITY DEFINER functions still call it:
--   128 _resolve_auto_folder       (custom auto-folder names in
--                                   import_url / create_node_with_metadata)
--   129 apply_organization_batch   (new-folder proposals, Q16 move)
-- Live state verified: PGRST202 (function absent) → every organize
-- apply carrying new_folder_name failed and rolled back.
-- Body restored verbatim from 094_fix_anon_bypass_and_revoke.sql:1439.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_or_create_named_folder(p_user_id uuid, p_name text, p_color text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_folder_id UUID;
  v_folder_count BIGINT;
  v_resolved_color TEXT;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
$function$;

REVOKE ALL ON FUNCTION public.get_or_create_named_folder(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_named_folder(UUID, TEXT, TEXT) TO authenticated, service_role;
