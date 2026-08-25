-- Migration 068: get_visible_tags RPC for TagsStrip (UX-001)
-- Per PRD §11.3f: Tags shown are only tags that exist on nodes currently visible to the current user
-- This requires joining tag_edges → tags → tag_translations → nodes → edges

CREATE OR REPLACE FUNCTION get_visible_tags(
  p_user_id UUID,
  p_language_code TEXT DEFAULT 'en'
)
RETURNS TABLE (
  id UUID,
  color_hex TEXT,
  label TEXT
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    t.id,
    t.color_hex,
    tt.label
  FROM tag_edges te
  JOIN tags t ON t.id = te.tag_id
  JOIN tag_translations tt ON tt.tag_id = t.id AND tt.language_code = p_language_code
  JOIN nodes n ON n.id = te.node_id
  JOIN edges e ON e.node_id = n.id AND e.user_id = p_user_id
  WHERE n.deleted_at IS NULL
  ORDER BY tt.label ASC;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_visible_tags(UUID, TEXT) TO authenticated;
