-- ============================================================
-- Migration 147 — v2 Recommendation Inbox: class-S support RPCs
-- (PLAN-V2-002 §1.3, §2.11, §3.5, §3.6, §6.4, §6.5;
--  task V2-W5-MIG147-1125-001)
-- ============================================================
-- Twelve SECURITY DEFINER functions, all class S (server-only):
--   yt_cache_get, yt_cache_put, tmdb_genres_sync,
--   email_claim, email_finish,
--   deletion_request_create, deletion_request_confirm,
--   deletion_requests_claim, deletion_request_finish,
--   deletion_job_advance, deletion_jobs_claim_stuck,
--   items_purge_unreferenced.
--
-- Security posture identical to migrations 143/144/146 (§1.3):
--   in-body guard auth.role() = 'service_role' (42501),
--   EXECUTE revoked from PUBLIC/anon/authenticated and granted
--   to service_role only. pg_default_acl auto-grants new
--   functions to anon/authenticated, so the REVOKE is required.
--
-- Also adds ONE additive column: account_deletion_jobs.updated_at
-- (timestamptz NOT NULL DEFAULT now()) — the stuck-job lease
-- clock for deletion_jobs_claim_stuck / deletion_job_advance.
-- Existing writers (delete_account migration 146,
-- housekeeping_purge migration 143) are unaffected: the column
-- has a default and no existing statement names it.
--
-- Scope guard (task): NO new tables, NO policies, NO table
-- grants, NO changes/DROPs to existing objects beyond the one
-- additive column, nothing touching edges/causes/folder_edges,
-- get_feed untouched, no link-management object touched.
-- ============================================================

