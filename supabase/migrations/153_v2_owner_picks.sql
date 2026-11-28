-- ============================================================
-- Migration 153 — v2 owner picks
-- V2-W9-LIBRARY-1128-001 / PLAN-V2-002 §2.9, decisions D35-D36
-- private = no row. Rows are visible only through class-S/O RPCs;
-- the table grants nothing to PUBLIC/anon/authenticated.
-- ============================================================

CREATE TABLE public.owner_picks (
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  visibility text NOT NULL CHECK (visibility IN ('contributors', 'public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, node_id)
);
ALTER TABLE public.owner_picks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_picks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_picks TO service_role;

-- set_pick_visibility — private deletes the row; contributor/public upsert it.
CREATE FUNCTION public.set_pick_visibility(p_node_id uuid, p_visibility text)
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
  IF p_visibility NOT IN ('private', 'contributors', 'public') THEN
    RAISE EXCEPTION 'BAD_VISIBILITY' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.nodes n
    JOIN public.node_items ni ON ni.node_id = n.id
    WHERE n.id = p_node_id AND n.owner_id = v_uid AND n.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_visibility = 'private' THEN
    DELETE FROM public.owner_picks WHERE owner_id = v_uid AND node_id = p_node_id;
  ELSE
    INSERT INTO public.owner_picks (owner_id, node_id, visibility)
    VALUES (v_uid, p_node_id, p_visibility)
    ON CONFLICT (owner_id, node_id) DO UPDATE SET visibility = EXCLUDED.visibility;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_pick_visibility(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pick_visibility(uuid, text) TO authenticated, service_role;

-- list_my_picks — owner management list, item fields only plus node_id needed
-- as the management key. No contributor data is returned.
CREATE FUNCTION public.list_my_picks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tag text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE((SELECT up.tmdb_lang FROM public.user_prefs up WHERE up.user_id = v_uid), 'en-US') INTO v_tag;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'node_id', op.node_id,
      'item_id', i.id,
      'kind', i.kind,
      'external_id', i.external_id,
      'source', i.source,
      'name', COALESCE(NULLIF(i.localized -> v_tag ->> 'name', ''), NULLIF(i.localized -> 'en-US' ->> 'name', ''), i.name),
      'release_date', i.release_date,
      'poster_path', i.poster_path,
      'thumb_url', i.thumb_url,
      'visibility', op.visibility,
      'created_at', op.created_at
    ) ORDER BY op.created_at DESC, op.node_id)
    FROM public.owner_picks op
    JOIN public.nodes n ON n.id = op.node_id
    JOIN public.node_items ni ON ni.node_id = op.node_id
    JOIN public.items i ON i.id = ni.item_id
    WHERE op.owner_id = v_uid AND n.owner_id = v_uid AND n.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_my_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_picks() TO authenticated, service_role;

-- guest_get_picks — service-role-only guest read. It returns item fields and
-- localized names only (never nodes/tables/owner ids). Eligibility requires at
-- least one submission by this contributor to the owner of this ask token.
CREATE FUNCTION public.guest_get_picks(p_ask_token text, p_contributor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT a.owner_id INTO v_owner FROM public.asks a WHERE a.token = p_ask_token AND a.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASK_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN public.asks a ON a.id = s.ask_id
    WHERE s.contributor_id = p_contributor_id AND a.owner_id = v_owner
  ) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'kind', i.kind,
      'external_id', i.external_id,
      'source', i.source,
      'name', i.name,
      'release_date', i.release_date,
      'release_year', NULLIF(left(i.release_date::text, 4), '')::int,
      'poster_path', i.poster_path,
      'thumb_url', i.thumb_url,
      'localized_names', COALESCE((SELECT jsonb_object_agg(k, v ->> 'name') FROM jsonb_each(i.localized) AS x(k, v) WHERE v ? 'name'), '{}'::jsonb)
    ) ORDER BY op.created_at DESC, op.node_id)
    FROM public.owner_picks op
    JOIN public.node_items ni ON ni.node_id = op.node_id
    JOIN public.items i ON i.id = ni.item_id
    JOIN public.nodes n ON n.id = op.node_id
    WHERE op.owner_id = v_owner
      AND op.visibility IN ('contributors', 'public')
      AND n.owner_id = v_owner
      AND n.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.guest_get_picks(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_get_picks(text, uuid) TO service_role;

-- guest_get_ask already carried the contract field owner_has_visible_picks as
-- false in migration 144. Make that existing field truthful without changing
-- its shape or exposing owner_id.
CREATE OR REPLACE FUNCTION public.guest_get_ask(p_token text)
 RETURNS TABLE(ask_id uuid, owner_display_name text, owner_avatar_key text, prompt text, note text, liked_genres integer[], owner_has_visible_picks boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_ask_id    uuid;
  v_owner     uuid;
  v_name      text;
  v_avatar    text;
  v_prompt    text;
  v_note      text;
  v_genres    integer[];
  v_has_picks boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT a.id, a.owner_id, u.display_name, u.avatar_key, a.prompt, a.note, a.liked_genres
  INTO v_ask_id, v_owner, v_name, v_avatar, v_prompt, v_note, v_genres
  FROM public.asks a
  JOIN public.users u ON u.id = a.owner_id
  WHERE a.token = p_token AND a.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASK_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.owner_picks op
    JOIN public.nodes n ON n.id = op.node_id
    WHERE op.owner_id = v_owner AND op.visibility IN ('contributors','public') AND n.deleted_at IS NULL
  ) INTO v_has_picks;
  RETURN QUERY SELECT v_ask_id, v_name, v_avatar, v_prompt, v_note, v_genres, v_has_picks;
END;
$function$;
REVOKE ALL ON FUNCTION public.guest_get_ask(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_get_ask(text) TO service_role;
