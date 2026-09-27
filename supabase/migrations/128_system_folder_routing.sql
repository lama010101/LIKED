-- ============================================================
-- Migration 128 — MVP2 P2-07 (Q15): system folders + import routing
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- get_or_create_system_folder resolves 'youtube'/'web'/'unsorted' to the
-- owner's single live system folder (creates or adopts by name on first
-- use). import_url and create_node_with_metadata now route the well-known
-- auto-folder names to system folders and expand covering grants on every
-- membership insert (Q10). An explicit target folder now requires
-- contribute+ instead of ownership.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_or_create_system_folder(p_kind TEXT, p_user_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID;
  v_name TEXT;
  v_folder_id UUID;
  v_count BIGINT;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NOT NULL AND auth.role() <> 'service_role' AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  v_name := CASE p_kind WHEN 'youtube' THEN 'YouTube' WHEN 'web' THEN 'Web' WHEN 'unsorted' THEN 'Unsorted' END;
  IF v_name IS NULL THEN RAISE EXCEPTION 'invalid system folder kind: %', p_kind USING ERRCODE = '22023'; END IF;

  -- identity by kind first
  SELECT id INTO v_folder_id FROM folders
   WHERE owner_id = v_uid AND system_kind = p_kind AND deleted_at IS NULL
   LIMIT 1;
  IF v_folder_id IS NOT NULL THEN RETURN v_folder_id; END IF;

  -- adopt a matching top-level folder (pre-backfill leftovers)
  SELECT id INTO v_folder_id FROM folders
   WHERE owner_id = v_uid AND name = v_name AND parent_folder_id IS NULL AND deleted_at IS NULL
   ORDER BY created_at LIMIT 1;
  IF v_folder_id IS NOT NULL THEN
    UPDATE folders SET system_kind = p_kind WHERE id = v_folder_id;
    RETURN v_folder_id;
  END IF;

  SELECT COUNT(*) INTO v_count FROM folders WHERE owner_id = v_uid AND deleted_at IS NULL;
  INSERT INTO folders (id, name, owner_id, parent_folder_id, is_project, color_hex, system_kind, deleted_at, created_at)
  VALUES (gen_random_uuid(), v_name, v_uid, NULL, TRUE, liked_tag_palette(v_count::INT), p_kind, NULL, now())
  RETURNING id INTO v_folder_id;
  INSERT INTO folder_tree (folder_id, ancestor_id, depth) VALUES (v_folder_id, v_folder_id, 0);
  RETURN v_folder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_system_folder(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_system_folder(TEXT, UUID) TO authenticated, service_role;

-- Resolve an auto-folder name to a folder id: well-known names become
-- system folders; anything else is a named top-level folder.
CREATE OR REPLACE FUNCTION public._resolve_auto_folder(p_user_id UUID, p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_name TEXT := NULLIF(btrim(COALESCE(p_name, '')), '');
BEGIN
  IF v_name IS NULL THEN
    RETURN public.get_or_create_system_folder('unsorted', p_user_id);
  END IF;
  CASE lower(v_name)
    WHEN 'youtube' THEN RETURN public.get_or_create_system_folder('youtube', p_user_id);
    WHEN 'web' THEN RETURN public.get_or_create_system_folder('web', p_user_id);
    WHEN 'unsorted' THEN RETURN public.get_or_create_system_folder('unsorted', p_user_id);
    ELSE RETURN public.get_or_create_named_folder(p_user_id, v_name, NULL);
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_auto_folder(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_url(
  p_owner_id UUID, p_url TEXT, p_title TEXT, p_thumbnail_key TEXT,
  p_language_code TEXT, p_node_type TEXT, p_description TEXT DEFAULT NULL,
  p_new_tag_labels TEXT[] DEFAULT NULL, p_existing_tag_ids UUID[] DEFAULT NULL,
  p_folder_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_auto_folder_name TEXT DEFAULT NULL
) RETURNS TABLE(id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
  v_label TEXT;
  v_tag_id UUID;
  v_tag_count BIGINT;
  v_color TEXT;
  v_lang TEXT;
  v_desc TEXT;
  v_note TEXT;
  v_existing_tag UUID;
  v_membership_folder UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF p_node_type IS NULL OR p_node_type NOT IN ('text', 'link', 'image', 'video') THEN
    RAISE EXCEPTION 'invalid node_type: %', p_node_type USING ERRCODE = 'P0001';
  END IF;
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');
  v_note := NULLIF(btrim(p_note), '');

  -- 1. Insert node — NO pre-check for duplicates (Rule 9).
  BEGIN
    INSERT INTO nodes (
      id, url, text_content, title, thumbnail_key,
      owner_id, language_code, origin_user_id, origin_created_at,
      deleted_at, created_at, node_type
    ) VALUES (
      gen_random_uuid(), p_url, NULL, p_title, p_thumbnail_key,
      p_owner_id, v_lang, p_owner_id, v_now, NULL, v_now, p_node_type
    )
    RETURNING nodes.id INTO v_node_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_NODE' USING ERRCODE = 'P0001';
  END;

  -- 2. nodes_sort_cache
  INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at)
  VALUES (v_node_id, NULL, 0, 0, v_now);

  -- 3. Import cause + owner edge (PRD §6.8)
  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES ('import', p_owner_id, jsonb_build_object('node_id', v_node_id))
  RETURNING causes.id INTO v_cause_id;

  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (v_node_id, p_owner_id, v_cause_id, NULL, 'sent', 0);

  -- 4. New tag labels: lookup or create tag + tag_translations, then tag_edges
  IF p_new_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_new_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      SELECT tag_id INTO v_tag_id FROM tag_translations
       WHERE tag_translations.language_code = v_lang AND label = v_label LIMIT 1;

      IF v_tag_id IS NULL THEN
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);
        INSERT INTO tags (color_hex) VALUES (v_color) RETURNING tags.id INTO v_tag_id;
        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id FROM tag_translations
           WHERE tag_translations.language_code = v_lang AND label = v_label LIMIT 1;
        END;
      END IF;

      IF v_tag_id IS NOT NULL THEN
        INSERT INTO tag_edges (tag_id, node_id, folder_id) VALUES (v_tag_id, v_node_id, NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- 5. Existing tag IDs
  IF p_existing_tag_ids IS NOT NULL THEN
    FOREACH v_existing_tag IN ARRAY p_existing_tag_ids
    LOOP
      CONTINUE WHEN v_existing_tag IS NULL;
      INSERT INTO tag_edges (tag_id, node_id, folder_id) VALUES (v_existing_tag, v_node_id, NULL)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- 6. Folder assignment: explicit folder (contribute+) or auto-folder
  --    (system routing for YouTube/Web/Unsorted).
  IF p_folder_id IS NOT NULL THEN
    IF public._perm_rank(public.effective_folder_permission(p_folder_id, p_owner_id)) < 3 THEN
      RAISE EXCEPTION 'Folder not found or no contribute access' USING ERRCODE = 'P0003';
    END IF;
    v_membership_folder := p_folder_id;
  ELSE
    v_membership_folder := public._resolve_auto_folder(p_owner_id, p_auto_folder_name);
  END IF;

  INSERT INTO folder_edges (node_id, folder_id, added_by)
  VALUES (v_node_id, v_membership_folder, p_owner_id)
  ON CONFLICT DO NOTHING;

  -- live sharing: covering grants expand onto the new item (Q10)
  PERFORM public._expand_folder_grants_for_node(v_node_id, v_membership_folder, p_owner_id);

  -- 7. Personal note
  IF v_note IS NOT NULL THEN
    INSERT INTO node_notes (node_id, user_id, content, created_at, updated_at)
    VALUES (v_node_id, p_owner_id, v_note, v_now, v_now)
    ON CONFLICT (node_id, user_id) DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at;
  END IF;

  -- 8. Optional description → translations
  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code, n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
    FROM nodes n WHERE n.id = v_node_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_url(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], UUID[], UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_url(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], UUID[], UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_node_with_metadata(
  p_owner_id UUID, p_url TEXT, p_text_content TEXT, p_title TEXT,
  p_thumbnail_key TEXT, p_language_code TEXT, p_tag_labels TEXT[],
  p_node_type TEXT, p_description TEXT DEFAULT NULL,
  p_auto_folder_name TEXT DEFAULT NULL
) RETURNS TABLE(id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
  v_label TEXT;
  v_tag_id UUID;
  v_tag_count BIGINT;
  v_color TEXT;
  v_lang TEXT;
  v_desc TEXT;
  v_auto_folder_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF p_node_type IS NULL OR p_node_type NOT IN ('text', 'link', 'image', 'video') THEN
    RAISE EXCEPTION 'invalid node_type: %', p_node_type USING ERRCODE = 'P0001';
  END IF;
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');

  INSERT INTO nodes (
    id, url, text_content, title, thumbnail_key,
    owner_id, language_code, origin_user_id, origin_created_at,
    deleted_at, created_at, node_type
  ) VALUES (
    gen_random_uuid(), p_url, p_text_content, p_title, p_thumbnail_key,
    p_owner_id, v_lang, p_owner_id, v_now, NULL, v_now, p_node_type
  ) RETURNING nodes.id INTO v_node_id;

  INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at)
  VALUES (v_node_id, NULL, 0, 0, v_now);

  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES ('import', p_owner_id, jsonb_build_object('node_id', v_node_id))
  RETURNING causes.id INTO v_cause_id;

  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (v_node_id, p_owner_id, v_cause_id, NULL, 'sent', 0);

  IF p_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      SELECT tag_id INTO v_tag_id FROM tag_translations
       WHERE tag_translations.language_code = v_lang AND label = v_label LIMIT 1;

      IF v_tag_id IS NULL THEN
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);
        INSERT INTO tags (color_hex) VALUES (v_color) RETURNING tags.id INTO v_tag_id;
        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id FROM tag_translations
           WHERE tag_translations.language_code = v_lang AND label = v_label LIMIT 1;
        END;
      END IF;

      IF v_tag_id IS NOT NULL THEN
        INSERT INTO tag_edges (tag_id, node_id, folder_id) VALUES (v_tag_id, v_node_id, NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  -- Auto-folder with system routing + live grant expansion (Q10/Q15)
  v_auto_folder_id := public._resolve_auto_folder(p_owner_id, p_auto_folder_name);
  INSERT INTO folder_edges (node_id, folder_id, added_by)
  VALUES (v_node_id, v_auto_folder_id, p_owner_id)
  ON CONFLICT DO NOTHING;
  PERFORM public._expand_folder_grants_for_node(v_node_id, v_auto_folder_id, p_owner_id);

  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code, n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
    FROM nodes n WHERE n.id = v_node_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, TEXT) TO authenticated, service_role;
