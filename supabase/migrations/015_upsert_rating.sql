-- ============================================================
-- RPC Function: upsert_rating
-- Atomic rating upsert + nodes_sort_cache.avg_rating refresh
-- P6-T02
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_rating(
  p_user_id  UUID,
  p_node_id  UUID,
  p_score    NUMERIC(3,1)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate score
  IF p_score < 0 OR p_score > 10 OR (p_score * 2) != FLOOR(p_score * 2) THEN
    RAISE EXCEPTION 'score must be 0-10 in steps of 0.5';
  END IF;

  -- UPSERT into ratings
  INSERT INTO ratings (user_id, node_id, score)
  VALUES (p_user_id, p_node_id, p_score)
  ON CONFLICT (node_id, user_id) DO UPDATE SET score = EXCLUDED.score;

  -- UPDATE nodes_sort_cache.avg_rating atomically
  INSERT INTO nodes_sort_cache (node_id, avg_rating)
  VALUES (
    p_node_id,
    (SELECT AVG(score) FROM ratings WHERE node_id = p_node_id)
  )
  ON CONFLICT (node_id) DO UPDATE
    SET avg_rating = (SELECT AVG(score) FROM ratings WHERE node_id = p_node_id),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_rating(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_rating(UUID, UUID, NUMERIC) TO service_role;
