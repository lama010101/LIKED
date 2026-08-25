-- Migration 073 — Fix liked_tag_palette SECURITY DEFINER + GRANT EXECUTE
-- AUDIT-02 §2-B / §8 #16: liked_tag_palette was created in migration 019
-- as SECURITY INVOKER (no explicit DEFINER keyword) with no GRANT EXECUTE.
--
-- In practice this is low-risk because liked_tag_palette is a pure read-only
-- IMMUTABLE helper (returns a color from a static array) and is only called
-- from inside other SECURITY DEFINER functions (create_node_with_metadata,
-- create_node, import_url, create_folder) — when a DEFINER function calls
-- an INVOKER function, the inner function inherits the outer function's
-- privileges. So the INVOKER setting is effectively inert in current usage.
--
-- However, AUDIT-01 flagged it and TAD §7 mandates DEFINER for all functions
-- called from the application layer. This migration flips it to DEFINER and
-- adds the standard grants, following the same pattern as migration 035
-- (which fixed create_node and create_node_with_metadata).
--
-- No logic change — security mode and grants only.

ALTER FUNCTION liked_tag_palette(INT) SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION liked_tag_palette(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION liked_tag_palette(INT) TO service_role;
