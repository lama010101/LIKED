-- ============================================================
-- Migration 138 — AUDIT-09 P3-4: update_node_text RPC
-- ============================================================
-- updateNodeText wrote nodes.text_content via a direct table update
-- on the service client while its sibling updateNodeTitle goes
-- through update_node_title. Same owner guard + validation, moved
-- into the RPC layer where writes belong.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_node_text(
  p_user_id uuid,
  p_node_id uuid,
  p_text    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_text text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;

  -- Verify caller is owner
  IF NOT EXISTS (
    SELECT 1 FROM nodes
    WHERE id = p_node_id AND owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Not owner';
  END IF;

  -- Trim and validate (matches the previous TS-side check)
  v_text := trim(p_text);
  IF length(v_text) = 0 OR length(v_text) > 20000 THEN
    RAISE EXCEPTION 'Invalid text';
  END IF;

  UPDATE nodes
  SET text_content = v_text
  WHERE id = p_node_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_node_text(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_node_text(uuid, uuid, text) FROM PUBLIC, anon;
