-- ============================================================
-- Migration 100 — IMPL-NODE-TYPE-01: caller-supplied node_type
-- ============================================================
-- Adds a required p_node_type parameter to both node-creation RPCs.
-- The value is written verbatim into nodes.node_type — the RPC does
-- not infer or hardcode it (Decision 1: caller-supplied; YouTube
-- callers send 'video', the extension route sends 'link', the add
-- sheet maps its chip).
--
-- Old signatures are DROPPED (not overloaded) — two live creation
-- paths for the same table is exactly the dual-logic state this
-- task exists to remove.
--
-- In-function validation is kept (defense in depth): the table CHECK
-- permits NULL only on junk domains, but the RPC is the only write
-- path and should fail loudly with a named error rather than rely on
-- constraint text reaching the client.
--
-- Grants preserved from 094: service_role only.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_node_with_metadata(uuid, text, text, text, text, text, text[], text, text);

CREATE OR REPLACE FUNCTION public.create_node_with_metadata(p_owner_id uuid, p_url text, p_text_content text, p_title text, p_thumbnail_key text, p_language_code text, p_tag_labels text[], p_node_type text, p_description text DEFAULT NULL::text, p_auto_folder_name text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF p_node_type IS NULL OR p_node_type NOT IN ('text', 'link', 'image', 'video') THEN
    RAISE EXCEPTION 'invalid node_type: %', p_node_type USING ERRCODE = 'P0001';
  END IF;
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');

  -- 1. Insert node
  INSERT INTO nodes (
    id, url, text_content, title, thumbnail_key,
    owner_id, language_code,
    origin_user_id, origin_created_at,
    deleted_at, created_at, node_type
  ) VALUES (
    gen_random_uuid(),
    p_url, p_text_content, p_title, p_thumbnail_key,
    p_owner_id, v_lang,
    p_owner_id, v_now,
    NULL, v_now, p_node_type
  )
  RETURNING nodes.id INTO v_node_id;

  -- 2. nodes_sort_cache
  INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at)
  VALUES (v_node_id, NULL, 0, 0, v_now);

  -- 3. Import cause + owner edge (PRD §6.8)
  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES (
    'import',
    p_owner_id,
    jsonb_build_object('node_id', v_node_id)
  )
  RETURNING causes.id INTO v_cause_id;

  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (
    v_node_id,
    p_owner_id,
    v_cause_id,
    NULL,
    'sent',
    0
  );

  -- 4. Tags (§19.3): for each label, lookup or create, then tag_edges
  IF p_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      SELECT tag_id INTO v_tag_id
      FROM tag_translations
      WHERE tag_translations.language_code = v_lang
        AND label = v_label
      LIMIT 1;

      IF v_tag_id IS NULL THEN
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);

        INSERT INTO tags (color_hex) VALUES (v_color)
        RETURNING tags.id INTO v_tag_id;

        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id
          FROM tag_translations
          WHERE tag_translations.language_code = v_lang
            AND label = v_label
          LIMIT 1;
        END;
      END IF;

      IF v_tag_id IS NOT NULL THEN
        INSERT INTO tag_edges (tag_id, node_id, folder_id)
        VALUES (v_tag_id, v_node_id, NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- 5. Optional description → translations row
  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  -- 6. Auto-folder assignment (AUDIT-06 P1-4): in-transaction.
  --    If no explicit folder, auto-assign to Unsorted or a named folder.
  v_auto_folder_id := get_or_create_named_folder(
    p_owner_id,
    COALESCE(NULLIF(btrim(p_auto_folder_name), ''), 'Unsorted'),
    NULL
  );
  INSERT INTO folder_edges (node_id, folder_id)
  VALUES (v_node_id, v_auto_folder_id)
  ON CONFLICT DO NOTHING;

  -- 7. Return
  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code,
         n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.create_node_with_metadata(uuid, text, text, text, text, text, text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_node_with_metadata(uuid, text, text, text, text, text, text[], text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.import_url(uuid, text, text, text, text, text, text[], uuid[], uuid, text, text);

CREATE OR REPLACE FUNCTION public.import_url(p_owner_id uuid, p_url text, p_title text, p_thumbnail_key text, p_language_code text, p_node_type text, p_description text DEFAULT NULL::text, p_new_tag_labels text[] DEFAULT NULL::text[], p_existing_tag_ids uuid[] DEFAULT NULL::uuid[], p_folder_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_auto_folder_name text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, url text, text_content text, title text, thumbnail_key text, owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamp with time zone, deleted_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_folder_owner UUID;
  v_auto_folder_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
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
      owner_id, language_code,
      origin_user_id, origin_created_at,
      deleted_at, created_at, node_type
    ) VALUES (
      gen_random_uuid(),
      p_url, NULL, p_title, p_thumbnail_key,
      p_owner_id, v_lang,
      p_owner_id, v_now,
      NULL, v_now, p_node_type
    )
    RETURNING nodes.id INTO v_node_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_NODE'
      USING ERRCODE = 'P0001';
  END;

  -- 2. nodes_sort_cache
  INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at)
  VALUES (v_node_id, NULL, 0, 0, v_now);

  -- 3. Import cause + owner edge (PRD §6.8)
  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES (
    'import',
    p_owner_id,
    jsonb_build_object('node_id', v_node_id)
  )
  RETURNING causes.id INTO v_cause_id;

  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (
    v_node_id,
    p_owner_id,
    v_cause_id,
    NULL,
    'sent',
    0
  );

  -- 4. New tag labels: lookup or create tag + tag_translations, then tag_edges
  IF p_new_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_new_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      SELECT tag_id INTO v_tag_id
      FROM tag_translations
      WHERE tag_translations.language_code = v_lang
        AND label = v_label
      LIMIT 1;

      IF v_tag_id IS NULL THEN
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);

        INSERT INTO tags (color_hex) VALUES (v_color)
        RETURNING tags.id INTO v_tag_id;

        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id
          FROM tag_translations
          WHERE tag_translations.language_code = v_lang
            AND label = v_label
          LIMIT 1;
        END;
      END IF;

      IF v_tag_id IS NOT NULL THEN
        INSERT INTO tag_edges (tag_id, node_id, folder_id)
        VALUES (v_tag_id, v_node_id, NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- 5. Existing tag IDs: attach via tag_edges (idempotent)
  IF p_existing_tag_ids IS NOT NULL THEN
    FOREACH v_existing_tag IN ARRAY p_existing_tag_ids
    LOOP
      CONTINUE WHEN v_existing_tag IS NULL;
      INSERT INTO tag_edges (tag_id, node_id, folder_id)
      VALUES (v_existing_tag, v_node_id, NULL)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- 6. Folder assignment (AUDIT-06 P1-4): in-transaction.
  --    Explicit folder takes priority; otherwise auto-folder.
  IF p_folder_id IS NOT NULL THEN
    SELECT folders.owner_id INTO v_folder_owner
    FROM folders
    WHERE folders.id = p_folder_id
      AND folders.deleted_at IS NULL
    LIMIT 1;

    IF v_folder_owner IS NULL THEN
      RAISE EXCEPTION 'Folder not found or deleted'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_folder_owner != p_owner_id THEN
      RAISE EXCEPTION 'Folder not owned by user'
        USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO folder_edges (node_id, folder_id)
    VALUES (v_node_id, p_folder_id)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Auto-folder: named folder (e.g. "YouTube") or "Unsorted"
    v_auto_folder_id := get_or_create_named_folder(
      p_owner_id,
      COALESCE(NULLIF(btrim(p_auto_folder_name), ''), 'Unsorted'),
      NULL
    );
    INSERT INTO folder_edges (node_id, folder_id)
    VALUES (v_node_id, v_auto_folder_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 7. Personal note → node_notes (upsert: one note per node per user)
  IF v_note IS NOT NULL THEN
    INSERT INTO node_notes (node_id, user_id, content, created_at, updated_at)
    VALUES (v_node_id, p_owner_id, v_note, v_now, v_now)
    ON CONFLICT (node_id, user_id)
    DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at;
  END IF;

  -- 8. Optional description → translations (upsert)
  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  -- 9. Return the created node
  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code,
         n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.import_url(uuid, text, text, text, text, text, text, text[], uuid[], uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_url(uuid, text, text, text, text, text, text, text[], uuid[], uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
