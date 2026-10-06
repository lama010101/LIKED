-- ============================================================
-- Migration 141 — node_classifications + set_node_classifications
-- ============================================================
-- Per-user card classification for grouped search (theme/subtheme
-- from the OpenRouter classifier, channel_title from YouTube
-- oEmbed / hostname). One row per (node, owner): classifying a
-- card never mutates the node for anyone else.
--
-- Reads: direct SELECT under RLS (same pattern as folder_edges).
-- Writes: SECURITY DEFINER RPC only (repo write convention).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.node_classifications (
  node_id       UUID        NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  owner_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme         TEXT,
  subtheme      TEXT,
  channel_title TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (node_id, owner_id)
);

ALTER TABLE public.node_classifications ENABLE ROW LEVEL SECURITY;

-- Classifications are private per (node, user): read/write own rows only.
CREATE POLICY "node_classifications_select" ON public.node_classifications
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "node_classifications_insert" ON public.node_classifications
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "node_classifications_update" ON public.node_classifications
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "node_classifications_delete" ON public.node_classifications
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Bulk upsert for one classifier batch. p_items is a JSONB array of
-- {node_id, theme, subtheme, channel_title}; NULL/absent fields keep
-- the previous value (a channel-only backfill must not wipe a theme).
CREATE OR REPLACE FUNCTION public.set_node_classifications(p_owner_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item   JSONB;
  v_count  INTEGER := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO node_classifications (node_id, owner_id, theme, subtheme, channel_title)
    VALUES (
      (v_item->>'node_id')::uuid,
      p_owner_id,
      NULLIF(v_item->>'theme', ''),
      NULLIF(v_item->>'subtheme', ''),
      NULLIF(v_item->>'channel_title', '')
    )
    ON CONFLICT (node_id, owner_id) DO UPDATE SET
      theme         = COALESCE(EXCLUDED.theme, node_classifications.theme),
      subtheme      = COALESCE(EXCLUDED.subtheme, node_classifications.subtheme),
      channel_title = COALESCE(EXCLUDED.channel_title, node_classifications.channel_title),
      updated_at    = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_node_classifications(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_node_classifications(UUID, JSONB) TO authenticated, service_role;
