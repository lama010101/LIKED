-- Migration 135: get_visible_tags ordered by most recent use.
-- The Chrome extension popup shows only the first 10 most recently used
-- tags. Recency = MAX(tag_edges.created_at) across nodes currently
-- visible to the caller (same join/filter as before; ordering replaces
-- the alphabetical ORDER BY from migration 094).
-- Tiebreak on label keeps the order deterministic.

CREATE OR REPLACE FUNCTION public.get_visible_tags(p_user_id uuid, p_language_code text DEFAULT 'en'::text)
 RETURNS TABLE(id uuid, color_hex text, label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND p_user_id IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;
  RETURN QUERY
  SELECT
    t.id,
    t.color_hex,
    tt.label
  FROM tag_edges te
  JOIN tags t ON t.id = te.tag_id
  JOIN tag_translations tt ON tt.tag_id = t.id AND tt.language_code = p_language_code
  JOIN nodes n ON n.id = te.node_id
  JOIN edges e ON e.node_id = n.id AND e.user_id = p_user_id
  WHERE n.deleted_at IS NULL
  GROUP BY t.id, t.color_hex, tt.label
  ORDER BY MAX(te.created_at) DESC, tt.label ASC;
END;
$function$;
