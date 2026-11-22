-- ============================================================
-- Migration 145 — v2 Recommendation Inbox: owner class-O
-- functions (PLAN-V2-002 §1.3, §2.1, §2.5, §6.3, §6.5, §6.6,
-- §8 row P0-04; task V2-W2-P0-04, PLAN P0-04)
-- ============================================================
-- Eleven new SECURITY DEFINER functions + one re-create:
--   ensure_my_ask, get_my_ask, regenerate_my_ask,
--   set_ask_active, update_ask_settings, get_inbox,
--   get_friend_rail, mark_friend_seen, get_my_prefs,
--   set_my_prefs, enqueue_stale_enrichment, and set_language
--   (CREATE OR REPLACE: adds 'es', upserts user_prefs
--   language_set_at + tmdb_lang).
--
-- Security posture (§1.3 class O): every function is
-- SECURITY DEFINER with SET search_path = public and the
-- in-body guard  v_uid := auth.uid(); IF v_uid IS NULL THEN
-- RAISE ... ERRCODE '42501'. NO function takes a user-id or
-- owner-id parameter — the caller is always auth.uid() (no
-- IDOR surface). EXECUTE is revoked from PUBLIC/anon and
-- granted to authenticated + service_role (pg_default_acl
-- auto-grants new functions to anon/authenticated, so the
-- REVOKE is required). set_language keeps its existing ACL
-- ({postgres,authenticated,service_role}) — CREATE OR
-- REPLACE preserves proacl, so no grant statements are
-- emitted for it.
--
-- Scope guard (task R4): NO new tables, NO policies, NO table
-- grants, NO DROPs, nothing touching edges/causes/folder_edges,
-- get_feed untouched, no link-management object touched
-- (LINKS-PAUSE). Depends only on migrations 142/143 tables —
-- it does NOT reference any migration-144 function.
-- ============================================================

