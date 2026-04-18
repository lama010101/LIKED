-- ============================================================
-- RPC Function: create_node
-- Atomic transaction for node creation with nodes_sort_cache
-- P2-T02
-- ============================================================

CREATE OR REPLACE FUNCTION create_node(
  p_owner_id UUID,
  p_url TEXT,
  p_text_content TEXT,
  p_language_code TEXT DEFAULT 'en'
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
BEGIN
  -- Insert into nodes
  INSERT INTO nodes (
    id,
    url,
    text_content,
    title,
    thumbnail_key,
    owner_id,
    language_code,
    origin_user_id,
    origin_created_at,
    deleted_at,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_url,
    p_text_content,
    NULL, -- title will be populated by metadata extraction later
    NULL, -- thumbnail_key will be populated later
    p_owner_id,
    p_language_code,
    p_owner_id, -- origin_user_id = creator
    v_now, -- origin_created_at = now
    NULL, -- deleted_at
    v_now
  )
  RETURNING nodes.id INTO v_node_id;

  -- Insert into nodes_sort_cache in same transaction
  INSERT INTO nodes_sort_cache (
    node_id,
    avg_rating,
    view_count,
    share_count,
    updated_at
  ) VALUES (
    v_node_id,
    NULL, -- avg_rating
    0, -- view_count
    0, -- share_count
    v_now
  );

  -- Return the created node
  RETURN QUERY
  SELECT
    n.id,
    n.url,
    n.text_content,
    n.title,
    n.thumbnail_key,
    n.owner_id,
    n.language_code,
    n.origin_user_id,
    n.origin_created_at,
    n.deleted_at,
    n.created_at
  FROM nodes n
  WHERE n.id = v_node_id;
END;
$$;

-- Grant execute permission to authenticated users
-- The RLS policies will still apply to the underlying tables
GRANT EXECUTE ON FUNCTION create_node(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_node(UUID, TEXT, TEXT, TEXT) TO service_role;
