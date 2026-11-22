-- ============================================================
-- Migration 144 — v2 Recommendation Inbox: guest + submit
-- class-S functions (PLAN-V2-002 §1.3, §2.2, §2.3, §2.4,
-- §2.10, §2.11, §11.2 D-6; task V2-W2-P0-03, PLAN P0-03)
-- ============================================================
-- Nine SECURITY DEFINER functions, all class S (server-only):
--   guest_get_ask, guest_create_contributor, guest_rename,
--   guest_touch, guest_verify, submit_recommendations,
--   guest_get_receipt, delete_guest_data, upsert_item.
--
-- Security posture identical to migration 143 (§1.3):
--   in-body guard auth.role() = 'service_role' (42501),
--   EXECUTE revoked from PUBLIC/anon/authenticated and granted
--   to service_role only. pg_default_acl auto-grants new
--   functions to anon/authenticated, so the REVOKE is required.
--
-- Scope guard (task R2): NO new tables, NO policies, NO table
-- grants, NO changes/DROPs to existing objects, nothing touching
-- edges/causes/folder_edges, get_feed untouched, no
-- link-management object touched (LINKS-PAUSE).
-- ============================================================

-- ------------------------------------------------------------
-- §2.2 guest_get_ask — landing read. One identical
-- ASK_NOT_ACTIVE for unknown / disabled / regenerated token
-- (no oracle). Never returns owner_id.
-- ------------------------------------------------------------
CREATE FUNCTION public.guest_get_ask(p_token text)
 RETURNS TABLE(ask_id uuid, owner_display_name text, owner_avatar_key text, prompt text, note text, liked_genres integer[], owner_has_visible_picks boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_ask_id    uuid;
  v_name      text;
  v_avatar    text;
  v_prompt    text;
  v_note      text;
  v_genres    integer[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT a.id, u.display_name, u.avatar_key, a.prompt, a.note, a.liked_genres
  INTO v_ask_id, v_name, v_avatar, v_prompt, v_note, v_genres
  FROM public.asks a
  JOIN public.users u ON u.id = a.owner_id
  WHERE a.token = p_token AND a.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASK_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT v_ask_id, v_name, v_avatar, v_prompt, v_note, v_genres, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_get_ask(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_get_ask(text) TO service_role;

-- ------------------------------------------------------------
-- §2.2 guest_create_contributor — mint a contributors row for a
-- new guest. Name rule 2-50 chars -> FIELD_TOO_LONG (same code
-- the §2 error table assigns to "name outside 2-50").
-- ------------------------------------------------------------
CREATE FUNCTION public.guest_create_contributor(p_name text, p_secret_hash bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.contributors (display_name, secret_hash)
  VALUES (btrim(p_name), p_secret_hash)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_create_contributor(text, bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_create_contributor(text, bytea) TO service_role;

-- ------------------------------------------------------------
-- §2.2 guest_rename — update the remembered guest name.
-- ------------------------------------------------------------
CREATE FUNCTION public.guest_rename(p_contributor_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  UPDATE public.contributors
  SET display_name = btrim(p_name)
  WHERE id = p_contributor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_rename(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_rename(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- §2.2 guest_touch — bump last_seen_at (drives the §11 D-5
-- retention job). Missing contributor = no-op.
-- ------------------------------------------------------------
CREATE FUNCTION public.guest_touch(p_contributor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.contributors
  SET last_seen_at = now()
  WHERE id = p_contributor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_touch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_touch(uuid) TO service_role;

-- ------------------------------------------------------------
-- §2.2 guest_verify — return the stored secret_hash so the
-- ROUTE does the constant-time compare (never in SQL).
-- CONTRIBUTOR_INVALID if the row is missing.
-- ------------------------------------------------------------
CREATE FUNCTION public.guest_verify(p_contributor_id uuid)
 RETURNS bytea
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_hash bytea;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT c.secret_hash INTO v_hash
  FROM public.contributors c
  WHERE c.id = p_contributor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_hash;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_verify(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_verify(uuid) TO service_role;

-- ------------------------------------------------------------
-- §2.3 submit_recommendations — the single guest write path.
-- One transaction; any failure rolls everything back (PRD §13).
-- Steps follow the plan order: batch shape -> ask/contributor ->
-- blocked/self -> idempotent replay -> daily cap -> per-item
-- validation + last-wins dedup -> submission -> recommendations
-- upsert -> notification -> enrichment jobs -> email outbox.
-- ------------------------------------------------------------
CREATE FUNCTION public.submit_recommendations(
  p_ask_token       text,
  p_contributor_id  uuid,
  p_client_batch_id uuid,
  p_items           jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_ask_id        uuid;
  v_owner_id      uuid;
  v_owner_name    text;
  v_contrib_name  text;
  v_contrib_claimed uuid;
  v_batch_count   integer;
  v_daily_used    integer;
  v_submission_id uuid;
  v_new_count     integer;
  v_items         jsonb := '[]'::jsonb;
  v_dedup         jsonb;
  v_elem          jsonb;
  v_ord           bigint;
  v_item_id       uuid;
  v_item_raw      text;
  v_rating_type   text;
  v_rating        numeric;
  v_rating_small  smallint;
  v_platform      text;
  v_comment       text;
  v_tmdb_lang     text;
  v_region        text;
  v_notify        boolean;
  v_payload       jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- step 2: batch shape
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'EMPTY_BATCH' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_BATCH' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'TOO_MANY_ITEMS' USING ERRCODE = '22023';
  END IF;

  -- step 3: ask (token + is_active) and contributor
  SELECT a.id, a.owner_id, u.display_name
  INTO v_ask_id, v_owner_id, v_owner_name
  FROM public.asks a
  JOIN public.users u ON u.id = a.owner_id
  WHERE a.token = p_ask_token AND a.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASK_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.display_name, c.claimed_by_user_id
  INTO v_contrib_name, v_contrib_claimed
  FROM public.contributors c
  WHERE c.id = p_contributor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- step 4: not blocked; not self-recommend
  IF EXISTS (
    SELECT 1 FROM public.owner_contributor_blocks b
    WHERE b.owner_id = v_owner_id AND b.contributor_id = p_contributor_id
  ) THEN
    RAISE EXCEPTION 'CONTRIBUTOR_BLOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF v_contrib_claimed IS NOT NULL AND v_contrib_claimed = v_owner_id THEN
    RAISE EXCEPTION 'SELF_RECOMMEND' USING ERRCODE = 'P0001';
  END IF;

  -- step 5: idempotency on (contributor_id, client_batch_id)
  SELECT s.id, s.title_count
  INTO v_submission_id, v_new_count
  FROM public.submissions s
  WHERE s.contributor_id = p_contributor_id
    AND s.client_batch_id = p_client_batch_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'submission_id',     v_submission_id,
      'accepted',          v_new_count,
      'replayed',          true,
      'owner_display_name', v_owner_name
    );
  END IF;

  -- step 6: daily cap — sum(title_count) of the contributor's
  -- submissions in the sliding 24 h window + this batch > 100.
  -- new count = distinct item references in the batch.
  SELECT count(DISTINCT e.elem->>'item_id')
  INTO v_batch_count
  FROM jsonb_array_elements(p_items) AS e(elem);
  SELECT COALESCE(sum(s.title_count), 0)::integer
  INTO v_daily_used
  FROM public.submissions s
  WHERE s.contributor_id = p_contributor_id
    AND s.created_at >= now() - interval '24 hours';
  IF v_daily_used + COALESCE(v_batch_count, 0) > 100 THEN
    RAISE EXCEPTION 'DAILY_CAP' USING ERRCODE = 'P0001';
  END IF;

  -- step 7: per-item validation; duplicates inside one batch
  -- collapse, last wins (dedup after the loop).
  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality)
    ORDER BY e.ordinality
  LOOP
    -- item_id must be a uuid that exists in items
    v_item_raw := v_elem->>'item_id';
    BEGIN
      v_item_id := v_item_raw::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_ITEM' USING ERRCODE = '22023';
    END;
    IF v_item_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id = v_item_id) THEN
      RAISE EXCEPTION 'INVALID_ITEM' USING ERRCODE = '22023';
    END IF;

    -- rating: absent/null -> NULL; integer 0-100 otherwise
    -- (explicit 0 stored as 0; 1.5 / 101 / -1 / non-number -> INVALID_RATING)
    v_rating_type := jsonb_typeof(v_elem->'rating');
    IF v_rating_type IS NULL OR v_rating_type = 'null' THEN
      v_rating_small := NULL;
    ELSIF v_rating_type = 'number' THEN
      v_rating := (v_elem->>'rating')::numeric;
      IF v_rating <> trunc(v_rating) OR v_rating < 0 OR v_rating > 100 THEN
        RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = '22023';
      END IF;
      v_rating_small := v_rating::smallint;
    ELSE
      RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = '22023';
    END IF;

    v_platform := v_elem->>'platform';
    IF v_platform IS NOT NULL AND char_length(v_platform) > 60 THEN
      RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
    END IF;
    v_comment := v_elem->>'comment';
    IF v_comment IS NOT NULL AND char_length(v_comment) > 280 THEN
      RAISE EXCEPTION 'FIELD_TOO_LONG' USING ERRCODE = '22023';
    END IF;

    v_items := v_items || jsonb_build_object(
      'item_id',  v_item_id,
      'rating',   v_rating_small,
      'platform', v_platform,
      'comment',  v_comment
    );
  END LOOP;

  -- dedup: keep the LAST occurrence of each item_id
  SELECT COALESCE(jsonb_agg(d.elem ORDER BY d.ord), '[]'::jsonb)
  INTO v_dedup
  FROM (
    SELECT DISTINCT ON (x.elem->>'item_id') x.elem, x.ord
    FROM jsonb_array_elements(v_items) WITH ORDINALITY AS x(elem, ord)
    ORDER BY x.elem->>'item_id', x.ord DESC
  ) AS d(elem, ord);
  v_new_count := jsonb_array_length(v_dedup);

  -- step 8: submission row
  INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count)
  VALUES (v_ask_id, p_contributor_id, p_client_batch_id, v_new_count)
  RETURNING id INTO v_submission_id;

  -- step 9: recommendations — latest values win
  INSERT INTO public.recommendations
    (owner_id, item_id, contributor_id, submission_id, rating, platform_text, comment)
  SELECT v_owner_id,
         (d.elem->>'item_id')::uuid,
         p_contributor_id,
         v_submission_id,
         NULLIF(d.elem->>'rating', '')::smallint,
         d.elem->>'platform',
         d.elem->>'comment'
  FROM jsonb_array_elements(v_dedup) AS d(elem)
  ON CONFLICT (owner_id, item_id, contributor_id) DO UPDATE SET
    rating        = EXCLUDED.rating,
    platform_text = EXCLUDED.platform_text,
    comment       = EXCLUDED.comment,
    submission_id = EXCLUDED.submission_id,
    updated_at    = now();

  -- step 10: one notification per submission
  v_payload := jsonb_build_object(
    'submission_id',      v_submission_id,
    'contributor_id',     p_contributor_id,
    'contributor_name',   v_contrib_name,
    'count',              v_new_count,
    'ask_id',             v_ask_id
  );
  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (v_owner_id, 'recommendation_received', v_payload);

  -- step 11: enrichment jobs — details (owner's tmdb_lang, D-6
  -- style fallback 'en-US' when unset) + availability (owner's
  -- region, fallback 'US' when unset). ON CONFLICT DO NOTHING.
  SELECT up.tmdb_lang, up.region_code, up.notify_email
  INTO v_tmdb_lang, v_region, v_notify
  FROM public.user_prefs up
  WHERE up.user_id = v_owner_id;
  IF NOT FOUND THEN
    v_tmdb_lang := NULL;
    v_region    := NULL;
    v_notify    := NULL;
  END IF;
  v_tmdb_lang := COALESCE(v_tmdb_lang, 'en-US');
  v_region    := COALESCE(v_region, 'US');
  v_notify    := COALESCE(v_notify, true);

  INSERT INTO public.enrichment_jobs (item_id, job_kind, param)
  SELECT (d.elem->>'item_id')::uuid, 'details', v_tmdb_lang
  FROM jsonb_array_elements(v_dedup) AS d(elem)
  ON CONFLICT (item_id, job_kind, param) DO NOTHING;

  INSERT INTO public.enrichment_jobs (item_id, job_kind, param)
  SELECT (d.elem->>'item_id')::uuid, 'availability', v_region
  FROM jsonb_array_elements(v_dedup) AS d(elem)
  ON CONFLICT (item_id, job_kind, param) DO NOTHING;

  -- step 12: email outbox when the owner has notify_email (default true)
  IF v_notify THEN
    INSERT INTO public.email_outbox (owner_id, kind, payload)
    VALUES (v_owner_id, 'recommendation_received', v_payload);
  END IF;

  RETURN jsonb_build_object(
    'submission_id',      v_submission_id,
    'accepted',           v_new_count,
    'replayed',           false,
    'owner_display_name', v_owner_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_recommendations(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_recommendations(text, uuid, uuid, jsonb) TO service_role;

-- ------------------------------------------------------------
-- §2.4 guest_get_receipt — the guest's own receipt for one ask.
-- WHERE clause is the only path: contributor_id = p AND
-- owner_id = ask.owner_id — nothing from other contributors or
-- other owners can be selected. Same ASK_NOT_ACTIVE /
-- CONTRIBUTOR_INVALID answers as submit (no oracle).
-- NOTE: the specified signature carries no viewer-language
-- parameter; name resolves through the §6.3 fallback chain at
-- the 'en-US' rung (guest TMDB tag is cookie-side, not in DB).
-- ------------------------------------------------------------
CREATE FUNCTION public.guest_get_receipt(p_ask_token text, p_contributor_id uuid)
 RETURNS TABLE(item_id uuid, kind text, name text, year integer, poster_path text, thumb_url text, rating smallint, platform_text text, comment text, updated_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_owner_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT a.owner_id INTO v_owner_id
  FROM public.asks a
  WHERE a.token = p_ask_token AND a.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASK_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contributors c WHERE c.id = p_contributor_id) THEN
    RAISE EXCEPTION 'CONTRIBUTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT r.item_id,
         i.kind,
         COALESCE(NULLIF(i.localized->'en-US'->>'name', ''), i.name),
         EXTRACT(YEAR FROM i.release_date)::integer,
         i.poster_path,
         i.thumb_url,
         r.rating,
         r.platform_text,
         r.comment,
         r.updated_at
  FROM public.recommendations r
  JOIN public.items i ON i.id = r.item_id
  WHERE r.owner_id = v_owner_id
    AND r.contributor_id = p_contributor_id
  ORDER BY r.created_at, r.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_get_receipt(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_get_receipt(text, uuid) TO service_role;

-- ------------------------------------------------------------
-- §2.10 delete_guest_data — guest "Delete my data". One
-- transaction: purge recommendation_received notifications by
-- payload contributor_id, delete youtube_search_budget rows
-- 'c:<id>', delete the contributors row (cascade removes
-- submissions, recommendations, owner_contributor_blocks).
-- Idempotent: second call returns {deleted:false}.
-- ------------------------------------------------------------
CREATE FUNCTION public.delete_guest_data(p_contributor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_deleted boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contributors c WHERE c.id = p_contributor_id) THEN
    DELETE FROM public.notifications n
    WHERE n.type = 'recommendation_received'
      AND n.payload->>'contributor_id' = p_contributor_id::text;
    DELETE FROM public.youtube_search_budget b
    WHERE b.scope = 'c:' || p_contributor_id::text;
    DELETE FROM public.contributors c
    WHERE c.id = p_contributor_id;
    v_deleted := true;
  END IF;
  RETURN jsonb_build_object('deleted', v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_guest_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_data(uuid) TO service_role;

-- ------------------------------------------------------------
-- §2.11 upsert_item — the only way items are created:
-- INSERT ... ON CONFLICT (source,kind,external_id) DO NOTHING,
-- then return the row. p_base carries server-fetched fields
-- only; a fixed whitelist of content columns is read from it —
-- identity/system columns (id, source, kind, external_id,
-- created_at, display_status, enrichment_status, localized)
-- and any other key are ignored. fetched_at may be supplied by
-- the server (YouTube cache timestamp, §6.4) else now().
-- ------------------------------------------------------------
CREATE FUNCTION public.upsert_item(p_source text, p_kind text, p_external_id text, p_base jsonb)
 RETURNS public.items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.items (
    source, kind, external_id,
    name, release_date, original_language, genres, is_documentary, overview,
    runtime_min, poster_path, thumb_url, creator_id, creator_name, trailer_url,
    tmdb_rating, tmdb_votes, fetched_at
  )
  SELECT
    p_source,
    p_kind,
    p_external_id,
    NULLIF(p_base->>'name', ''),
    NULLIF(p_base->>'release_date', '')::date,
    NULLIF(p_base->>'original_language', ''),
    CASE WHEN jsonb_typeof(p_base->'genres') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_base->'genres'))
         ELSE '{}'::text[] END,
    COALESCE((p_base->>'is_documentary')::boolean, false),
    NULLIF(p_base->>'overview', ''),
    NULLIF(p_base->>'runtime_min', '')::integer,
    NULLIF(p_base->>'poster_path', ''),
    NULLIF(p_base->>'thumb_url', ''),
    NULLIF(p_base->>'creator_id', ''),
    NULLIF(p_base->>'creator_name', ''),
    NULLIF(p_base->>'trailer_url', ''),
    NULLIF(p_base->>'tmdb_rating', '')::numeric,
    NULLIF(p_base->>'tmdb_votes', '')::integer,
    COALESCE(NULLIF(p_base->>'fetched_at', '')::timestamptz, now())
  ON CONFLICT (source, kind, external_id) DO NOTHING;
  RETURN (
    SELECT i FROM public.items i
    WHERE i.source = p_source
      AND i.kind = p_kind
      AND i.external_id = p_external_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_item(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_item(text, text, text, jsonb) TO service_role;
