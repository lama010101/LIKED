-- ============================================================
-- Migration 066 — Create atomic import_url RPC (Rule 9 compliance)
-- ============================================================
-- PRD §20: "Writes = one atomic transaction. Every save creates
-- cause → node → edge, with optional folder_edges, tag_edges, and
-- node_notes. No partial writes."
--
-- This RPC replaces the non-atomic pattern of:
--   createNode() → addNodeToFolder() → addTagToNode()
-- which used 3+ separate transactions.
--
-- Everything below runs in ONE Postgres transaction. If any step
-- fails, the entire operation rolls back. No partial writes.
--
-- Per Rule 9: NO pre-check for duplicates. The nodes table has a
-- UNIQUE(url, owner_id) constraint. We catch unique_violation and
-- raise a custom exception 'DUPLICATE_NODE' that the TypeScript
-- wrapper translates to alreadyExists: true.
--
-- Parameters:
--   p_owner_id          UUID   — authenticated user
--   p_url               TEXT   — http/https URL (validated by caller)
--   p_title             TEXT   — auto-extracted or user-supplied title
--   p_thumbnail_key     TEXT   — auto-extracted thumbnail
--   p_language_code     TEXT   — user's preferred language
--   p_description       TEXT   — page-metadata description (translations)
--   p_new_tag_labels    TEXT[] — new tag labels to create + attach
--   p_existing_tag_ids  UUID[] — existing tag IDs to attach
--   p_folder_id         UUID   — folder to assign the node to
--   p_note              TEXT   — personal note (node_notes)
--
-- Returns: TABLE with node fields (same as create_node_with_metadata)
-- Raises: 'DUPLICATE_NODE' exception on unique violation
-- ============================================================

CREATE OR REPLACE FUNCTION import_url(
  p_owner_id          UUID,
  p_url               TEXT,
  p_title             TEXT,
  p_thumbnail_key     TEXT,
  p_language_code     TEXT,
  p_description       TEXT DEFAULT NULL,
  p_new_tag_labels    TEXT[] DEFAULT NULL,
  p_existing_tag_ids  UUID[] DEFAULT NULL,
  p_folder_id         UUID DEFAULT NULL,
  p_note              TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  url TEXT,
  text_content TEXT,
  title TEXT,
  thumbnail_key TEXT,
  owner_id UUID,
  language_code TEXT,
  origin_user_id UUID,
  origin_created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');
  v_note := NULLIF(btrim(p_note), '');

  -- 1. Insert node — NO pre-check for duplicates (Rule 9).
  --    Catch unique_violation on (url, owner_id) and raise custom exception.
  BEGIN
    INSERT INTO nodes (
      id, url, text_content, title, thumbnail_key,
      owner_id, language_code,
      origin_user_id, origin_created_at,
      deleted_at, created_at
    ) VALUES (
      gen_random_uuid(),
      p_url, NULL, p_title, p_thumbnail_key,
      p_owner_id, v_lang,
      p_owner_id, v_now,
      NULL, v_now
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

  -- 6. Folder assignment: verify ownership, then insert folder_edges
  -- Qualify columns with table name to avoid ambiguity with RETURNS TABLE
  -- output parameters (owner_id, deleted_at are in our RETURNS TABLE).
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
$$;

-- Grants
GRANT EXECUTE ON FUNCTION import_url(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], UUID[], UUID, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION import_url(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], UUID[], UUID, TEXT
) TO service_role;
