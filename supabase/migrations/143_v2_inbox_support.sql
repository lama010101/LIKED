-- ============================================================
-- Migration 143 — v2 Recommendation Inbox: support tables,
-- node_items bridge, infra/worker functions
-- (PLAN-V2-002 §1.4 + §2.11, PRD v2.6; task V2-W1A-DDL-001, PLAN P0-02)
-- ============================================================
-- Same security posture as 142 (§1.3): every table gets
-- ENABLE ROW LEVEL SECURITY + REVOKE ALL FROM PUBLIC, anon,
-- authenticated and NO policy. Every function is class S
-- (server-only): SECURITY DEFINER, SET search_path = public,
-- in-body guard auth.role() = 'service_role', EXECUTE revoked
-- from PUBLIC/anon/authenticated and granted to service_role only.
-- Guests and authenticated users can execute NONE of these.
-- ============================================================

CREATE TABLE public.enrichment_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  job_kind    text NOT NULL CHECK (job_kind IN ('details','availability')),
  param       text NOT NULL,                       -- TMDB language tag for 'details', region code for 'availability'
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts    integer NOT NULL DEFAULT 0,
  run_after   timestamptz NOT NULL DEFAULT now(),
  locked_at   timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, job_kind, param)
);
CREATE INDEX enrichment_jobs_due ON public.enrichment_jobs (run_after) WHERE status = 'pending';

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enrichment_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE public.email_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES public.users(id) ON DELETE CASCADE,   -- NULL for account-deletion confirmations (user is gone)
  to_email    text,                                                  -- only set when owner_id IS NULL
  kind        text NOT NULL CHECK (kind IN ('recommendation_received','account_deleted','deletion_request_confirm')),
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts    integer NOT NULL DEFAULT 0,
  send_after  timestamptz NOT NULL DEFAULT now(),
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_id IS NOT NULL OR to_email IS NOT NULL)
);
CREATE INDEX email_outbox_due ON public.email_outbox (send_after) WHERE status = 'pending';

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox FROM PUBLIC, anon, authenticated;

