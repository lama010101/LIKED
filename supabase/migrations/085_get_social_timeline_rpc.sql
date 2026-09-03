-- ============================================================
-- Migration 085 — AUDIT-06 P1-2: get_social_timeline RPC
-- ============================================================
-- Facebook/Instagram-style timeline: unions cards (visible to user)
-- with folders (owned by user), sorted by created_at DESC, cursor-paginated.
--
-- Replaces the client-side merge+sort in SocialFeedView.tsx which
-- fetched cards from get_feed and folders separately, then merged and
-- re-sorted in JavaScript (feed logic leak).
--
-- Card fields mirror get_feed's output. Folder fields are populated
-- for kind='folder' rows. The `kind` column distinguishes them.
--
-- Per the feed-lock rule: this RPC is treated as a black box. It mirrors
-- the get_feed visibility CTE structure for cards and unions folders.
-- ============================================================

CREATE OR REPLACE FUNCTION get_social_timeline(
  p_user_id          UUID,
  p_language_code    TEXT    DEFAULT 'en',
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id        UUID    DEFAULT NULL,
  p_limit            INTEGER DEFAULT 30
)
RETURNS TABLE (
  kind              TEXT,           -- 'card' | 'folder'
  id                UUID,
  created_at        TIMESTAMPTZ,
  -- Card fields (NULL for folders)
  url               TEXT,
  text_content      TEXT,
  title             TEXT,
  thumbnail_key     TEXT,
  owner_id          UUID,
  direction         TEXT,
  sender_id         UUID,
  sender_name       TEXT,
  sender_avatar_key TEXT,
  avg_rating        NUMERIC,
  tags              JSONB,
  -- Folder fields (NULL for cards)
  folder_name       TEXT,
  folder_color      TEXT,
  folder_count      BIGINT,
  folder_thumbnails JSONB,
  -- Pagination
  total_count       BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- ── Cards: visible nodes (mirrors get_feed visibility) ──
  cards AS (
    SELECT DISTINCT ON (n.id)
      'card'::TEXT AS kind,
      n.id,
      n.created_at,
      n.url,
      n.text_content,
      COALESCE(
        (SELECT t1.title FROM translations t1
         WHERE t1.node_id = n.id AND t1.language_code = p_language_code LIMIT 1),
        (SELECT t2.title FROM translations t2
         WHERE t2.node_id = n.id AND t2.language_code = n.language_code LIMIT 1),
        n.title
      ) AS title,
      n.thumbnail_key,
      n.owner_id,
      CASE
        WHEN n.owner_id = p_user_id THEN 'own'
        WHEN e.direction = 'sent' THEN 'sent'
        ELSE 'received'
      END AS direction,
      e.sender_id,
      u.display_name AS sender_name,
      u.avatar_key AS sender_avatar_key,
      nsc.avg_rating,
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'tag_id', t.id,
            'color_hex', t.color_hex,
            'label', COALESCE(
              (SELECT tt1.label FROM tag_translations tt1
               WHERE tt1.tag_id = t.id AND tt1.language_code = p_language_code LIMIT 1),
              (SELECT tt2.label FROM tag_translations tt2
               WHERE tt2.tag_id = t.id AND tt2.language_code = 'en' LIMIT 1),
              LEFT(t.id::TEXT, 8)
            )
          ) ORDER BY te.created_at ASC
        ), '[]'::jsonb)
        FROM tag_edges te
        JOIN tags t ON t.id = te.tag_id
        WHERE te.node_id = n.id
      ) AS tags,
      NULL::TEXT AS folder_name,
      NULL::TEXT AS folder_color,
      NULL::BIGINT AS folder_count,
      NULL::JSONB AS folder_thumbnails
    FROM nodes n
    LEFT JOIN edges e ON e.node_id = n.id AND e.user_id = p_user_id
    LEFT JOIN users u ON u.id = e.sender_id
    LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = n.id
    WHERE n.deleted_at IS NULL
      AND (n.owner_id = p_user_id OR e.id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
           OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
      )
  ),
  -- ── Folders: owned by user ──
  folders AS (
    SELECT
      'folder'::TEXT AS kind,
      f.id,
      f.created_at,
      NULL::TEXT AS url,
      NULL::TEXT AS text_content,
      f.name AS title,
      NULL::TEXT AS thumbnail_key,
      f.owner_id,
      NULL::TEXT AS direction,
      NULL::UUID AS sender_id,
      NULL::TEXT AS sender_name,
      NULL::TEXT AS sender_avatar_key,
      NULL::NUMERIC AS avg_rating,
      '[]'::JSONB AS tags,
      f.name AS folder_name,
      f.color_hex AS folder_color,
      (SELECT COUNT(*) FROM folder_edges fe WHERE fe.folder_id = f.id) AS folder_count,
      COALESCE(
        (SELECT jsonb_agg(n.thumbnail_key) FROM (
          SELECT DISTINCT nodes.thumbnail_key
          FROM folder_edges fe2
          JOIN nodes ON nodes.id = fe2.node_id
          WHERE nodes.thumbnail_key IS NOT NULL
            AND nodes.deleted_at IS NULL
            AND fe2.folder_id = f.id
          LIMIT 4
        ) n),
        '[]'::jsonb
      ) AS folder_thumbnails
    FROM folders f
    WHERE f.owner_id = p_user_id
      AND f.deleted_at IS NULL
  ),
  -- ── Union + paginate ──
  combined AS (
    SELECT * FROM cards
    UNION ALL
    SELECT * FROM folders
  ),
  paginated AS (
    SELECT
      c.*,
      COUNT(*) OVER() AS total_count
    FROM combined c
    WHERE
      p_cursor_created_at IS NULL
      OR (c.created_at < p_cursor_created_at)
      OR (c.created_at = p_cursor_created_at AND c.id < p_cursor_id)
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT p_limit
  )
  SELECT
    p.kind, p.id, p.created_at,
    p.url, p.text_content, p.title, p.thumbnail_key,
    p.owner_id, p.direction, p.sender_id, p.sender_name, p.sender_avatar_key,
    p.avg_rating, p.tags,
    p.folder_name, p.folder_color, p.folder_count, p.folder_thumbnails,
    p.total_count
  FROM paginated p;
END;
$$;

GRANT EXECUTE ON FUNCTION get_social_timeline(UUID, TEXT, TIMESTAMPTZ, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_social_timeline(UUID, TEXT, TIMESTAMPTZ, UUID, INTEGER) TO service_role;
