-- Migration 039: Add atomic RPCs for card detail operations
-- Replaces split SELECT + UPDATE patterns with single atomic operations

CREATE OR REPLACE FUNCTION public.update_node_title(
  p_user_id uuid,
  p_node_id uuid,
  p_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title text;
BEGIN
  -- Verify caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM nodes
    WHERE id = p_node_id AND owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Not owner';
  END IF;

  -- Trim and validate title length
  v_title := trim(p_title);
  IF length(v_title) = 0 OR length(v_title) > 512 THEN
    RAISE EXCEPTION 'Invalid title';
  END IF;

  -- Update title
  UPDATE nodes
  SET title = v_title
  WHERE id = p_node_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_node_title TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_view_count(
  p_node_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Single atomic UPSERT: insert with view_count=1 on first view,
  -- otherwise increment existing row
  INSERT INTO nodes_sort_cache (node_id, view_count, share_count, updated_at)
  VALUES (p_node_id, 1, 0, now())
  ON CONFLICT (node_id)
  DO UPDATE SET
    view_count = nodes_sort_cache.view_count + 1,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_view_count TO authenticated;