CREATE TABLE public.rate_limits (                           -- DB-backed (serverless has no shared memory; no Redis exists)
  bucket        text        NOT NULL,
  key_hash      text        NOT NULL,                       -- sha256(pepper || ip | contributor_id | token): raw IPs are never stored
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX rate_limits_purge ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;

CREATE TABLE public.youtube_search_cache (
  query_key   text PRIMARY KEY,                             -- sha256(normalized query || '|' || lang || '|' || region)
  payload     jsonb NOT NULL,                               -- YouTube API data: TTL <= 12h, purged daily (<= 30d rule, §6.4)
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX youtube_search_cache_expiry ON public.youtube_search_cache (expires_at);

ALTER TABLE public.youtube_search_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_search_cache FROM PUBLIC, anon, authenticated;

CREATE TABLE public.youtube_search_budget (
  day    date NOT NULL,                                     -- Pacific-time day (quota resets at midnight PT; Google docs, UNVERIFIED this pass)
  scope  text NOT NULL,                                     -- 'global' or 'c:<contributor_id>'
  used   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
);

ALTER TABLE public.youtube_search_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_search_budget FROM PUBLIC, anon, authenticated;

CREATE TABLE public.account_deletion_jobs (                 -- retriable finalize after the DB transaction (§3.5)
  user_id       uuid PRIMARY KEY,                           -- deliberately NO FK: the user row is gone
  email         text,                                       -- kept only until the confirmation mail is sent
  stage         text NOT NULL DEFAULT 'storage' CHECK (stage IN ('storage','auth','email','done')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE public.deletion_requests (                     -- public /delete-account email path (PRD §10.2)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  token_hash    bytea NOT NULL CHECK (octet_length(token_hash) = 32),   -- emailed confirmation link: proves mailbox ownership
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','done','rejected')),
  ip_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,
  completed_at  timestamptz
);
CREATE INDEX deletion_requests_open ON public.deletion_requests (status, created_at) WHERE status IN ('pending','confirmed');

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deletion_requests FROM PUBLIC, anon, authenticated;

-- Bridge: Library node -> catalog item (replaces PLAN-REC-001
-- `node_tmdb`); created EMPTY in P0 so get_inbox is final.
-- Every FK to nodes/folders stays ON DELETE CASCADE (Tier-0 DB-18).
CREATE TABLE public.node_items (
  node_id  uuid PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,
  item_id  uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT
);
CREATE INDEX node_items_item ON public.node_items (item_id);

ALTER TABLE public.node_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.node_items FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Class-S infrastructure and worker functions (PLAN §2.11).
-- Payload contracts (DESIGN — the plan specifies purposes only):
--   item_apply_details p_payload keys mirror items columns
--     (name, release_date, original_language, genres[], is_documentary,
--      overview, runtime_min, poster_path, thumb_url, creator_id,
--      creator_name, trailer_url, tmdb_rating, tmdb_votes,
--      display_status) plus 'localized' = {name,overview,tagline}
--     stored under p_tag. Base columns are filled only when NULL
--     ("first time"); localized is merged per tag.
--   item_apply_availability p_rows = [{provider_id, provider,
--     offer_type, link, logo_key}].
--   item_refresh_apply p_payload = refreshed field set; 'localized'
--     is a {tag:{...}} map merged wholesale. p_unavailable=true
--     nulls display fields (display_status='unavailable'); for
--     YouTube items it also refreshes/clears nodes.title of
--     promoted nodes via node_items (DV-5).
--   yt_budget_consume p_kind = 'search' (global_search+1,
--     c:<id>+1, global_units+100) or 'resolve' (global_units+1);
--     Pacific-time day; limit params default to the §6.4 values
--     and may be overridden by the caller (env-tunable).
-- ============================================================

-- Atomic fixed-window rate-limit hit. Returns hits <= p_limit.
CREATE FUNCTION public.rl_hit(p_bucket text, p_key_hash text, p_window_seconds integer, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_window timestamptz;
  v_hits   integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_bucket IS NULL OR p_key_hash IS NULL OR p_window_seconds IS NULL OR p_window_seconds <= 0 OR p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'invalid rl_hit arguments' USING ERRCODE = '22023';
  END IF;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.rate_limits (bucket, key_hash, window_start, hits)
  VALUES (p_bucket, p_key_hash, v_window, 1)
  ON CONFLICT (bucket, key_hash, window_start)
  DO UPDATE SET hits = rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.rl_hit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rl_hit(text, text, integer, integer) TO service_role;

-- Atomic YouTube-search budget reservation for the Pacific-time day.
-- 'search' consumes one search slot globally and per contributor plus
-- 100 units; 'resolve' consumes 1 unit. All-or-nothing: a failed scope
-- rolls back the scopes already incremented in this call.
CREATE FUNCTION public.yt_budget_consume(
  p_contributor_id uuid,
  p_kind text,
  p_global_search_limit integer DEFAULT 50,
  p_contributor_search_limit integer DEFAULT 5,
  p_units_hard_cap integer DEFAULT 8000
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_day    date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_scopes text[];
  v_costs  integer[];
  v_limits integer[];
  v_msg    text;
  i        integer;
  v_scope  text;
  v_cost   integer;
  v_limit  integer;
  v_used   integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('search','resolve') THEN
    RAISE EXCEPTION 'invalid budget kind' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'search' THEN
    IF p_contributor_id IS NULL THEN
      RAISE EXCEPTION 'contributor required for search' USING ERRCODE = '22023';
    END IF;
    v_scopes := ARRAY['global_search', 'c:' || p_contributor_id::text, 'global_units'];
    v_costs  := ARRAY[1, 1, 100];
    v_limits := ARRAY[p_global_search_limit, p_contributor_search_limit, p_units_hard_cap];
  ELSE
    v_scopes := ARRAY['global_units'];
    v_costs  := ARRAY[1];
    v_limits := ARRAY[p_units_hard_cap];
  END IF;
  BEGIN
    FOR i IN 1 .. array_length(v_scopes, 1) LOOP
      v_scope := v_scopes[i];
      v_cost  := v_costs[i];
      v_limit := v_limits[i];
      IF v_cost > v_limit THEN
        RAISE EXCEPTION '%', v_scope USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public.youtube_search_budget AS b (day, scope, used)
      VALUES (v_day, v_scope, v_cost)
      ON CONFLICT (day, scope) DO UPDATE
        SET used = b.used + v_cost
        WHERE b.used + v_cost <= v_limit
      RETURNING used INTO v_used;
      IF NOT FOUND THEN
        RAISE EXCEPTION '%', v_scope USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object('allowed', false, 'reason', v_msg);
  END;
  RETURN jsonb_build_object('allowed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.yt_budget_consume(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yt_budget_consume(uuid, text, integer, integer, integer) TO service_role;

-- Claim up to p_limit due jobs for the enrichment worker
-- (FOR UPDATE SKIP LOCKED: two workers never get the same row).
CREATE FUNCTION public.enrichment_claim(p_limit integer)
 RETURNS SETOF public.enrichment_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'invalid claim limit' USING ERRCODE = '22023';
  END IF;
  WITH picked AS (
    SELECT j.id
    FROM public.enrichment_jobs j
    WHERE j.status = 'pending' AND j.run_after <= now()
    ORDER BY j.run_after, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  SELECT array_agg(id) INTO v_ids FROM picked;
  IF v_ids IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.enrichment_jobs
  SET status = 'processing', locked_at = now()
  WHERE id = ANY (v_ids);
  RETURN QUERY
    SELECT * FROM public.enrichment_jobs WHERE id = ANY (v_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.enrichment_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrichment_claim(integer) TO service_role;

-- Finish a claimed job: done, or attempts+1 with exponential
-- backoff (run_after = now() + 2^attempts minutes), failed after 5.
-- When no open jobs remain for the item, recompute
-- items.enrichment_status ('complete', or 'failed' if any job failed).
CREATE FUNCTION public.enrichment_finish(p_job_id uuid, p_ok boolean, p_error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_item uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.enrichment_jobs
  SET status      = CASE WHEN p_ok THEN 'done' WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
      attempts    = CASE WHEN p_ok THEN attempts ELSE attempts + 1 END,
      run_after   = CASE WHEN p_ok OR attempts + 1 >= 5 THEN run_after
                         ELSE now() + (power(2, attempts + 1) * interval '1 minute') END,
      last_error  = CASE WHEN p_ok THEN NULL ELSE p_error END,
      locked_at   = NULL
  WHERE id = p_job_id AND status = 'processing'
  RETURNING item_id INTO v_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrichment job not processing' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.items i
  SET enrichment_status = CASE
        WHEN EXISTS (SELECT 1 FROM public.enrichment_jobs j
                     WHERE j.item_id = i.id AND j.status = 'failed')
        THEN 'failed' ELSE 'complete' END
  WHERE i.id = v_item
    AND NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                    WHERE j.item_id = i.id AND j.status IN ('pending','processing'));
END;
$function$;

REVOKE ALL ON FUNCTION public.enrichment_finish(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrichment_finish(uuid, boolean, text) TO service_role;

-- Apply TMDB/YouTube details for one language tag: fills base columns
-- only when NULL ("first time"), merges localized[p_tag], stamps
-- fetched_at, moves enrichment_status pending -> partial.
CREATE FUNCTION public.item_apply_details(p_item_id uuid, p_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_tag IS NULL OR p_tag !~ '^[a-z]{2}-[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid language tag' USING ERRCODE = '22023';
  END IF;
  UPDATE public.items i SET
    name              = COALESCE(i.name, NULLIF(p_payload->>'name','')),
    release_date      = COALESCE(i.release_date, NULLIF(p_payload->>'release_date','')::date),
    original_language = COALESCE(i.original_language, NULLIF(p_payload->>'original_language','')),
    genres            = CASE WHEN i.genres = '{}' AND p_payload ? 'genres'
                             THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'genres'))
                             ELSE i.genres END,
    is_documentary    = i.is_documentary OR COALESCE((p_payload->>'is_documentary')::boolean, false),
    overview          = COALESCE(i.overview, NULLIF(p_payload->>'overview','')),
    runtime_min       = COALESCE(i.runtime_min, NULLIF(p_payload->>'runtime_min','')::integer),
    poster_path       = COALESCE(i.poster_path, NULLIF(p_payload->>'poster_path','')),
    thumb_url         = COALESCE(i.thumb_url, NULLIF(p_payload->>'thumb_url','')),
    creator_id        = COALESCE(i.creator_id, NULLIF(p_payload->>'creator_id','')),
    creator_name      = COALESCE(i.creator_name, NULLIF(p_payload->>'creator_name','')),
    trailer_url       = COALESCE(i.trailer_url, NULLIF(p_payload->>'trailer_url','')),
    tmdb_rating       = COALESCE(i.tmdb_rating, NULLIF(p_payload->>'tmdb_rating','')::numeric),
    tmdb_votes        = COALESCE(i.tmdb_votes, NULLIF(p_payload->>'tmdb_votes','')::integer),
    localized         = CASE WHEN p_payload ? 'localized' AND jsonb_typeof(p_payload->'localized') = 'object'
                             THEN COALESCE(i.localized, '{}'::jsonb) || jsonb_build_object(p_tag, p_payload->'localized')
                             ELSE i.localized END,
    display_status    = COALESCE(NULLIF(p_payload->>'display_status',''), i.display_status),
    fetched_at        = now(),
    enrichment_status = CASE WHEN i.enrichment_status = 'pending' THEN 'partial' ELSE i.enrichment_status END
  WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.item_apply_details(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_apply_details(uuid, text, jsonb) TO service_role;

-- Replace availability rows for (item, region) and stamp the fetch
-- marker so "Not available in {region}" is an explicit state.
CREATE FUNCTION public.item_apply_availability(p_item_id uuid, p_region text, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_region IS NULL OR p_region !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid region code' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.item_availability
  WHERE item_id = p_item_id AND region_code = p_region;
  INSERT INTO public.item_availability (item_id, region_code, provider_id, provider, offer_type, link, logo_key)
  SELECT p_item_id, p_region,
         (r->>'provider_id')::integer,
         r->>'provider',
         r->>'offer_type',
         NULLIF(r->>'link',''),
         NULLIF(r->>'logo_key','')
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;
  INSERT INTO public.item_availability_fetch (item_id, region_code, fetched_at)
  VALUES (p_item_id, p_region, now())
  ON CONFLICT (item_id, region_code) DO UPDATE SET fetched_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.item_apply_availability(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_apply_availability(uuid, text, jsonb) TO service_role;

-- 30-day (YouTube) / 6-month (TMDB) refresh result, or null the
-- display fields when the provider no longer serves the item.
-- For YouTube items, promoted Library node titles (node_items) are
-- refreshed/cleared in the same call (DV-5); TMDB node titles are
-- set once at promote time and are not touched here.
CREATE FUNCTION public.item_refresh_apply(p_item_id uuid, p_payload jsonb, p_unavailable boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_source text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT i.source INTO v_source FROM public.items i WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_unavailable THEN
    UPDATE public.items i SET
      display_status   = 'unavailable',
      fetched_at       = now(),
      name             = NULL,
      release_date     = NULL,
      original_language = NULL,
      genres           = '{}'::text[],
      is_documentary   = false,
      overview         = NULL,
      runtime_min      = NULL,
      poster_path      = NULL,
      thumb_url        = NULL,
      creator_name     = NULL,
      trailer_url      = NULL,
      tmdb_rating      = NULL,
      tmdb_votes       = NULL,
      localized        = '{}'::jsonb
    WHERE i.id = p_item_id;
    IF v_source = 'youtube' THEN
      UPDATE public.nodes n SET title = NULL
      FROM public.node_items ni
      WHERE ni.node_id = n.id AND ni.item_id = p_item_id;
    END IF;
  ELSE
    UPDATE public.items i SET
      name              = COALESCE(NULLIF(p_payload->>'name',''), i.name),
      release_date      = COALESCE(NULLIF(p_payload->>'release_date','')::date, i.release_date),
      original_language = COALESCE(NULLIF(p_payload->>'original_language',''), i.original_language),
      genres            = CASE WHEN p_payload ? 'genres'
                               THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'genres'))
                               ELSE i.genres END,
      is_documentary    = COALESCE((p_payload->>'is_documentary')::boolean, i.is_documentary),
      overview          = COALESCE(NULLIF(p_payload->>'overview',''), i.overview),
      runtime_min       = COALESCE(NULLIF(p_payload->>'runtime_min','')::integer, i.runtime_min),
      poster_path       = COALESCE(NULLIF(p_payload->>'poster_path',''), i.poster_path),
      thumb_url         = COALESCE(NULLIF(p_payload->>'thumb_url',''), i.thumb_url),
      creator_id        = COALESCE(NULLIF(p_payload->>'creator_id',''), i.creator_id),
      creator_name      = COALESCE(NULLIF(p_payload->>'creator_name',''), i.creator_name),
      trailer_url       = COALESCE(NULLIF(p_payload->>'trailer_url',''), i.trailer_url),
      tmdb_rating       = COALESCE(NULLIF(p_payload->>'tmdb_rating','')::numeric, i.tmdb_rating),
      tmdb_votes        = COALESCE(NULLIF(p_payload->>'tmdb_votes','')::integer, i.tmdb_votes),
      localized         = CASE WHEN jsonb_typeof(p_payload->'localized') = 'object'
                               THEN COALESCE(i.localized, '{}'::jsonb) || (p_payload->'localized')
                               ELSE i.localized END,
      display_status    = COALESCE(NULLIF(p_payload->>'display_status',''), i.display_status),
      fetched_at        = now()
    WHERE i.id = p_item_id;
    IF v_source = 'youtube' AND NULLIF(p_payload->>'name','') IS NOT NULL THEN
      UPDATE public.nodes n SET title = NULLIF(p_payload->>'name','')
      FROM public.node_items ni
      WHERE ni.node_id = n.id AND ni.item_id = p_item_id;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.item_refresh_apply(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_refresh_apply(uuid, jsonb, boolean) TO service_role;

-- Daily purge (PLAN §2.11/§6.5/§3.5): expired YouTube search cache,
-- rate-limit windows older than 2 days, YouTube budget days older
-- than 3 days, finished account-deletion jobs older than 30 days.
CREATE FUNCTION public.housekeeping_purge()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.youtube_search_cache WHERE expires_at < now();
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 days';
  DELETE FROM public.youtube_search_budget
  WHERE day < (now() AT TIME ZONE 'America/Los_Angeles')::date - 3;
  DELETE FROM public.account_deletion_jobs
  WHERE stage = 'done' AND completed_at < now() - interval '30 days';
END;
$function$;

REVOKE ALL ON FUNCTION public.housekeeping_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.housekeeping_purge() TO service_role;