-- ------------------------------------------------------------
-- §2.1 ensure_my_ask — create the owner's ask row if absent.
-- Idempotent: ON CONFLICT (owner_id) DO NOTHING then re-read.
-- Token: 24 random bytes -> base64 -> base64url alphabet,
-- always exactly 32 chars.
-- ------------------------------------------------------------
CREATE FUNCTION public.ensure_my_ask()
 RETURNS public.asks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ask public.asks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.asks (owner_id, token)
  VALUES (v_uid, translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'))
  ON CONFLICT (owner_id) DO NOTHING
  RETURNING * INTO v_ask;
  IF NOT FOUND THEN
    SELECT * INTO v_ask FROM public.asks WHERE owner_id = v_uid;
  END IF;
  RETURN v_ask;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_my_ask() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_ask() TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.1 get_my_ask — the owner's row, or NOT_FOUND.
-- ------------------------------------------------------------
CREATE FUNCTION public.get_my_ask()
 RETURNS public.asks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ask public.asks;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ask FROM public.asks WHERE owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_ask;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_ask() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ask() TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.1 regenerate_my_ask — rotate the token in place; the old
-- token stops resolving immediately (it no longer exists).
-- Also re-activates the link (is_active = true) and stamps
-- rotated_at. NOT_FOUND when the owner has no ask row.
-- ------------------------------------------------------------
CREATE FUNCTION public.regenerate_my_ask()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_token text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.asks
  SET token = translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'),
      rotated_at = now(),
      is_active = true
  WHERE owner_id = v_uid
  RETURNING token INTO v_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.regenerate_my_ask() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_my_ask() TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.1 set_ask_active — toggle is_active. A disabled link
-- answers ASK_NOT_ACTIVE on the guest side.
-- ------------------------------------------------------------
CREATE FUNCTION public.set_ask_active(p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'invalid is_active' USING ERRCODE = '22023';
  END IF;
  UPDATE public.asks SET is_active = p_active WHERE owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_ask_active(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ask_active(boolean) TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.1 update_ask_settings — replace prompt/note/liked_genres.
-- prompt NULL = localized default text; note NULL = no note;
-- liked_genres NULL = '{}'. Validates: prompt <= 200,
-- note <= 140, cardinality <= 5, distinct ids, every id
-- present in tmdb_genres. Length violations -> FIELD_TOO_LONG;
-- other violations -> 22023.
-- ------------------------------------------------------------
CREATE FUNCTION public.update_ask_settings(p_prompt text, p_note text, p_liked_genres integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_genres integer[] := COALESCE(p_liked_genres, '{}'::integer[]);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_prompt IS NOT NULL AND char_length(p_prompt) > 200 THEN
    RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 140 THEN
    RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_genres) > 5 THEN
    RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_genres) <> (SELECT count(DISTINCT x) FROM unnest(v_genres) AS g(x)) THEN
    RAISE EXCEPTION 'invalid liked_genres' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_genres) AS g(x)
              WHERE NOT EXISTS (SELECT 1 FROM public.tmdb_genres t WHERE t.id = x)) THEN
    RAISE EXCEPTION 'invalid liked_genres' USING ERRCODE = '22023';
  END IF;
  UPDATE public.asks
  SET prompt = p_prompt, note = p_note, liked_genres = v_genres
  WHERE owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_ask_settings(text, text, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ask_settings(text, text, integer[]) TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.5 get_inbox — owner inbox read. One card per item_id
-- (merge rule §2.3/PRD §6.5): aggregates are computed over ALL
-- recommenders of the item, independent of the rail selection
-- (DESIGN). p_friend_id only decides WHICH items appear (the
-- item must have a recommendation from that contributor) and
-- which comment becomes the quote.
--
-- Filter semantics (plan §2.5 names the keys; PRD §6.4 names
-- the categories — value vocabulary is a documented judgment
-- call, see PR notes):
--   platforms[]  -> provider name in item_availability for the
--                   owner's region (case-insensitive), or the
--                   literal 'youtube' for youtube-source items
--   types[]      -> derived type chip: 'youtube' (source),
--                   'documentary' (is_documentary), else kind
--   decades[]    -> 4-digit years; matches the release-year
--                   decade (floor(year/10))
--   languages[]  -> items.original_language
--   genres[]     -> items.genres namespaced keys; bare numeric
--                   ids are normalized to 'tmdb:<id>'
--   multi_recommended -> boolean; requires recommender_count >= 2
-- Within a category = OR, across categories = AND, the rail
-- selection ANDs with filters. Counts are computed over the
-- same filtered base across ALL statuses (no p_status, no
-- cursor) so a tab badge equals its list length.
-- Sort keys are non-null numerics per mode (COALESCE -1),
-- ordered DESC with item_id as tiebreak; the keyset cursor is
-- (sort_key, item_id) — deterministic, no OFFSET.
-- ------------------------------------------------------------
CREATE FUNCTION public.get_inbox(
  p_status      text    DEFAULT 'to_watch',
  p_friend_id   uuid    DEFAULT NULL,
  p_filters     jsonb   DEFAULT '{}',
  p_sort        text    DEFAULT 'recent',
  p_cursor_key  numeric DEFAULT NULL,
  p_cursor_item uuid    DEFAULT NULL,
  p_limit       integer DEFAULT 30
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_status    text := COALESCE(p_status, 'to_watch');
  v_sort      text := COALESCE(p_sort, 'recent');
  v_limit     integer := COALESCE(p_limit, 30);
  v_filters   jsonb := COALESCE(p_filters, '{}'::jsonb);
  v_tag       text;
  v_region    text;
  v_platforms text[];
  v_types     text[];
  v_decades   integer[];
  v_languages text[];
  v_genres    text[];
  v_multi     boolean;
  v_result    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('to_watch', 'watched', 'dismissed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  IF v_sort NOT IN ('recent', 'most_recommended', 'friend_score', 'release_date', 'tmdb_score') THEN
    RAISE EXCEPTION 'invalid sort' USING ERRCODE = '22023';
  END IF;
  IF v_limit < 1 OR v_limit > 100 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  IF (p_cursor_key IS NULL) <> (p_cursor_item IS NULL) THEN
    RAISE EXCEPTION 'invalid cursor' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_filters) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid filters' USING ERRCODE = '22023';
  END IF;
  IF v_filters ? 'multi_recommended'
     AND jsonb_typeof(v_filters -> 'multi_recommended') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'invalid filters' USING ERRCODE = '22023';
  END IF;
  v_multi := COALESCE((v_filters ->> 'multi_recommended')::boolean, false);

  -- array filters: absent key or non-array -> NULL (no filter);
  -- an empty array aggregates to NULL -> also no filter.
  SELECT CASE WHEN jsonb_typeof(v_filters -> 'platforms') = 'array'
              THEN (SELECT array_agg(lower(x))
                      FROM jsonb_array_elements_text(v_filters -> 'platforms') AS f(x))
              ELSE NULL END
    INTO v_platforms;
  SELECT CASE WHEN jsonb_typeof(v_filters -> 'types') = 'array'
              THEN (SELECT array_agg(x)
                      FROM jsonb_array_elements_text(v_filters -> 'types') AS f(x))
              ELSE NULL END
    INTO v_types;
  SELECT CASE WHEN jsonb_typeof(v_filters -> 'languages') = 'array'
              THEN (SELECT array_agg(x)
                      FROM jsonb_array_elements_text(v_filters -> 'languages') AS f(x))
              ELSE NULL END
    INTO v_languages;
  SELECT CASE WHEN jsonb_typeof(v_filters -> 'genres') = 'array'
              THEN (SELECT array_agg(CASE WHEN x ~ '^\d+$' THEN 'tmdb:' || x ELSE x END)
                      FROM jsonb_array_elements_text(v_filters -> 'genres') AS f(x))
              ELSE NULL END
    INTO v_genres;
  IF jsonb_typeof(v_filters -> 'decades') = 'array' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_filters -> 'decades') AS f(x)
                WHERE x !~ '^\d{4}$') THEN
      RAISE EXCEPTION 'invalid filters' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg((x::integer / 10) * 10)
      INTO v_decades
      FROM jsonb_array_elements_text(v_filters -> 'decades') AS f(x);
  END IF;

  -- owner display language (default 'en-US') and streaming
  -- region (default 'US' — same fallback the submit path uses
  -- for availability jobs, migration 144 §2.3 step 11).
  SELECT COALESCE((SELECT up.tmdb_lang FROM public.user_prefs up WHERE up.user_id = v_uid), 'en-US'),
         COALESCE((SELECT up.region_code FROM public.user_prefs up WHERE up.user_id = v_uid), 'US')
    INTO v_tag, v_region;

  WITH rec AS (
    SELECT r.item_id,
           count(*)::integer              AS recommender_count,
           count(r.rating)::integer       AS rater_count,
           round(avg(r.rating))::integer  AS friends_avg,
           max(r.updated_at)              AS latest_at
    FROM public.recommendations r
    WHERE r.owner_id = v_uid
    GROUP BY r.item_id
    HAVING p_friend_id IS NULL OR bool_or(r.contributor_id = p_friend_id)
  ),
  base AS (
    SELECT rec.item_id,
           rec.recommender_count, rec.rater_count, rec.friends_avg, rec.latest_at,
           i.source, i.kind, i.external_id, i.name AS original_title,
           i.release_date, i.original_language, i.genres, i.is_documentary,
           i.runtime_min, i.overview, i.poster_path, i.thumb_url, i.trailer_url,
           i.tmdb_rating, i.enrichment_status, i.localized,
           COALESCE(ois.status, 'to_watch') AS status,
           ois.updated_at AS state_updated_at,
           CASE v_sort
             WHEN 'recent'           THEN extract(epoch from rec.latest_at)
             WHEN 'most_recommended' THEN rec.recommender_count::numeric
             WHEN 'friend_score'     THEN COALESCE(rec.friends_avg::numeric, -1)
             WHEN 'release_date'     THEN COALESCE(extract(epoch from i.release_date), -1)
             WHEN 'tmdb_score'       THEN COALESCE(round(i.tmdb_rating * 10), -1)
           END AS sort_key
    FROM rec
    JOIN public.items i ON i.id = rec.item_id
    LEFT JOIN public.owner_item_state ois
      ON ois.owner_id = v_uid AND ois.item_id = rec.item_id
    WHERE (v_types IS NULL OR
             (CASE WHEN i.source = 'youtube' THEN 'youtube'
                   WHEN i.is_documentary THEN 'documentary'
                   ELSE i.kind END) = ANY (v_types))
      AND (v_decades IS NULL OR
             ((extract(year from i.release_date)::integer / 10) * 10) = ANY (v_decades))
      AND (v_languages IS NULL OR i.original_language = ANY (v_languages))
      AND (v_genres IS NULL OR i.genres && v_genres)
      AND (v_platforms IS NULL OR
             EXISTS (SELECT 1 FROM public.item_availability ia
                      WHERE ia.item_id = i.id AND ia.region_code = v_region
                        AND lower(ia.provider) = ANY (v_platforms))
          OR (i.source = 'youtube' AND 'youtube' = ANY (v_platforms)))
      AND (NOT v_multi OR rec.recommender_count >= 2)
  ),
  counts AS (
    SELECT status, count(*)::integer AS cnt FROM base GROUP BY status
  ),
  page AS (
    SELECT * FROM base
    WHERE status = v_status
      AND (p_cursor_key IS NULL OR (sort_key, item_id) < (p_cursor_key, p_cursor_item))
    ORDER BY sort_key DESC, item_id DESC
    LIMIT v_limit + 1
  ),
  kept AS (
    SELECT * FROM page ORDER BY sort_key DESC, item_id DESC LIMIT v_limit
  ),
  cards AS (
    SELECT k.item_id, k.sort_key,
      jsonb_build_object(
        'item_id',           k.item_id,
        'status',            k.status,
        'type',              CASE WHEN k.source = 'youtube' THEN 'youtube'
                                  WHEN k.is_documentary THEN 'documentary'
                                  ELSE k.kind END,
        'title',             COALESCE(NULLIF(k.localized -> v_tag ->> 'name', ''),
                                     NULLIF(k.localized -> 'en-US' ->> 'name', ''),
                                     k.original_title),
        'original_title',    k.original_title,
        'year',              extract(year from k.release_date)::integer,
        'runtime_min',       k.runtime_min,
        'release_date',      k.release_date,
        'original_language', k.original_language,
        'genres',            k.genres,
        'overview',          COALESCE(NULLIF(k.localized -> v_tag ->> 'overview', ''),
                                     NULLIF(k.localized -> 'en-US' ->> 'overview', ''),
                                     k.overview),
        'poster_path',       k.poster_path,
        'thumb_url',         k.thumb_url,
        'source',            k.source,
        'kind',              k.kind,
        'is_documentary',    k.is_documentary,
        'trailer_url',       k.trailer_url,
        'tmdb_score',        CASE WHEN k.tmdb_rating IS NULL THEN NULL
                                  ELSE round(k.tmdb_rating * 10)::integer END,
        'enrichment_status', k.enrichment_status,
        'skeleton',          (k.enrichment_status = 'pending'),
        'recommender_count', k.recommender_count,
        'rater_count',       k.rater_count,
        'friends_avg',       k.friends_avg,
        'recommenders',      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                  'contributor_id', r2.contributor_id,
                                  'display_name',  c2.display_name,
                                  'initials',      upper(left(split_part(regexp_replace(btrim(c2.display_name), '\s+', ' ', 'g'), ' ', 1), 1)
                                                       || COALESCE(NULLIF(left(split_part(regexp_replace(btrim(c2.display_name), '\s+', ' ', 'g'), ' ', 2), 1), ''), '')),
                                  'rating',        r2.rating)
                                ORDER BY r2.updated_at DESC, r2.id DESC), '[]'::jsonb)
                                FROM (SELECT r3.* FROM public.recommendations r3
                                       WHERE r3.owner_id = v_uid AND r3.item_id = k.item_id
                                       ORDER BY r3.updated_at DESC, r3.id DESC LIMIT 3) r2
                                JOIN public.contributors c2 ON c2.id = r2.contributor_id),
        'more_count',        GREATEST(k.recommender_count - 3, 0),
        'quote',             CASE WHEN p_friend_id IS NOT NULL THEN
                                  (SELECT r4.comment FROM public.recommendations r4
                                    WHERE r4.owner_id = v_uid AND r4.item_id = k.item_id
                                      AND r4.contributor_id = p_friend_id
                                      AND r4.comment IS NOT NULL AND btrim(r4.comment) <> '')
                                ELSE
                                  (SELECT r5.comment FROM public.recommendations r5
                                    WHERE r5.owner_id = v_uid AND r5.item_id = k.item_id
                                      AND r5.comment IS NOT NULL AND btrim(r5.comment) <> ''
                                    ORDER BY r5.updated_at DESC, r5.id DESC LIMIT 1)
                                END,
        'platforms',         CASE WHEN k.source = 'youtube' THEN '["YouTube"]'::jsonb
                                  ELSE (SELECT COALESCE(jsonb_agg(t.provider ORDER BY t.ord, t.provider), '[]'::jsonb)
                                          FROM (SELECT ia.provider,
                                                       min(CASE ia.offer_type WHEN 'flatrate' THEN 0 WHEN 'rent' THEN 1 ELSE 2 END) AS ord
                                                  FROM public.item_availability ia
                                                 WHERE ia.item_id = k.item_id AND ia.region_code = v_region
                                                 GROUP BY ia.provider
                                                 ORDER BY ord, ia.provider
                                                 LIMIT 2) t)
                                  END,
        'in_library',        EXISTS (SELECT 1 FROM public.node_items ni
                                      JOIN public.nodes n ON n.id = ni.node_id
                                     WHERE ni.item_id = k.item_id AND n.owner_id = v_uid
                                       AND n.deleted_at IS NULL),
        'recommended_again', (k.status = 'dismissed' AND k.state_updated_at IS NOT NULL
                              AND k.latest_at > k.state_updated_at),
        'latest_at',         k.latest_at
      ) AS card
    FROM kept k
  )
  SELECT jsonb_build_object(
    'cards', COALESCE((SELECT jsonb_agg(cards.card ORDER BY cards.sort_key DESC, cards.item_id DESC)
                        FROM cards), '[]'::jsonb),
    'next_cursor', CASE WHEN (SELECT count(*) FROM page) > v_limit
                        THEN (SELECT jsonb_build_object('key', kk.sort_key, 'item_id', kk.item_id)
                                FROM kept kk
                                ORDER BY kk.sort_key DESC, kk.item_id DESC
                                OFFSET (v_limit - 1) LIMIT 1)
                        ELSE NULL END,
    'counts', (SELECT jsonb_build_object(
                 'to_watch',  COALESCE(sum(cnt) FILTER (WHERE status = 'to_watch'), 0),
                 'watched',   COALESCE(sum(cnt) FILTER (WHERE status = 'watched'), 0),
                 'dismissed', COALESCE(sum(cnt) FILTER (WHERE status = 'dismissed'), 0))
                 FROM counts)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inbox(text, uuid, jsonb, text, numeric, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox(text, uuid, jsonb, text, numeric, uuid, integer) TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.5 get_friend_rail — "All" unseen total plus one row per
-- contributor ordered by last submission (unseen = the
-- contributor's recommendations carried by submissions with
-- seen_by_owner_at IS NULL, scoped to the caller's ask).
-- Blocked contributors are excluded. all_unseen = SUM by
-- construction.
-- ------------------------------------------------------------
CREATE FUNCTION public.get_friend_rail()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_ask   uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT a.id INTO v_ask FROM public.asks a WHERE a.owner_id = v_uid;
  WITH per_friend AS (
    SELECT r.contributor_id,
           c.display_name,
           count(*)::integer AS total_count,
           count(*) FILTER (WHERE s.seen_by_owner_at IS NULL)::integer AS unseen_count,
           max(s.created_at) AS last_submission_at
    FROM public.recommendations r
    JOIN public.submissions s ON s.id = r.submission_id
    JOIN public.contributors c ON c.id = r.contributor_id
    WHERE r.owner_id = v_uid
      AND s.ask_id = v_ask
      AND NOT EXISTS (SELECT 1 FROM public.owner_contributor_blocks b
                       WHERE b.owner_id = v_uid AND b.contributor_id = r.contributor_id)
    GROUP BY r.contributor_id, c.display_name
  )
  SELECT jsonb_build_object(
    'all_unseen', COALESCE(sum(unseen_count), 0),
    'friends', COALESCE(jsonb_agg(jsonb_build_object(
        'contributor_id',    contributor_id,
        'display_name',      display_name,
        'last_submission_at', last_submission_at,
        'unseen_count',      unseen_count,
        'total_count',       total_count)
      ORDER BY last_submission_at DESC, contributor_id), '[]'::jsonb)
  ) INTO v_result
  FROM per_friend;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_friend_rail() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_rail() TO authenticated, service_role;

-- ------------------------------------------------------------
-- §2.5 mark_friend_seen — stamp seen_by_owner_at = now() on
-- that contributor's unseen submissions TO THE CALLER'S ASK
-- only. cleared_recommendations counts the recommendations
-- those submissions carried, so all_unseen drops by exactly
-- that amount. Idempotent: a second call clears 0.
-- ------------------------------------------------------------
CREATE FUNCTION public.mark_friend_seen(p_contributor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_ask  uuid;
  v_subs integer;
  v_recs integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_contributor_id IS NULL THEN
    RAISE EXCEPTION 'invalid contributor' USING ERRCODE = '22023';
  END IF;
  SELECT a.id INTO v_ask FROM public.asks a WHERE a.owner_id = v_uid;
  IF v_ask IS NULL THEN
    RETURN jsonb_build_object('cleared_submissions', 0, 'cleared_recommendations', 0);
  END IF;
  SELECT count(*)::integer INTO v_recs
  FROM public.recommendations r
  WHERE r.owner_id = v_uid
    AND r.submission_id IN (
      SELECT s.id FROM public.submissions s
      WHERE s.ask_id = v_ask
        AND s.contributor_id = p_contributor_id
        AND s.seen_by_owner_at IS NULL);
  UPDATE public.submissions s
  SET seen_by_owner_at = now()
  WHERE s.ask_id = v_ask
    AND s.contributor_id = p_contributor_id
    AND s.seen_by_owner_at IS NULL;
  GET DIAGNOSTICS v_subs = ROW_COUNT;
  RETURN jsonb_build_object('cleared_submissions', v_subs,
                            'cleared_recommendations', v_recs);
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_friend_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_friend_seen(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- get_my_prefs — the caller's user_prefs row as jsonb. When the
-- caller has no row, the table defaults are returned and
-- NOTHING is created (pure read).
-- ------------------------------------------------------------
CREATE FUNCTION public.get_my_prefs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
           'region_code',      p.region_code,
           'notify_email',     COALESCE(p.notify_email, true),
           'theme',            COALESCE(p.theme, 'system'),
           'accent',           COALESCE(p.accent, 'orange'),
           'tmdb_lang',        p.tmdb_lang,
           'language_set_at',  p.language_set_at
         )
    INTO v_result
    FROM public.user_prefs p
   WHERE p.user_id = v_uid;
  IF NOT FOUND THEN
    v_result := jsonb_build_object(
      'region_code',     NULL,
      'notify_email',    true,
      'theme',           'system',
      'accent',          'orange',
      'tmdb_lang',       NULL,
      'language_set_at', NULL
    );
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_prefs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_prefs() TO authenticated, service_role;

-- ------------------------------------------------------------
-- set_my_prefs — partial update of user_prefs. NULL parameter =
-- unchanged; p_region_code = '' clears the region (stored NULL).
-- Provided values are validated against the user_prefs CHECKs
-- and rejected with 22023 before the upsert. tmdb_lang is NOT
-- settable here — it is derived by set_language.
-- ------------------------------------------------------------
CREATE FUNCTION public.set_my_prefs(
  p_region_code  text    DEFAULT NULL,
  p_notify_email boolean DEFAULT NULL,
  p_theme        text    DEFAULT NULL,
  p_accent       text    DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_region text := NULLIF(p_region_code, '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_region_code IS NOT NULL AND p_region_code <> '' AND p_region_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'invalid region_code' USING ERRCODE = '22023';
  END IF;
  IF p_theme IS NOT NULL AND p_theme NOT IN ('light', 'dark', 'system') THEN
    RAISE EXCEPTION 'invalid theme' USING ERRCODE = '22023';
  END IF;
  IF p_accent IS NOT NULL
     AND NOT (p_accent IN ('orange', 'blue', 'violet', 'teal', 'green', 'pink')
              OR p_accent ~ '^#[0-9A-Fa-f]{6}$') THEN
    RAISE EXCEPTION 'invalid accent' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.user_prefs (user_id, region_code, notify_email, theme, accent)
  VALUES (v_uid, v_region,
          COALESCE(p_notify_email, true),
          COALESCE(p_theme, 'system'),
          COALESCE(p_accent, 'orange'))
  ON CONFLICT (user_id) DO UPDATE SET
    region_code  = CASE WHEN p_region_code IS NULL THEN user_prefs.region_code ELSE v_region END,
    notify_email = COALESCE(p_notify_email, user_prefs.notify_email),
    theme        = COALESCE(p_theme, user_prefs.theme),
    accent       = COALESCE(p_accent, user_prefs.accent),
    updated_at   = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_prefs(text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_prefs(text, boolean, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- enqueue_stale_enrichment — opportunistic kick (PLAN §6.6):
-- when the owner opens the inbox, items in the CALLER'S OWN
-- recommendations whose enrichment is 'pending'/'partial', or
-- whose fetched_at is stale per the §6.5 windows (YouTube
-- 20 days, TMDB 5 months; NULL fetched_at counts as stale),
-- get their missing enrichment_jobs rows. Job params mirror
-- submit_recommendations step 11 (migration 144): 'details'
-- with the owner's tmdb_lang (default 'en-US'), 'availability'
-- with the owner's region (default 'US').
-- Idempotent: existing (item_id, job_kind, param) rows are
-- skipped via ON CONFLICT DO NOTHING (and pre-filtered by
-- NOT EXISTS so the 50-row cap is never wasted on conflicts).
-- At most 50 jobs are enqueued per call, in deterministic
-- (item_id, details-first) order; returns rows inserted.
-- ------------------------------------------------------------
CREATE FUNCTION public.enqueue_stale_enrichment()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_tag     text;
  v_region  text;
  v_enqueued integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE((SELECT up.tmdb_lang FROM public.user_prefs up WHERE up.user_id = v_uid), 'en-US'),
         COALESCE((SELECT up.region_code FROM public.user_prefs up WHERE up.user_id = v_uid), 'US')
    INTO v_tag, v_region;
  WITH stale_items AS (
    SELECT DISTINCT i.id
    FROM public.items i
    WHERE EXISTS (SELECT 1 FROM public.recommendations r
                   WHERE r.owner_id = v_uid AND r.item_id = i.id)
      AND (i.enrichment_status IN ('pending', 'partial')
           OR i.fetched_at IS NULL
           OR (i.source = 'youtube' AND i.fetched_at < now() - interval '20 days')
           OR (i.source = 'tmdb'    AND i.fetched_at < now() - interval '5 months'))
  ),
  candidates AS (
    SELECT si.id AS item_id, 'details' AS job_kind, v_tag AS param
    FROM stale_items si
    WHERE NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                       WHERE j.item_id = si.id AND j.job_kind = 'details' AND j.param = v_tag)
    UNION ALL
    SELECT si.id, 'availability', v_region
    FROM stale_items si
    WHERE NOT EXISTS (SELECT 1 FROM public.enrichment_jobs j
                       WHERE j.item_id = si.id AND j.job_kind = 'availability' AND j.param = v_region)
  ),
  picked AS (
    SELECT c.item_id, c.job_kind, c.param
    FROM candidates c
    ORDER BY c.item_id, CASE c.job_kind WHEN 'details' THEN 0 ELSE 1 END
    LIMIT 50
  )
  INSERT INTO public.enrichment_jobs (item_id, job_kind, param)
  SELECT p.item_id, p.job_kind, p.param FROM picked p
  ON CONFLICT (item_id, job_kind, param) DO NOTHING;
  GET DIAGNOSTICS v_enqueued = ROW_COUNT;
  RETURN v_enqueued;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_stale_enrichment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_stale_enrichment() TO authenticated, service_role;

-- ------------------------------------------------------------
-- set_language — CREATE OR REPLACE (live body diff: adds 'es'
-- to the allowed codes; adds the user_prefs upsert that stamps
-- language_set_at = now() and derives tmdb_lang from the UI
-- code per the LANGUAGES config — en->en-US, fr->fr-FR,
-- es->es-ES, th->th-TH; es-MX stays a client-side
-- Accept-Language variant, PLAN §6.3). ACL unchanged:
-- CREATE OR REPLACE preserves proacl
-- ({postgres,authenticated,service_role} — verified live).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_language(p_language_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_language_code NOT IN ('en', 'fr', 'th', 'es') THEN
    RAISE EXCEPTION 'unsupported language' USING ERRCODE = '22023';
  END IF;
  UPDATE users SET language_code = p_language_code WHERE id = auth.uid();
  INSERT INTO public.user_prefs (user_id, tmdb_lang, language_set_at)
  VALUES (auth.uid(),
          CASE p_language_code
            WHEN 'en' THEN 'en-US'
            WHEN 'fr' THEN 'fr-FR'
            WHEN 'es' THEN 'es-ES'
            WHEN 'th' THEN 'th-TH'
          END,
          now())
  ON CONFLICT (user_id) DO UPDATE
    SET tmdb_lang = EXCLUDED.tmdb_lang,
        language_set_at = now(),
        updated_at = now();
END;
$function$;
