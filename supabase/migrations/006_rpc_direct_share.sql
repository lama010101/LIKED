-- ============================================================
-- RPC Function: direct_share
-- Atomic transaction for direct node sharing (P3-T01)
-- ============================================================
-- Creates exactly 1 cause and 2 edges per call
-- NOT idempotent by design - calling twice creates 2 causes, 4 edges
--
-- Constraints per PRD §6.1-6.4:
-- - Every edge has non-null cause_id (FK with ON DELETE CASCADE)
-- - No UNIQUE(node_id, user_id) on edges
-- - All writes in single atomic transaction
-- ============================================================

CREATE OR REPLACE FUNCTION direct_share(
  p_sharer_id UUID,
  p_node_id UUID,
  p_target_user_id UUID
)
RETURNS UUID  -- Returns the created cause_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cause_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Step 1: INSERT into causes
  INSERT INTO causes (
    id,
    cause_type,
    created_by,
    metadata,
    created_at
  ) VALUES (
    gen_random_uuid(),
    'direct_share',
    p_sharer_id,
    jsonb_build_object(
      'node_id', p_node_id,
      'target_user_id', p_target_user_id
    ),
    v_now
  )
  RETURNING id INTO v_cause_id;

  -- Step 2: INSERT received edge for target user
  INSERT INTO edges (
    id,
    node_id,
    user_id,
    cause_id,
    sender_id,
    direction,
    depth,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_node_id,
    p_target_user_id,
    v_cause_id,
    p_sharer_id,
    'received',
    1,
    v_now
  );

  -- Step 3: INSERT sent edge for sharer (reciprocal)
  INSERT INTO edges (
    id,
    node_id,
    user_id,
    cause_id,
    sender_id,
    direction,
    depth,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_node_id,
    p_sharer_id,
    v_cause_id,
    p_sharer_id,
    'sent',
    1,
    v_now
  );

  -- Return the cause_id for reference
  RETURN v_cause_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION direct_share(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION direct_share(UUID, UUID, UUID) TO service_role;
