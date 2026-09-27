-- ============================================================
-- Migration 131 — MVP2 Phase 3: folder/notification/trash/organize read RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Folder reads are separate RPCs (Q12): get_feed's shape is untouched and
-- folder results are rendered in their own section. Access/recipient lists
-- are OWNER-ONLY (Q20). All reads enforce edge-based visibility server-side.
-- ============================================================

-- ── get_folders: every live folder visible to the caller ──
--   p_parent_folder_id: when set, restrict to its direct children
--   p_search: name/description ILIKE
--   p_tag_ids: folders carrying any of those folder tags
--   p_friend_id: only folders owned by that friend (Q19 semantics)
CREATE OR REPLACE FUNCTION public.get_folders(
  p_parent_folder_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_friend_id UUID DEFAULT NULL
) RETURNS TABLE(
  id uuid, name text, description text, owner_id uuid, owner_name text,
  parent_folder_id uuid, color_hex text, system_kind text, created_at timestamptz,
  my_permission text, is_shared boolean, node_count bigint, thumbnails jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
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
   ORDER BY f.system_kind IS NOT NULL DESC, f.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_folders(UUID, TEXT, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_folders(UUID, TEXT, UUID[], UUID) TO authenticated, service_role;

-- ── get_folder: detail + breadcrumb + children + visible member nodes ──
CREATE OR REPLACE FUNCTION public.get_folder(p_folder_id UUID)
RETURNS TABLE(
  id uuid, name text, description text, owner_id uuid, owner_name text,
  parent_folder_id uuid, color_hex text, system_kind text, created_at timestamptz,
  my_permission text, is_shared boolean,
  breadcrumb jsonb, children jsonb, node_ids uuid[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.folder_is_visible(p_folder_id, v_uid) THEN
    RAISE EXCEPTION 'folder not accessible' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT f.id, f.name, f.description, f.owner_id, u.display_name,
         f.parent_folder_id, f.color_hex, f.system_kind, f.created_at,
         public.effective_folder_permission(f.id, v_uid),
         EXISTS (SELECT 1 FROM folder_grants g WHERE g.folder_id = f.id),
         -- breadcrumb: ancestors root→parent (exclude self row)
         COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name)
                                  ORDER BY bt.depth DESC)
            FROM folder_tree bt JOIN folders b ON b.id = bt.ancestor_id
           WHERE bt.folder_id = f.id AND bt.ancestor_id <> f.id AND b.deleted_at IS NULL),
          '[]'::jsonb),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'color_hex', c.color_hex,
                                                     'system_kind', c.system_kind)
                                  ORDER BY c.name)
            FROM folders c
           WHERE c.parent_folder_id = f.id AND c.deleted_at IS NULL
             AND public.folder_is_visible(c.id, v_uid)),
          '[]'::jsonb),
         COALESCE((SELECT array_agg(fe.node_id)
            FROM folder_edges fe JOIN nodes n ON n.id = fe.node_id
           WHERE fe.folder_id = f.id AND n.deleted_at IS NULL
             AND public._node_visible(n.id, v_uid)),
          '{}'::uuid[])
    FROM folders f JOIN users u ON u.id = f.owner_id
   WHERE f.id = p_folder_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_folder(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_folder(UUID) TO authenticated, service_role;

-- ── access lists: OWNER ONLY (Q20) ──
CREATE OR REPLACE FUNCTION public.get_folder_access(p_folder_id UUID)
RETURNS TABLE(grantee_id uuid, display_name text, avatar_key text, permission text, granted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM folders WHERE id = p_folder_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'owner only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.grantee_id, u.display_name, u.avatar_key, g.permission, g.created_at
    FROM folder_grants g JOIN users u ON u.id = g.grantee_id
   WHERE g.folder_id = p_folder_id
   ORDER BY u.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_folder_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_folder_access(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_node_access(p_node_id UUID)
RETURNS TABLE(user_id uuid, display_name text, avatar_key text, permission text, cause_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM nodes WHERE id = p_node_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'owner only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT DISTINCT e.user_id, u.display_name, u.avatar_key, e.permission, e.cause_id, e.created_at
    FROM edges e
    JOIN causes c ON c.id = e.cause_id
    JOIN users u ON u.id = e.user_id
   WHERE e.node_id = p_node_id AND e.direction = 'received'
   ORDER BY u.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_node_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_node_access(UUID) TO authenticated, service_role;

-- ── trash listing (own items) ──
CREATE OR REPLACE FUNCTION public.get_trash_items()
RETURNS TABLE(item_type text, id uuid, title text, thumbnail_key text, trash_batch_id uuid, deleted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT 'node', n.id, n.title, n.thumbnail_key, n.trash_batch_id, n.deleted_at
    FROM nodes n WHERE n.owner_id = v_uid AND n.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'folder', f.id, f.name, NULL, f.trash_batch_id, f.deleted_at
    FROM folders f WHERE f.owner_id = v_uid AND f.deleted_at IS NOT NULL
  ORDER BY deleted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trash_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trash_items() TO authenticated, service_role;

-- ── notifications (own, newest first) ──
CREATE OR REPLACE FUNCTION public.list_notifications(p_limit INT DEFAULT 50, p_before TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE(id uuid, type text, payload jsonb, read boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT n.id, n.type, n.payload, n.read, n.created_at
    FROM notifications n
   WHERE n.user_id = v_uid
     AND (p_before IS NULL OR n.created_at < p_before)
   ORDER BY n.created_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.list_notifications(INT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_notifications(INT, TIMESTAMPTZ) TO authenticated, service_role;

-- ── organize batches + items ──
CREATE OR REPLACE FUNCTION public.get_organize_batches()
RETURNS TABLE(id uuid, source_folder_id uuid, source_folder_name text, status text,
              item_count bigint, proposed_count bigint, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT b.id, b.source_folder_id, f.name, b.status,
         (SELECT COUNT(*) FROM organize_items i WHERE i.batch_id = b.id),
         (SELECT COUNT(*) FROM organize_items i WHERE i.batch_id = b.id AND i.status = 'proposed'),
         b.created_at
    FROM organize_batches b JOIN folders f ON f.id = b.source_folder_id
   WHERE b.user_id = v_uid
   ORDER BY b.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organize_batches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organize_batches() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_organize_batch(p_batch_id UUID)
RETURNS TABLE(item_id uuid, node_id uuid, node_title text, node_thumbnail text,
              status text, target_folder_id uuid, target_folder_name text,
              new_folder_name text, tag_labels text[], reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organize_batches WHERE id = p_batch_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'batch not found' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT i.id, i.node_id, n.title, n.thumbnail_key, i.status,
         i.target_folder_id, tf.name, i.new_folder_name, i.tag_labels, i.reason
    FROM organize_items i
    JOIN nodes n ON n.id = i.node_id
    LEFT JOIN folders tf ON tf.id = i.target_folder_id
   WHERE i.batch_id = p_batch_id
   ORDER BY i.status, n.title;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organize_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organize_batch(UUID) TO authenticated, service_role;

-- ── get_folder_tree: widen to edge-visible folders + new columns ──
DROP FUNCTION IF EXISTS public.get_folder_tree(UUID);
CREATE OR REPLACE FUNCTION public.get_folder_tree(p_user_id UUID)
RETURNS TABLE(id uuid, name text, description text, owner_id uuid, owner_name text,
              parent_folder_id uuid, is_project boolean, color_hex text,
              system_kind text, deleted_at timestamptz, created_at timestamptz,
              my_permission text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT f.id, f.name, f.description, f.owner_id, u.display_name,
         f.parent_folder_id, (f.parent_folder_id IS NULL), f.color_hex,
         f.system_kind, f.deleted_at, f.created_at,
         public.effective_folder_permission(f.id, p_user_id)
    FROM folders f JOIN users u ON u.id = f.owner_id
   WHERE f.deleted_at IS NULL
     AND (f.owner_id = p_user_id
          OR EXISTS (SELECT 1 FROM edges e WHERE e.folder_id = f.id AND e.user_id = p_user_id))
     AND NOT public._blocked_pair(p_user_id, f.owner_id)
   ORDER BY (f.parent_folder_id IS NULL) DESC, f.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_folder_tree(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_folder_tree(UUID) TO authenticated, service_role;
