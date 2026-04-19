-- Migration 019 — create_node_with_metadata RPC (P8-T02, PRD §15.1 + §22)
--
-- Atomic transaction: nodes INSERT + nodes_sort_cache INSERT + tag upserts
-- + tag_edges INSERT. All happen in a single transaction so that a partial
-- failure (e.g. one tag insert race) cannot leave the node without its
-- auto-tags or vice-versa.
--
-- Tag creation follows PRD §19.3: normalize → lookup tag_translations for
-- (language_code, label) → reuse, else INSERT tags with next palette color
-- and INSERT tag_translations. ON CONFLICT re-lookups cover races.

-- Deterministic 20-color palette — must match lib/db/tags.ts TAG_COLOR_PALETTE.
CREATE OR REPLACE FUNCTION liked_tag_palette(p_index INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (ARRAY[
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#64748b', '#78716c', '#0f766e'
  ])[(p_index % 20) + 1];
$$;

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
AS $$
DECLARE
  v_node_id UUID;
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

  -- 3. Tags (§19.3): for each label, lookup or create, then tag_edges
  IF p_tag_labels IS NOT NULL THEN
    FOREACH v_label IN ARRAY p_tag_labels
    LOOP
      v_label := trim(v_label);
      CONTINUE WHEN v_label IS NULL OR v_label = '';

      -- Lookup existing translation
      SELECT tag_id INTO v_tag_id
      FROM tag_translations
      WHERE language_code = COALESCE(p_language_code, 'en')
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
          WHERE language_code = COALESCE(p_language_code, 'en')
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

  -- 4. Return
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
