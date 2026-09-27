-- ============================================================
-- Migration 127 — MVP2 P2-06: rate_folder
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Folder ratings are independent of card ratings (Q5): integer 0–100,
-- per (folder, user). Caller must be able to see the folder.
-- ============================================================
CREATE OR REPLACE FUNCTION public.rate_folder(p_folder_id UUID, p_score INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_avg NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'score must be an integer 0-100' USING ERRCODE = '22023';
  END IF;
  IF NOT public.folder_is_visible(p_folder_id, v_uid) THEN
    RAISE EXCEPTION 'folder not accessible' USING ERRCODE = '42501';
  END IF;
  INSERT INTO folder_ratings (folder_id, user_id, score, updated_at)
  VALUES (p_folder_id, v_uid, p_score, now())
  ON CONFLICT (folder_id, user_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
  SELECT AVG(score) INTO v_avg FROM folder_ratings WHERE folder_id = p_folder_id;
  RETURN v_avg;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_folder(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_folder(UUID, INTEGER) TO authenticated, service_role;
