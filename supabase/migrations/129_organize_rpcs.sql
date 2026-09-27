-- ============================================================
-- Migration 129 — MVP2 P2-08 (Q2, Q16, F12): organize RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- create_organize_batch snapshots the caller's own live nodes in the source
-- folder as 'pending' items. set_organize_item_proposal records an LLM
-- proposal. apply_organization_batch MOVES selected items out of the source
-- folder into the target (Q16) — membership swap + grant revoke/expand +
-- tag application are atomic. Unprocessed leftovers ('pending'/'failed')
-- are deleted at apply so the next batch re-proposes them (Q2 re-run);
-- 'skipped' persists so declined proposals are not re-suggested.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_organize_batch(p_source_folder_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM folders WHERE id = p_source_folder_id AND owner_id = v_uid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'source folder not found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO organize_batches (user_id, source_folder_id) VALUES (v_uid, p_source_folder_id)
  RETURNING id INTO v_batch;

  INSERT INTO organize_items (batch_id, node_id)
  SELECT v_batch, fe.node_id
    FROM folder_edges fe
    JOIN nodes n ON n.id = fe.node_id
   WHERE fe.folder_id = p_source_folder_id
     AND n.deleted_at IS NULL
     AND n.owner_id = v_uid
     AND NOT EXISTS (
       SELECT 1 FROM organize_items i
        JOIN organize_batches b ON b.id = i.batch_id
        WHERE i.node_id = fe.node_id AND b.user_id = v_uid
          AND (b.status = 'open' OR i.status IN ('skipped', 'applied')));

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organize_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organize_batch(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_organize_item_proposal(
  p_batch_id UUID,
  p_node_id UUID,
  p_target_folder_id UUID DEFAULT NULL,
  p_new_folder_name TEXT DEFAULT NULL,
  p_tag_labels TEXT[] DEFAULT '{}',
  p_reason TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'proposed'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner FROM organize_batches WHERE id = p_batch_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found or not open' USING ERRCODE = '42501'; END IF;
  IF NOT (auth.role() = 'service_role' OR v_owner = auth.uid()) THEN
    RAISE EXCEPTION 'not the batch owner' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('proposed', 'failed') THEN
    RAISE EXCEPTION 'invalid item status' USING ERRCODE = '22023';
  END IF;
  IF p_target_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM folders WHERE id = p_target_folder_id AND owner_id = v_owner AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'target folder not found' USING ERRCODE = '22023';
  END IF;
  IF p_new_folder_name IS NOT NULL AND length(btrim(p_new_folder_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid folder name' USING ERRCODE = '22023';
  END IF;

  UPDATE organize_items
     SET status = p_status,
         target_folder_id = CASE WHEN p_status = 'failed' THEN NULL ELSE p_target_folder_id END,
         new_folder_name = NULLIF(btrim(COALESCE(p_new_folder_name, '')), ''),
         tag_labels = COALESCE(p_tag_labels, '{}'),
         reason = p_reason,
         updated_at = now()
   WHERE batch_id = p_batch_id AND node_id = p_node_id AND status IN ('pending', 'failed', 'proposed');
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found' USING ERRCODE = '22023'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organize_item_proposal(UUID, UUID, UUID, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organize_item_proposal(UUID, UUID, UUID, TEXT, TEXT[], TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_organization_batch(p_batch_id UUID, p_item_ids UUID[])
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch organize_batches%ROWTYPE;
  i RECORD;
  v_target UUID;
  v_label TEXT;
  v_tag_id UUID;
  v_tag_count BIGINT;
  v_color TEXT;
  v_lang TEXT;
  v_applied INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM organize_batches WHERE id = p_batch_id AND user_id = v_uid AND status = 'open'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found or not open' USING ERRCODE = '42501'; END IF;

  FOR i IN SELECT * FROM organize_items WHERE batch_id = p_batch_id LOOP
    IF i.id = ANY(COALESCE(p_item_ids, '{}')) AND i.status = 'proposed' THEN
      -- resolve target folder (existing or new top-level folder)
      v_target := i.target_folder_id;
      IF v_target IS NULL AND i.new_folder_name IS NOT NULL THEN
        v_target := public.get_or_create_named_folder(v_uid, i.new_folder_name, NULL);
      END IF;
      IF v_target IS NULL THEN
        UPDATE organize_items SET status = 'failed', reason = 'no target folder', updated_at = now()
         WHERE id = i.id;
        CONTINUE;
      END IF;

      -- Q16 move: remove source membership + revoke its grant causes, then
      -- insert target membership + expand covering grants
      DELETE FROM folder_edges
       WHERE node_id = i.node_id AND folder_id = v_batch.source_folder_id;
      IF FOUND THEN
        PERFORM public._revoke_folder_grants_for_node(i.node_id, v_batch.source_folder_id);
      END IF;
      INSERT INTO folder_edges (node_id, folder_id, added_by)
      VALUES (i.node_id, v_target, v_uid)
      ON CONFLICT (node_id, folder_id) DO NOTHING;
      PERFORM public._expand_folder_grants_for_node(i.node_id, v_target, v_uid);

      -- apply proposed tags (same lookup-or-create pattern as import_url)
      SELECT language_code INTO v_lang FROM nodes WHERE id = i.node_id;
      FOREACH v_label IN ARRAY i.tag_labels LOOP
        v_label := trim(v_label);
        CONTINUE WHEN v_label IS NULL OR v_label = '';
        SELECT tag_id INTO v_tag_id FROM tag_translations
         WHERE language_code = v_lang AND label = v_label LIMIT 1;
        IF v_tag_id IS NULL THEN
          SELECT COUNT(*) INTO v_tag_count FROM tags;
          v_color := liked_tag_palette(v_tag_count::INT);
          INSERT INTO tags (color_hex) VALUES (v_color) RETURNING id INTO v_tag_id;
          BEGIN
            INSERT INTO tag_translations (tag_id, language_code, label) VALUES (v_tag_id, v_lang, v_label);
          EXCEPTION WHEN unique_violation THEN
            DELETE FROM tags WHERE id = v_tag_id;
            SELECT tag_id INTO v_tag_id FROM tag_translations
             WHERE language_code = v_lang AND label = v_label LIMIT 1;
          END;
        END IF;
        INSERT INTO tag_edges (tag_id, node_id, folder_id) VALUES (v_tag_id, i.node_id, NULL)
        ON CONFLICT DO NOTHING;
      END LOOP;

      UPDATE organize_items SET status = 'applied', target_folder_id = v_target, updated_at = now()
       WHERE id = i.id;
      v_applied := v_applied + 1;
    ELSIF i.status = 'proposed' THEN
      UPDATE organize_items SET status = 'skipped', updated_at = now() WHERE id = i.id;
    ELSE
      -- pending/failed leftovers are re-proposed by the next batch (Q2)
      DELETE FROM organize_items WHERE id = i.id;
    END IF;
  END LOOP;

  UPDATE organize_batches SET status = 'applied', applied_at = now() WHERE id = p_batch_id;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_organization_batch(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_organization_batch(UUID, UUID[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.discard_organization_batch(p_batch_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM organize_batches WHERE id = p_batch_id AND user_id = v_uid AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found or not open' USING ERRCODE = '42501'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.discard_organization_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_organization_batch(UUID) TO authenticated, service_role;
