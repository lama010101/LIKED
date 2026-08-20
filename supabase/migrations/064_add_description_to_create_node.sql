-- Migration 064 — Chrome Extension: add optional p_description to create_node_with_metadata
--
-- Purpose: the LIKED Chrome extension's "Advanced" save form lets the user
-- supply a custom description. This migration makes create_node_with_metadata
-- accept an optional p_description TEXT and persist it into the
-- `translations` table (the canonical node description slot, per docs/06 §18).
--
-- This is purely additive:
--   * Existing callers omit p_description → behavior unchanged.
--   * When p_description is non-empty, a translations row is upserted for
--     (node_id, p_language_code). If a row already exists (e.g.Edge Function
--     pre-seeded one), the description column is updated.
--
-- Note: this is NOT a personal note. Personal notes (node_notes table) are
-- out of scope for this task. p_description is the page-metadata description.
--
-- IMPORTANT: DROP the old 7-param function first. CREATE OR REPLACE with a
-- different signature creates a NEW function, not a replacement. Without
-- the DROP, two overloads would coexist and Postgres could not resolve
-- which to call (same issue as the get_feed overload bug, migration 063).

DROP FUNCTION IF EXISTS create_node_with_metadata(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);

CREATE OR REPLACE FUNCTION create_node_with_metadata(
  p_owner_id UUID,
  p_url TEXT,
  p_text_content TEXT,
  p_title TEXT,
  p_thumbnail_key TEXT,
  p_language_code TEXT,
  p_tag_labels TEXT[],
  p_description TEXT DEFAULT NULL
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
BEGIN
  v_lang := COALESCE(p_language_code, 'en');
  v_desc := NULLIF(btrim(p_description), '');

  -- 1. Insert node
  INSERT INTO nodes (
    id, url, text_content, title, thumbnail_key,
    owner_id, language_code,
    origin_user_id, origin_created_at,
    deleted_at, created_at
  ) VALUES (
    gen_random_uuid(),
    p_url, p_text_content, p_title, p_thumbnail_key,
    p_owner_id, v_lang,
    p_owner_id, v_now,
    NULL, v_now
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

      -- Lookup existing translation
      SELECT tag_id INTO v_tag_id
      FROM tag_translations
      WHERE tag_translations.language_code = v_lang
        AND label = v_label
      LIMIT 1;

      IF v_tag_id IS NULL THEN
        -- Pick next palette color deterministically by current tag count
        SELECT COUNT(*) INTO v_tag_count FROM tags;
        v_color := liked_tag_palette(v_tag_count::INT);

        INSERT INTO tags (color_hex) VALUES (v_color)
        RETURNING tags.id INTO v_tag_id;

        BEGIN
          INSERT INTO tag_translations (tag_id, language_code, label)
          VALUES (v_tag_id, v_lang, v_label);
        EXCEPTION WHEN unique_violation THEN
          -- Race: another caller inserted the same translation. Clean up
          -- the orphan tag row and re-lookup.
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

  -- 5. Optional description → translations row (Chrome extension advanced save)
  -- Use ON CONSTRAINT to avoid ambiguous column reference between
  -- translations.language_code and the function's RETURNS TABLE output param.
  IF v_desc IS NOT NULL THEN
    INSERT INTO translations (node_id, language_code, title, description)
    VALUES (v_node_id, v_lang, p_title, v_desc)
    ON CONFLICT ON CONSTRAINT translations_node_id_language_code_key
    DO UPDATE SET description = EXCLUDED.description;
  END IF;

  -- 6. Return
  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code,
         n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$$;

-- Re-grant (signature changed; grants must be reissued).
GRANT EXECUTE ON FUNCTION create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT) TO service_role;
