-- Migration 042 — FIX-WRITE-01: Add import cause + owner edge to create_node_with_metadata
--
-- Per PRD §6.8, node creation must atomically create an import cause and an
-- owner edge so the node is visible to its owner via the edge-based model.
--
-- Changes:
-- 1. Replaces create_node_with_metadata with version that inserts causes + edges
-- 2. Backfills existing nodes that lack an owner edge

-- ============================================================
-- A. Replace create_node_with_metadata (preserves all existing logic)
-- ============================================================

CREATE OR REPLACE FUNCTION create_node_with_metadata(
  p_owner_id UUID,
  p_url TEXT,
  p_text_content TEXT,
  p_title TEXT,
  p_thumbnail_key TEXT,
  p_language_code TEXT,
  p_tag_labels TEXT[]
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
BEGIN
  -- 1. Insert node
  INSERT INTO nodes (
    id, url, text_content, title, thumbnail_key,
    owner_id, language_code,
    origin_user_id, origin_created_at,
    deleted_at, created_at
  ) VALUES (
    gen_random_uuid(),
    p_url, p_text_content, p_title, p_thumbnail_key,
    p_owner_id, COALESCE(p_language_code, 'en'),
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
      WHERE tag_translations.language_code = COALESCE(p_language_code, 'en')
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
          VALUES (v_tag_id, COALESCE(p_language_code, 'en'), v_label);
        EXCEPTION WHEN unique_violation THEN
          -- Race: another caller inserted the same translation. Clean up
          -- the orphan tag row and re-lookup.
          DELETE FROM tags WHERE tags.id = v_tag_id;
          SELECT tag_id INTO v_tag_id
          FROM tag_translations
          WHERE tag_translations.language_code = COALESCE(p_language_code, 'en')
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

  -- 5. Return
  RETURN QUERY
  SELECT n.id, n.url, n.text_content, n.title, n.thumbnail_key,
         n.owner_id, n.language_code,
         n.origin_user_id, n.origin_created_at,
         n.deleted_at, n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;

-- ============================================================
-- B. Backfill existing nodes that lack an import cause + owner edge
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_cause_id UUID;
BEGIN
  -- Find all nodes that have no edge where user_id = owner_id
  -- AND direction = 'sent' AND depth = 0
  FOR r IN
    SELECT n.id AS node_id, n.owner_id
    FROM nodes n
    WHERE n.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM edges e
        WHERE e.node_id = n.id
          AND e.user_id = n.owner_id
          AND e.direction = 'sent'
          AND e.depth = 0
      )
  LOOP
    INSERT INTO causes (cause_type, created_by, metadata)
    VALUES (
      'import',
      r.owner_id,
      jsonb_build_object('node_id', r.node_id, 'backfill', true)
    )
    RETURNING id INTO v_cause_id;

    INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
    VALUES (r.node_id, r.owner_id, v_cause_id, NULL, 'sent', 0);
  END LOOP;
END $$;
