-- ============================================================
-- Migration 148 — v2 Recommendation Inbox: get_inbox_item
-- class-O function (PLAN-V2-002 §1.3, §2.5, §6.3; task
-- V2-W5-MIG147-1125-001)
-- ============================================================
-- One new SECURITY DEFINER function, class O (owner):
--   get_inbox_item(p_item_id uuid) RETURNS jsonb
--
-- Security posture identical to migration 145 (§1.3 class O):
--   in-body guard v_uid := auth.uid(); NULL -> 42501.
--   NO user-id/owner-id parameter — the caller is always
--   auth.uid() (no IDOR surface). EXECUTE revoked from
--   PUBLIC/anon and granted to authenticated + service_role
--   (pg_default_acl auto-grants new functions to
--   anon/authenticated, so the REVOKE is required).
--
-- Scope guard (task): NO new tables, NO policies, NO table
-- grants, NO DROPs, nothing touching edges/causes/folder_edges,
-- get_feed untouched, no link-management object touched.
-- Depends only on migrations 142/143/145 objects.
-- ============================================================

-- ------------------------------------------------------------
-- get_inbox_item — the owner's detail view of ONE inbox item.
-- Same visibility gate as get_inbox: the caller must own at
-- least one recommendation for the item, else NULL is returned
-- (not an error — no existence oracle). Language fallback chain
-- and region fallback are the get_inbox ones: name/overview via
-- localized[tmdb_lang] -> localized['en-US'] -> base column;
-- tmdb_lang default 'en-US', region_code default 'US'.
--
-- Shape:
--   { item: {id, source, kind, external_id, name, overview,
--            release_date, runtime_min, genres, poster_path,
--            thumb_url, trailer_url, tmdb_rating, tmdb_votes,
--            display_status, enrichment_status},
--     recommenders: [{name, initials, rating, comment,
--                     platform_text, created_at}]
--             newest first, max 50; contributors the owner
--             blocked (owner_contributor_blocks, same
--             predicate as get_friend_rail) are excluded;
--             no contributor ids are exposed,
--     owner_status: owner_item_state.status or 'to_watch' }
-- ------------------------------------------------------------
CREATE FUNCTION public.get_inbox_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_tag    text;
  v_region text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE((SELECT up.tmdb_lang FROM public.user_prefs up WHERE up.user_id = v_uid), 'en-US'),
         COALESCE((SELECT up.region_code FROM public.user_prefs up WHERE up.user_id = v_uid), 'US')
    INTO v_tag, v_region;
  SELECT jsonb_build_object(
    'item', jsonb_build_object(
      'id',                i.id,
      'source',            i.source,
      'kind',              i.kind,
      'external_id',       i.external_id,
      'name',              COALESCE(NULLIF(i.localized -> v_tag ->> 'name', ''),
                                   NULLIF(i.localized -> 'en-US' ->> 'name', ''),
                                   i.name),
      'overview',          COALESCE(NULLIF(i.localized -> v_tag ->> 'overview', ''),
                                   NULLIF(i.localized -> 'en-US' ->> 'overview', ''),
                                   i.overview),
      'release_date',      i.release_date,
      'runtime_min',       i.runtime_min,
      'genres',            i.genres,
      'poster_path',       i.poster_path,
      'thumb_url',         i.thumb_url,
      'trailer_url',       i.trailer_url,
      'tmdb_rating',       i.tmdb_rating,
      'tmdb_votes',        i.tmdb_votes,
      'display_status',    i.display_status,
      'enrichment_status', i.enrichment_status),
    'recommenders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name',          x.display_name,
               'initials',      x.initials,
               'rating',        x.rating,
               'comment',       x.comment,
               'platform_text', x.platform_text,
               'created_at',    x.created_at)
             ORDER BY x.created_at DESC, x.id DESC)
      FROM (
        SELECT r.id, r.rating, r.comment, r.platform_text, r.created_at,
               c.display_name,
               upper(left(split_part(regexp_replace(btrim(c.display_name), '\s+', ' ', 'g'), ' ', 1), 1)
                    || COALESCE(NULLIF(left(split_part(regexp_replace(btrim(c.display_name), '\s+', ' ', 'g'), ' ', 2), 1), ''), '')) AS initials
        FROM public.recommendations r
        JOIN public.contributors c ON c.id = r.contributor_id
        WHERE r.owner_id = v_uid
          AND r.item_id = i.id
          AND NOT EXISTS (SELECT 1 FROM public.owner_contributor_blocks b
                           WHERE b.owner_id = v_uid
                             AND b.contributor_id = r.contributor_id)
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 50
      ) AS x), '[]'::jsonb),
    'owner_status', COALESCE((
      SELECT ois.status FROM public.owner_item_state ois
      WHERE ois.owner_id = v_uid AND ois.item_id = i.id), 'to_watch')
  ) INTO v_result
  FROM public.items i
  WHERE i.id = p_item_id
    AND EXISTS (SELECT 1 FROM public.recommendations r0
                 WHERE r0.owner_id = v_uid AND r0.item_id = p_item_id);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inbox_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_item(uuid) TO authenticated, service_role;
