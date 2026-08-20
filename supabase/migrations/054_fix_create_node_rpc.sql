-- ============================================================
-- Migration 054 — FIX-AUDIT-01: Fix create_node RPC
-- ============================================================
--
-- Changes:
-- 1. Add causes row creation (self-creation cause)
-- 2. Add edges row for node owner (visibility: owner can see their own node)
-- 3. Wrap multi-table writes in EXCEPTION block for atomicity
-- 4. Preserve existing signature and return type
--
-- Ref: LIKED / FIX-AUDIT-01

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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_node_id UUID;
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Insert into nodes
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

  -- 2. Insert into nodes_sort_cache in same transaction
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

  -- 3. Insert cause (self-creation cause)
  INSERT INTO causes (
    id,
    cause_type,
    created_by,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'created',
    p_owner_id,
    jsonb_build_object('node_id', v_node_id),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- 4. Insert owner edge (visibility: owner can see their own node)
  INSERT INTO edges (
    id,
    node_id,
    user_id,
    cause_id,
    sender_id,
    direction,
    depth,
    permission,
    created_at
  ) VALUES (
    gen_random_uuid(),
    v_node_id,
    p_owner_id,
    v_cause_id,
    NULL,
    'sent',
    0,
    'owner',
    v_now
  );

  -- 5. Return the created node
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

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION create_node(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_node(UUID, TEXT, TEXT, TEXT) TO service_role;
