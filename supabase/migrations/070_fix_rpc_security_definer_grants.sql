-- Migration 070 — Fix SECURITY DEFINER + GRANT EXECUTE on three write RPCs
-- AUDIT-02 §2-C: set_node_deleted, rename_folder, create_tag_with_translation
-- were created (migrations 026/027/028) without SECURITY DEFINER or GRANT EXECUTE.
-- They run as INVOKER and are not callable by the `authenticated` role.
--
-- Pattern follows migration 035 (which fixed create_node and
-- create_node_with_metadata the same way).
--
-- No logic changes — security mode and grants only.

ALTER FUNCTION set_node_deleted(UUID, BOOLEAN) SECURITY DEFINER;
ALTER FUNCTION rename_folder(UUID, TEXT) SECURITY DEFINER;
ALTER FUNCTION create_tag_with_translation(TEXT, TEXT, TEXT) SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_node_deleted(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION set_node_deleted(UUID, BOOLEAN) TO service_role;

GRANT EXECUTE ON FUNCTION rename_folder(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rename_folder(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION create_tag_with_translation(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tag_with_translation(TEXT, TEXT, TEXT) TO service_role;
