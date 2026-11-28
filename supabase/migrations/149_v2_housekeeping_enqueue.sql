-- ============================================================
-- Migration 149 — v2 housekeeping global enrichment enqueue
-- (PLAN-V2-002 §6.5, P0-22; DRAFT for V2-W5-PIPELINE-1125-002)
-- ============================================================
-- Class S (server-only): SECURITY DEFINER, search_path=public,
-- auth.role() guard first, EXECUTE revoked from PUBLIC/anon/
-- authenticated and granted to service_role only.
--
-- This is the global counterpart of migration 145's
-- enqueue_stale_enrichment(). The candidate, stale and cap rules
-- are the same, but the item scope is every owner's
-- recommendations instead of auth.uid(). Migration 145 is not
-- edited: sharing its body would require changing an existing
-- migration, so the duplication is a documented known risk.
-- ============================================================

CREATE FUNCTION public.enrichment_enqueue_stale(
  p_youtube_days integer DEFAULT 20,
  p_tmdb_days    integer DEFAULT 150,
  p_limit        integer DEFAULT 200
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_enqueued integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  WITH owner_item_prefs AS (
    SELECT DISTINCT
           r.item_id,
           COALESCE(up.tmdb_lang, 'en-US') AS tag,
           COALESCE(up.region_code, 'US') AS region
      FROM public.recommendations r
      LEFT JOIN public.user_prefs up ON up.user_id = r.owner_id
  ),
  item_scope AS (
    SELECT DISTINCT i.id,
           oip.tag,
           oip.region,
           (i.fetched_at IS NULL
            OR (i.source = 'youtube' AND i.fetched_at < now() - (COALESCE(p_youtube_days, 20)::text || ' days')::interval)
            OR (i.source = 'tmdb'    AND i.fetched_at < now() - (COALESCE(p_tmdb_days, 150)::text || ' days')::interval)) AS stale
      FROM public.items i
      JOIN owner_item_prefs oip ON oip.item_id = i.id
     WHERE i.enrichment_status IN ('pending', 'partial')
        OR i.fetched_at IS NULL
        OR (i.source = 'youtube' AND i.fetched_at < now() - (COALESCE(p_youtube_days, 20)::text || ' days')::interval)
        OR (i.source = 'tmdb'    AND i.fetched_at < now() - (COALESCE(p_tmdb_days, 150)::text || ' days')::interval)
  ),
  candidates AS (
    SELECT si.id AS item_id, 'details' AS job_kind, si.tag AS param
    FROM item_scope si
    WHERE si.stale
      AND NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                       WHERE j.item_id = si.id AND j.job_kind = 'details' AND j.param = si.tag
                         AND (j.status IN ('pending', 'processing')
                              OR (j.status = 'failed' AND j.run_after >= now() - interval '1 day')))
    UNION ALL
    SELECT si.id, 'availability', si.region
    FROM item_scope si
    WHERE si.stale
      AND NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                       WHERE j.item_id = si.id AND j.job_kind = 'availability' AND j.param = si.region
                         AND (j.status IN ('pending', 'processing')
                              OR (j.status = 'failed' AND j.run_after >= now() - interval '1 day')))
    UNION ALL
    SELECT si.id, 'details', si.tag
    FROM item_scope si
    WHERE NOT si.stale
      AND NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                       WHERE j.item_id = si.id AND j.job_kind = 'details' AND j.param = si.tag)
    UNION ALL
    SELECT si.id, 'availability', si.region
    FROM item_scope si
    WHERE NOT si.stale
      AND NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                       WHERE j.item_id = si.id AND j.job_kind = 'availability' AND j.param = si.region)
  ),
  distinct_candidates AS (
    SELECT DISTINCT c.item_id, c.job_kind, c.param
    FROM candidates c
  ),
  picked AS (
    SELECT dc.item_id, dc.job_kind, dc.param
    FROM distinct_candidates dc
    ORDER BY dc.item_id, CASE dc.job_kind WHEN 'details' THEN 0 ELSE 1 END
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  )
  INSERT INTO public.enrichment_jobs (item_id, job_kind, param)
  SELECT p.item_id, p.job_kind, p.param FROM picked p
  ON CONFLICT (item_id, job_kind, param) DO UPDATE SET
    status     = 'pending',
    attempts   = 0,
    run_after  = now(),
    last_error = NULL,
    locked_at  = NULL
  WHERE enrichment_jobs.status = 'done'
     OR (enrichment_jobs.status = 'failed'
         AND enrichment_jobs.run_after < now() - interval '1 day');
  GET DIAGNOSTICS v_enqueued = ROW_COUNT;
  RETURN v_enqueued;
END;
$function$;

REVOKE ALL ON FUNCTION public.enrichment_enqueue_stale(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrichment_enqueue_stale(integer, integer, integer) TO service_role;
COMMENT ON FUNCTION public.enrichment_enqueue_stale(integer, integer, integer) IS
  'P0-22 housekeeping: enqueue stale/missing enrichment jobs across all owners items; service_role only.';
