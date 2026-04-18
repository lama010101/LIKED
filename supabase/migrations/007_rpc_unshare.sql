-- ============================================================
-- RPC Function: unshare
-- Deterministic cause deletion with cascade to edges (P3-T02)
-- ============================================================
-- - Verifies cause ownership before deletion
-- - DELETE cause → ON DELETE CASCADE removes all associated edges
-- - No path checks, no "other edges remaining" logic
--
-- Constraints per PRD §6.1-6.4 and invariant I-06:
-- - Pure deterministic deletion
-- - Cause deletion is the sole mechanism for edge removal
-- ============================================================

CREATE OR REPLACE FUNCTION unshare(
  p_cause_id UUID,
  p_requesting_user_id UUID
)
RETURNS BOOLEAN  -- Returns true if deletion occurred
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_created_by UUID;
  v_cause_exists BOOLEAN;
BEGIN
  -- Step 1: Verify cause exists and get ownership
  SELECT created_by INTO v_cause_created_by
  FROM causes
  WHERE id = p_cause_id;

  v_cause_exists := FOUND;

  -- Step 2: Authorization check
  IF NOT v_cause_exists THEN
    RAISE EXCEPTION 'Cause % not found', p_cause_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_cause_created_by != p_requesting_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cause % was created by %, not %',
      p_cause_id, v_cause_created_by, p_requesting_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 3: DELETE the cause - edges cascade automatically via FK
  DELETE FROM causes WHERE id = p_cause_id;

  -- Return true to indicate successful deletion
  RETURN true;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION unshare(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unshare(UUID, UUID) TO service_role;