-- ------------------------------------------------------------
-- account_deletion_jobs.updated_at — lease clock for the
-- retriable finalize pipeline (§3.5). Additive only.
-- ------------------------------------------------------------
ALTER TABLE public.account_deletion_jobs
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- ------------------------------------------------------------
-- yt_cache_get — read one YouTube search-cache entry.
-- Returns the payload while expires_at > now(), else NULL
-- (expired rows are treated as absent; housekeeping_purge
-- removes them separately).
-- ------------------------------------------------------------
CREATE FUNCTION public.yt_cache_get(p_query_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT c.payload INTO v_payload
  FROM public.youtube_search_cache c
  WHERE c.query_key = p_query_key
    AND c.expires_at > now();
  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.yt_cache_get(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yt_cache_get(text) TO service_role;

-- ------------------------------------------------------------
-- yt_cache_put — upsert one YouTube search-cache entry.
-- p_ttl_seconds is clamped to 60..43200 (12 h max, §6.4);
-- fetched_at and expires_at are stamped server-side.
-- ------------------------------------------------------------
CREATE FUNCTION public.yt_cache_put(p_query_key text, p_payload jsonb, p_ttl_seconds integer DEFAULT 43200)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_ttl integer := LEAST(GREATEST(COALESCE(p_ttl_seconds, 43200), 60), 43200);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.youtube_search_cache (query_key, payload, fetched_at, expires_at)
  VALUES (p_query_key, p_payload, now(), now() + v_ttl * interval '1 second')
  ON CONFLICT (query_key) DO UPDATE
    SET payload    = EXCLUDED.payload,
        fetched_at = EXCLUDED.fetched_at,
        expires_at = EXCLUDED.expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.yt_cache_put(text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yt_cache_put(text, jsonb, integer) TO service_role;

-- ------------------------------------------------------------
-- tmdb_genres_sync — bulk upsert of TMDB genre names.
-- p_rows = [{"media","id","lang","name"}]; media must be
-- 'movie'/'tv', id a JSON integer, lang/name non-empty after
-- trim; at most 2000 rows (else 22023). Upserts on the
-- (media,id,lang) primary key, last occurrence wins inside one
-- batch, stamps fetched_at = now(). Returns the number of rows
-- written.
-- ------------------------------------------------------------
CREATE FUNCTION public.tmdb_genres_sync(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid genre rows' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'too many genre rows' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS r
    WHERE jsonb_typeof(r.value) IS DISTINCT FROM 'object'
       OR COALESCE(r.value->>'media', '') NOT IN ('movie', 'tv')
       OR jsonb_typeof(r.value->'id') IS DISTINCT FROM 'number'
       OR r.value->>'id' !~ '^-?[0-9]+$'
       OR COALESCE(btrim(r.value->>'lang'), '') = ''
       OR COALESCE(btrim(r.value->>'name'), '') = ''
  ) THEN
    RAISE EXCEPTION 'invalid genre rows' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tmdb_genres (media, id, lang, name, fetched_at)
  SELECT d.media, d.id, d.lang, d.name, now()
  FROM (
    SELECT DISTINCT ON (r.value->>'media', (r.value->>'id')::integer, btrim(r.value->>'lang'))
           r.value->>'media'          AS media,
           (r.value->>'id')::integer  AS id,
           btrim(r.value->>'lang')    AS lang,
           btrim(r.value->>'name')    AS name
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS r(value, ordinality)
    ORDER BY r.value->>'media', (r.value->>'id')::integer, btrim(r.value->>'lang'), r.ordinality DESC
  ) AS d
  ON CONFLICT (media, id, lang) DO UPDATE
    SET name = EXCLUDED.name,
        fetched_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.tmdb_genres_sync(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tmdb_genres_sync(jsonb) TO service_role;

-- ------------------------------------------------------------
-- email_claim — lease up to p_limit due email_outbox rows for
-- the sender worker. Candidates: status='pending',
-- send_after <= now(), attempts < 5, ordered by send_after,
-- FOR UPDATE SKIP LOCKED so two workers never claim the same
-- row; p_limit clamped to 1..50.
--
-- Each leased row gets attempts+1 and send_after = now() + 5
-- minutes (a crashed sender is retried when the lease expires).
-- to_email = coalesce(row.to_email, the owner's auth.users
-- email); language = the owner's users.language_code or 'en'.
-- An owner-bound row with no resolvable address is failed with
-- last_error 'no_recipient'; an owner-bound row whose owner set
-- user_prefs.notify_email = false is failed with 'owner_opted_out'
-- — neither is returned. Owner-less rows (to_email set, e.g.
-- deletion_request_confirm) skip both checks and use 'en'.
-- Returns a jsonb array of
-- {id, kind, to_email, owner_id, payload, attempts, language}.
-- ------------------------------------------------------------
CREATE FUNCTION public.email_claim(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  WITH cand AS (
    SELECT e.id
    FROM public.email_outbox e
    WHERE e.status = 'pending'
      AND e.send_after <= now()
      AND e.attempts < 5
    ORDER BY e.send_after, e.id
    FOR UPDATE OF e SKIP LOCKED
    LIMIT v_limit
  ),
  res AS (
    SELECT q.*,
           (q.owner_id IS NOT NULL
            AND (q.rcpt IS NULL OR btrim(q.rcpt) = '' OR q.opted_out)) AS bad,
           CASE WHEN q.rcpt IS NULL OR btrim(q.rcpt) = ''
                THEN 'no_recipient' ELSE 'owner_opted_out' END AS err
    FROM (
      SELECT e.id, e.kind, e.owner_id, e.payload, e.send_after,
             COALESCE(e.to_email,
                      (SELECT au.email FROM auth.users au WHERE au.id = e.owner_id)) AS rcpt,
             CASE WHEN e.owner_id IS NULL THEN 'en'
                  ELSE COALESCE((SELECT u.language_code FROM public.users u WHERE u.id = e.owner_id), 'en')
             END AS lang,
             (e.owner_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.user_prefs up
                WHERE up.user_id = e.owner_id AND up.notify_email = false)) AS opted_out
      FROM cand c
      JOIN public.email_outbox e ON e.id = c.id
    ) AS q
  ),
  upd AS (
    UPDATE public.email_outbox e
    SET status      = CASE WHEN r.bad THEN 'failed' ELSE e.status END,
        last_error  = CASE WHEN r.bad THEN r.err ELSE e.last_error END,
        attempts    = CASE WHEN r.bad THEN e.attempts ELSE e.attempts + 1 END,
        send_after  = CASE WHEN r.bad THEN e.send_after
                           ELSE now() + interval '5 minutes' END
    FROM res r
    WHERE e.id = r.id
    RETURNING e.id, e.attempts, e.status
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',        r.id,
             'kind',      r.kind,
             'to_email',  r.rcpt,
             'owner_id',  r.owner_id,
             'payload',   r.payload,
             'attempts',  u.attempts,
             'language',  r.lang)
           ORDER BY r.send_after, r.id), '[]'::jsonb)
    INTO v_result
    FROM res r
    JOIN upd u ON u.id = r.id
   WHERE u.status = 'pending';
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_claim(integer) TO service_role;

-- ------------------------------------------------------------
-- email_finish — report the outcome of a claimed send.
-- p_ok: status='sent', payload cleared to '{}', last_error NULL.
-- !p_ok: last_error = left(p_error, 500); attempts >= 5 ->
-- 'failed', else stays 'pending' with send_after = now() +
-- least(2^attempts minutes, 6 hours). Idempotent: a row already
-- 'sent' or 'failed' is left untouched (no error, no change).
-- ------------------------------------------------------------
CREATE FUNCTION public.email_finish(p_id uuid, p_ok boolean, p_error text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.email_outbox e
  SET status     = CASE WHEN p_ok THEN 'sent'
                        WHEN e.attempts >= 5 THEN 'failed'
                        ELSE 'pending' END,
      payload    = CASE WHEN p_ok THEN '{}'::jsonb ELSE e.payload END,
      last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END,
      send_after = CASE WHEN p_ok OR e.attempts >= 5 THEN e.send_after
                        ELSE now() + least(power(2, e.attempts), 360) * interval '1 minute' END
  WHERE e.id = p_id
    AND e.status NOT IN ('sent', 'failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.email_finish(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_finish(uuid, boolean, text) TO service_role;

-- ------------------------------------------------------------
-- deletion_request_create — public /delete-account email path
-- (§3.6). ONE transaction inserts the deletion_requests row
-- (status 'pending') AND the email_outbox confirmation mail
-- (kind 'deletion_request_confirm', to_email =
-- lower(trim(p_email)), payload = p_confirm_payload).
-- A still-'pending' request for the same lower(email) created
-- in the last 24 h -> insert NOTHING, return normally.
-- Never checks whether an account exists (no existence oracle).
-- ------------------------------------------------------------
CREATE FUNCTION public.deletion_request_create(p_email text, p_token_hash bytea, p_ip_hash text, p_confirm_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.deletion_requests d
    WHERE lower(btrim(d.email)) = v_email
      AND d.status = 'pending'
      AND d.created_at > now() - interval '24 hours'
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.deletion_requests (email, token_hash, status, ip_hash)
  VALUES (v_email, p_token_hash, 'pending', p_ip_hash);
  INSERT INTO public.email_outbox (kind, to_email, payload)
  VALUES ('deletion_request_confirm', v_email, COALESCE(p_confirm_payload, '{}'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.deletion_request_create(text, bytea, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_request_create(text, bytea, text, jsonb) TO service_role;

-- ------------------------------------------------------------
-- deletion_request_confirm — the emailed one-time link proved
-- mailbox ownership. 'pending' AND created within 7 days ->
-- 'confirmed' (confirmed_at = now()), return true; anything
-- else (unknown hash, already confirmed/processed, expired)
-- returns false. Confirming twice returns true then false.
-- ------------------------------------------------------------
CREATE FUNCTION public.deletion_request_confirm(p_token_hash bytea)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.deletion_requests d
  SET status = 'confirmed',
      confirmed_at = now()
  WHERE d.token_hash = p_token_hash
    AND d.status = 'pending'
    AND d.created_at > now() - interval '7 days';
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.deletion_request_confirm(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_request_confirm(bytea) TO service_role;

-- ------------------------------------------------------------
-- deletion_requests_claim — runbook pickup (§3.6): move
-- 'confirmed' requests to 'processing' (FOR UPDATE SKIP
-- LOCKED, oldest first) and return [{id, email}].
-- ------------------------------------------------------------
CREATE FUNCTION public.deletion_requests_claim(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_limit  integer := GREATEST(COALESCE(p_limit, 10), 1);
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  WITH picked AS (
    SELECT d.id
    FROM public.deletion_requests d
    WHERE d.status = 'confirmed'
    ORDER BY d.created_at, d.id
    FOR UPDATE OF d SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.deletion_requests d
    SET status = 'processing'
    FROM picked p
    WHERE d.id = p.id
    RETURNING d.id, d.email, d.created_at
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', c.id, 'email', c.email)
           ORDER BY c.created_at, c.id), '[]'::jsonb)
    INTO v_result
    FROM claimed c;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.deletion_requests_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_requests_claim(integer) TO service_role;

-- ------------------------------------------------------------
-- deletion_request_finish — runbook close-out. p_status must be
-- 'done' or 'rejected' (else 22023); only a 'processing' row
-- transitions, and completed_at is stamped. Any other state is
-- a no-op.
-- ------------------------------------------------------------
CREATE FUNCTION public.deletion_request_finish(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('done', 'rejected') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.deletion_requests d
  SET status = p_status,
      completed_at = now()
  WHERE d.id = p_id
    AND d.status = 'processing';
END;
$function$;

REVOKE ALL ON FUNCTION public.deletion_request_finish(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_request_finish(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- deletion_job_advance — retriable finalize pipeline (§3.5).
-- Stages are forward-only storage < auth < email < done; a
-- backward move raises 22023 (an unknown stage does too).
-- p_error not null -> attempts+1 and last_error = left(p_error,
-- 500). Moving to 'done' sets completed_at = now() AND
-- email = NULL (PII retention). updated_at is maintained on
-- every accepted advance. Unknown user_id: no-op.
-- ------------------------------------------------------------
CREATE FUNCTION public.deletion_job_advance(p_user_id uuid, p_stage text, p_error text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_new integer;
  v_cur integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  v_new := CASE p_stage
             WHEN 'storage' THEN 1
             WHEN 'auth'    THEN 2
             WHEN 'email'   THEN 3
             WHEN 'done'    THEN 4
           END;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'invalid stage' USING ERRCODE = '22023';
  END IF;
  SELECT CASE j.stage
           WHEN 'storage' THEN 1
           WHEN 'auth'    THEN 2
           WHEN 'email'   THEN 3
           WHEN 'done'    THEN 4
         END
    INTO v_cur
    FROM public.account_deletion_jobs j
   WHERE j.user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_new < v_cur THEN
    RAISE EXCEPTION 'stage regression' USING ERRCODE = '22023';
  END IF;
  UPDATE public.account_deletion_jobs j
  SET stage        = p_stage,
      attempts     = CASE WHEN p_error IS NOT NULL THEN j.attempts + 1 ELSE j.attempts END,
      last_error   = CASE WHEN p_error IS NOT NULL THEN left(p_error, 500) ELSE j.last_error END,
      completed_at = CASE WHEN p_stage = 'done' THEN now() ELSE j.completed_at END,
      email        = CASE WHEN p_stage = 'done' THEN NULL ELSE j.email END,
      updated_at   = now()
  WHERE j.user_id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.deletion_job_advance(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_job_advance(uuid, text, text) TO service_role;

-- ------------------------------------------------------------
-- deletion_jobs_claim_stuck — housekeeping pickup for the
-- retriable finalize pipeline (§3.5): jobs not 'done',
-- attempts < 10, updated_at older than 10 minutes. FOR UPDATE
-- SKIP LOCKED, oldest first; each claimed job is LEASED by
-- stamping updated_at = now() so a second run does not pick it
-- again until the lease ages out. Returns
-- [{user_id, stage, email, attempts}].
-- ------------------------------------------------------------
CREATE FUNCTION public.deletion_jobs_claim_stuck(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_limit  integer := GREATEST(COALESCE(p_limit, 10), 1);
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  WITH picked AS (
    SELECT j.user_id
    FROM public.account_deletion_jobs j
    WHERE j.stage <> 'done'
      AND j.attempts < 10
      AND j.updated_at < now() - interval '10 minutes'
    ORDER BY j.updated_at, j.user_id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT v_limit
  ),
  leased AS (
    UPDATE public.account_deletion_jobs j
    SET updated_at = now()
    FROM picked p
    WHERE j.user_id = p.user_id
    RETURNING j.user_id, j.stage, j.email, j.attempts
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'user_id', l.user_id,
             'stage',   l.stage,
             'email',   l.email,
             'attempts', l.attempts)
           ORDER BY l.user_id), '[]'::jsonb)
    INTO v_result
    FROM leased l;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.deletion_jobs_claim_stuck(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deletion_jobs_claim_stuck(integer) TO service_role;

-- ------------------------------------------------------------
-- items_purge_unreferenced — §6.5 unreferenced-items sweep.
-- Deletes items that NO table references: the referencing set
-- is derived live from pg_constraint (every FK into
-- public.items, all delete actions), so a future FK is covered
-- automatically. A row is deleted only when
-- COALESCE(fetched_at, created_at) is older than the per-source
-- threshold (YouTube p_youtube_days, TMDB p_tmdb_days) AND no
-- referencing row exists — a referenced item is never deleted.
-- At most p_limit rows per call (floor 1), oldest first.
-- Returns the deleted count.
-- ------------------------------------------------------------
CREATE FUNCTION public.items_purge_unreferenced(
  p_youtube_days integer DEFAULT 25,
  p_tmdb_days    integer DEFAULT 150,
  p_limit        integer DEFAULT 500
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_refs    text;
  v_deleted integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT string_agg(
           format('AND NOT EXISTS (SELECT 1 FROM public.%I AS r WHERE %s)',
                  child.relname, pairs.conds),
           ' ' ORDER BY child.relname)
    INTO v_refs
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace cns ON cns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace pns ON pns.oid = parent.relnamespace
    JOIN LATERAL (
      SELECT string_agg(
               format('r.%I = i2.%I', ca.attname, pa.attname),
               ' AND ') AS conds
      FROM unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord)
      JOIN unnest(c.confkey) WITH ORDINALITY AS pk(attnum, ord)
        ON pk.ord = ck.ord
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = ck.attnum
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = pk.attnum
    ) AS pairs ON true
   WHERE c.contype = 'f'
     AND cns.nspname = 'public'
     AND pns.nspname = 'public'
     AND parent.relname = 'items';
  BEGIN
    EXECUTE format(
      'DELETE FROM public.items i
        WHERE i.id IN (
          SELECT i2.id
          FROM public.items i2
          WHERE COALESCE(i2.fetched_at, i2.created_at) <
                now() - (CASE i2.source
                           WHEN ''youtube'' THEN (%L || '' days'')::interval
                           WHEN ''tmdb''    THEN (%L || '' days'')::interval
                         END)
            %s
          ORDER BY i2.created_at, i2.id
          LIMIT %s)',
      p_youtube_days, p_tmdb_days, COALESCE(v_refs, ''),
      GREATEST(COALESCE(p_limit, 500), 1));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN 0;
  END;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.items_purge_unreferenced(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.items_purge_unreferenced(integer, integer, integer) TO service_role;
