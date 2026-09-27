-- ============================================================
-- Phase 12 (P12): drop superseded RPCs. Every call site was
-- removed or converted in Phases 0-11; the old UI/lib code that
-- referenced them is archived under _archive/ (Q8 — preserved,
-- not deleted, and unreachable from the live build).
--
-- Replacement map:
--   share_folder              → share_folder_v2        (P2, F2)
--   delete_folder             → trash_folder           (P2, F5)
--   get_folder_access_users   → get_folder_access      (P3, F1)
--   get_folder_memberships    → get_folder children/members (P3)
--   get_social_timeline       → get_folders/get_feed   (P3, F13)
--   revoke_folder_admin       → revoke_folder_grant    (P2)
--   unshare_folder_op         → revoke_folder_grant    (P2)
--   revoke_group_admin        → remove_group_member    (P2)
--   direct_share / group_share→ share_node             (P2)
--   group_unshare             → snapshot grant revoke  (P2, Q4)
--   get_or_create_unsorted_folder / get_or_create_named_folder
--                           → get_or_create_system_folder (P2)
--
-- Kept intentionally (still referenced by live code):
--   unshare, change_node_permission, create_group,
--   add_group_member, remove_group_member, delete_group,
--   create_folder_template (folder-template feature flag),
--   get_folder_tree (131), all Phase 2/3 RPCs.
-- ============================================================

DROP FUNCTION IF EXISTS public.share_folder(UUID, UUID, UUID[], TEXT);
DROP FUNCTION IF EXISTS public.delete_folder(UUID);
DROP FUNCTION IF EXISTS public.get_folder_access_users(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_folder_memberships(UUID);
DROP FUNCTION IF EXISTS public.get_social_timeline(UUID, TEXT, TIMESTAMPTZ, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.revoke_folder_admin(UUID, UUID);
DROP FUNCTION IF EXISTS public.unshare_folder_op(TEXT, UUID);
DROP FUNCTION IF EXISTS public.revoke_group_admin(UUID, UUID);
DROP FUNCTION IF EXISTS public.direct_share(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.group_share(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.group_unshare(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.get_or_create_unsorted_folder(UUID);
DROP FUNCTION IF EXISTS public.get_or_create_named_folder(UUID, TEXT, TEXT);
