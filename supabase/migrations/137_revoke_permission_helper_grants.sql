-- ============================================================
-- Migration 137 — AUDIT-09 P3-1: revoke helper grants
-- ============================================================
-- effective_folder_permission / effective_node_permission /
-- folder_is_visible take a caller-supplied p_user_id with no
-- auth.uid() gate. Any authenticated caller could probe arbitrary
-- (user, folder|node) permission pairs — a metadata leak.
-- No RLS policy references them and no app code calls them, so
-- the authenticated grant is unjustified. Internal SECURITY
-- DEFINER callers (get_folders, move_node_to_folder, ...) are
-- unaffected — those execute as the function owner.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.effective_folder_permission(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.effective_node_permission(uuid, uuid)   FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.folder_is_visible(uuid, uuid)           FROM authenticated;
