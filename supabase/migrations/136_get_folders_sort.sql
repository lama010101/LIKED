-- ============================================================
-- Migration 136 — AUDIT-09 P2-1 (follow-on): p_sort for get_folders
-- ============================================================
-- FolderRail re-sorted the rail client-side ('created' = created_at
-- DESC, 'alpha' = name ASC — the latter duplicating the SQL default).
-- Sorting is DB logic: p_sort='created' orders newest-first; every
-- other value keeps the existing name ordering (system folders last).
-- The old 4-arg signature is dropped so PostgREST has one overload.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_folders(uuid, text, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.get_folders(
  p_parent_folder_id uuid DEFAULT NULL::uuid,
  p_search           text DEFAULT NULL::text,
  p_tag_ids          uuid[] DEFAULT NULL::uuid[],
  p_friend_id        uuid DEFAULT NULL::uuid,
  p_sort             text DEFAULT 'name'
)
RETURNS TABLE(
  id uuid, name text, description text, owner_id uuid, owner_name text,
  parent_folder_id uuid, color_hex text, system_kind text,
  created_at timestamptz, my_permission text, is_shared boolean,
  node_count bigint, thumbnails jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT f.id, f.name, f.description, f.owner_id, u.display_name,
         f.parent_folder_id, f.color_hex, f.system_kind, f.created_at,
         public.effective_folder_permission(f.id, v_uid) AS my_permission,
         EXISTS (SELECT 1 FROM folder_grants g WHERE g.folder_id = f.id) AS is_shared,
         (SELECT COUNT(*) FROM folder_edges fe
            JOIN nodes n2 ON n2.id = fe.node_id AND n2.deleted_at IS NULL
           WHERE fe.folder_id = f.id) AS node_count,
         COALESCE((SELECT jsonb_agg(th) FROM (
             SELECT DISTINCT n3.thumbnail_key AS th
               FROM folder_edges fe2 JOIN nodes n3 ON n3.id = fe2.node_id
              WHERE fe2.folder_id = f.id AND n3.thumbnail_key IS NOT NULL AND n3.deleted_at IS NULL
              LIMIT 4) t), '[]'::jsonb) AS thumbnails
    FROM folders f
    JOIN users u ON u.id = f.owner_id
   WHERE f.deleted_at IS NULL
     AND (f.owner_id = v_uid
          OR EXISTS (SELECT 1 FROM edges e WHERE e.folder_id = f.id AND e.user_id = v_uid))
     AND NOT public._blocked_pair(v_uid, f.owner_id)
     AND (p_parent_folder_id IS NULL OR f.parent_folder_id = p_parent_folder_id)
     AND (p_search IS NULL OR f.name ILIKE '%' || p_search || '%' OR f.description ILIKE '%' || p_search || '%')
     AND (p_tag_ids IS NULL OR EXISTS (
            SELECT 1 FROM tag_edges te WHERE te.folder_id = f.id AND te.tag_id = ANY(p_tag_ids)))
     AND (p_friend_id IS NULL OR f.owner_id = p_friend_id)
   ORDER BY f.system_kind IS NOT NULL DESC,
            CASE WHEN p_sort = 'created' THEN f.created_at END DESC NULLS LAST,
            CASE WHEN p_sort IS DISTINCT FROM 'created' THEN f.name END ASC NULLS LAST,
            f.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_folders(uuid, text, uuid[], uuid, text) TO authenticated, service_role;

-- Supabase default privileges auto-grant EXECUTE to PUBLIC/anon on
-- creation; match the established grant surface (authenticated only).
REVOKE EXECUTE ON FUNCTION public.get_folders(uuid, text, uuid[], uuid, text) FROM PUBLIC, anon;
