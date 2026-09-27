-- ============================================================
-- Migration 118 — MVP2 P1-05 (Q5, T0-15): ratings 0–100 integer + folder ratings
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- One migration so no dual scale can exist:
--   1. drop the 0–10/0.5 CHECK
--   2. migrate the existing node ratings ×10 (0–10 → 0–100)
--   3. add the 0–100 integer CHECK
--   4. recompute nodes_sort_cache.avg_rating from the migrated rows
--   5. replace upsert_rating: auth.uid() inside, visibility-gated, 0–100 int
-- Folder ratings are independent of card ratings (not an aggregate).
-- ============================================================

ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS ratings_score_check;

UPDATE public.ratings SET score = round(score * 10);

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_score_check CHECK (score >= 0 AND score <= 100 AND score = trunc(score));

UPDATE public.nodes_sort_cache nsc
   SET avg_rating = sub.avg, updated_at = now()
  FROM (SELECT node_id, AVG(score) AS avg FROM public.ratings GROUP BY node_id) sub
 WHERE sub.node_id = nsc.node_id;

DROP FUNCTION IF EXISTS public.upsert_rating(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.upsert_rating(p_node_id UUID, p_score INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_avg NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_score IS NULL OR p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'score must be an integer 0-100' USING ERRCODE = '22023';
  END IF;
  IF NOT _node_visible(p_node_id, v_uid) THEN
    RAISE EXCEPTION 'node not accessible' USING ERRCODE = '42501';
  END IF;

  INSERT INTO ratings (user_id, node_id, score, updated_at)
  VALUES (v_uid, p_node_id, p_score, now())
  ON CONFLICT (node_id, user_id) DO UPDATE SET score = EXCLUDED.score, updated_at = now();

  SELECT AVG(score) INTO v_avg FROM ratings WHERE node_id = p_node_id;

  INSERT INTO nodes_sort_cache (node_id, avg_rating, updated_at)
  VALUES (p_node_id, v_avg, now())
  ON CONFLICT (node_id) DO UPDATE SET avg_rating = v_avg, updated_at = now();

  RETURN v_avg;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_rating(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_rating(UUID, INTEGER) TO authenticated, service_role;

-- ── folder ratings (independent per-user rating of the folder itself) ──
CREATE TABLE IF NOT EXISTS public.folder_ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id  UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT folder_ratings_folder_user_uniq UNIQUE (folder_id, user_id)
);

ALTER TABLE public.folder_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY folder_ratings_select_own ON public.folder_ratings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
