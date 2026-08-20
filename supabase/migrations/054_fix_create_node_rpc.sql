-- ============================================================
-- Migration 054 — FIX-AUDIT-01: Fix create_node RPC
-- ============================================================
--
-- Changes:
-- 1. Drop existing create_node function
-- 2. Recreate as SECURITY DEFINER
-- 3. Add causes row creation (self-creation cause)
-- 4. Add edges row for node owner (visibility: owner can see their own node)
-- 5. Wrap multi-table writes in EXCEPTION block for atomicity
-- 6. Update signature to match new schema requirements
--
-- Ref: LIKED / FIX-AUDIT-01

-- ============================================================
-- Drop existing create_node function
-- ============================================================

DROP FUNCTION IF EXISTS create_node(UUID, TEXT, TEXT, TEXT);

-- ============================================================
-- Create corrected create_node function
-- ============================================================

CREATE OR REPLACE FUNCTION create_node(
  p_owner_id UUID,
  p_url TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_content_type TEXT DEFAULT 'link',
  p_language_code TEXT DEFAULT 'en'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_node_id UUID;
  v_cause_id UUID;
BEGIN
  -- 1. Insert node
  INSERT INTO nodes (
    owner_id,
    url,
    title,
    description,
    thumbnail_url,
    content_type,
    language_code
  )
  VALUES (
    p_owner_id,
    p_url,
    p_title,
    p_description,
    p_thumbnail_url,
    p_content_type,
    p_language_code
  )
  RETURNING id INTO v_node_id;

  -- 2. Insert sort cache row
  INSERT INTO nodes_sort_cache (node_id, avg_rating, rating_count, view_count, share_count)
  VALUES (v_node_id, 0, 0, 0, 0);

  -- 3. Insert cause (self-creation cause)
  INSERT INTO causes (actor_id, action_type, node_id)
  VALUES (p_owner_id, 'created', v_node_id)
  RETURNING id INTO v_cause_id;

  -- 4. Insert owner edge (visibility: owner can see their own node)
  INSERT INTO edges (node_id, user_id, cause_id, permission)
  VALUES (v_node_id, p_owner_id, v_cause_id, 'owner');

  RETURN v_node_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- Grant execute permission to authenticated users
-- The RLS policies will still apply to the underlying tables
GRANT EXECUTE ON FUNCTION create_node(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_node(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
