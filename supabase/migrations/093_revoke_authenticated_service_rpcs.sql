-- ============================================================
-- Migration 093 — AUDIT-08 defense-in-depth: revoke authenticated EXECUTE
-- ============================================================
-- The app only calls these functions with the SERVICE-ROLE client
-- (lib/db/*.ts → getSupabaseServiceClient) or from within other SECURITY
-- DEFINER functions that run as the function owner. The authenticated role
-- never needs direct EXECUTE. Revoking it shrinks the attack surface
-- (least privilege) on top of the auth.uid() gates from migration 092.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_node_with_metadata(p_owner_id uuid, p_url text, p_text_content text, p_title text, p_thumbnail_key text, p_language_code text, p_tag_labels text[], p_description text, p_auto_folder_name text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.import_url(p_owner_id uuid, p_url text, p_title text, p_thumbnail_key text, p_language_code text, p_description text, p_new_tag_labels text[], p_existing_tag_ids uuid[], p_folder_id uuid, p_note text, p_auto_folder_name text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hard_delete_node(p_node_id uuid, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.direct_share(p_sharer_id uuid, p_node_id uuid, p_target_user_id uuid, p_permission text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.group_share(p_sharer_id uuid, p_node_id uuid, p_group_id uuid, p_permission text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.share_folder(p_sharer_id uuid, p_folder_id uuid, p_target_user_ids uuid[], p_permission text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.group_unshare(p_sharer_id uuid, p_node_id uuid, p_group_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_group(p_owner_id uuid, p_name text, p_member_ids uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_folder(p_folder_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_node_to_folder(p_node_id uuid, p_folder_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_node_from_folder(p_node_id uuid, p_folder_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.move_folder(p_folder_id uuid, p_new_parent_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_custom_order(p_user_id uuid, p_scope_key text, p_node_ids uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_tag_with_translation(p_color text, p_label text, p_lang text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.unshare_folder_op(p_folder_share_op_id text, p_requesting_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_rating(p_user_id uuid, p_node_id uuid, p_score numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_node_title(p_user_id uuid, p_node_id uuid, p_title text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_display_name(p_user_id uuid, p_display_name text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_display_name(p_user_id uuid, p_display_name text, p_normalized text, p_old_display_name text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_avatar_key(p_user_id uuid, p_avatar_key text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_avatar_key(p_user_id uuid, p_avatar_key text, p_new_count integer, p_today text) FROM authenticated;