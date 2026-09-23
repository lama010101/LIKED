-- ============================================================
-- Migration 107 — Onboarding flags + auth-scoped RPCs
-- (COMPLETE-APP-002 / ONBOARD-001)
-- ============================================================
-- A4a BACKFILL: both flags are set to now() for every pre-existing users
-- row, so reduced-v1 onboarding can only ever trigger for accounts
-- created after this migration (new rows keep NULL defaults).
-- A4d Caller identity is auth.uid() only — no p_user_id anywhere (G-1).
-- A4e "youtube_connected" = non-revoked connection with a refresh token;
--     when false the client skips the import silently.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ;

UPDATE public.users
SET onboarding_imported_at = now(),
    onboarding_dismissed_at = now()
WHERE onboarding_imported_at IS NULL
   OR onboarding_dismissed_at IS NULL;

-- ── Read: full onboarding state for the current caller ───────
CREATE OR REPLACE FUNCTION public.get_onboarding_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_imported TIMESTAMPTZ;
  v_dismissed TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT u.onboarding_imported_at, u.onboarding_dismissed_at
    INTO v_imported, v_dismissed
    FROM public.users u
   WHERE u.id = v_uid;

  RETURN jsonb_build_object(
    'imported', v_imported IS NOT NULL,
    'dismissed', v_dismissed IS NOT NULL,
    'youtube_connected', EXISTS (
      SELECT 1 FROM public.youtube_connections yc
      WHERE yc.user_id = v_uid
        AND yc.revoked_at IS NULL
        AND yc.refresh_token IS NOT NULL
    ),
    'import_count', (
      SELECT COUNT(DISTINCT e.node_id) FROM public.edges e
      JOIN public.causes c ON c.id = e.cause_id
      JOIN public.nodes n ON n.id = e.node_id
      WHERE e.user_id = v_uid
        AND c.cause_type = 'import'
        AND c.created_by = v_uid
        AND n.deleted_at IS NULL
        AND (n.url ILIKE '%youtube.com/watch%' OR n.url ILIKE '%youtu.be/%')
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_onboarding_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_state() TO authenticated;

-- ── Write: set one onboarding flag for the current caller ────
-- COALESCE keeps the first write (idempotent; re-runs never move the
-- timestamp). Only 'imported' and 'dismissed' are valid steps.
CREATE OR REPLACE FUNCTION public.set_onboarding_flag(p_step TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_step = 'imported' THEN
    UPDATE public.users
       SET onboarding_imported_at = COALESCE(onboarding_imported_at, now())
     WHERE id = v_uid;
  ELSIF p_step = 'dismissed' THEN
    UPDATE public.users
       SET onboarding_dismissed_at = COALESCE(onboarding_dismissed_at, now())
     WHERE id = v_uid;
  ELSE
    RAISE EXCEPTION 'invalid onboarding step: %', p_step USING ERRCODE = '22023';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_onboarding_flag(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_onboarding_flag(TEXT) TO authenticated;

-- ── Read: node_ids of the caller's imported YouTube liked videos ──
-- Edge-scoped (visibility = edges): only nodes the caller holds an edge
-- to, whose cause is the caller's own 'import' cause, on a YouTube watch
-- URL. Powers the single-folder CTA (A4b) — grouping happens client-side.
CREATE OR REPLACE FUNCTION public.get_onboarding_import_node_ids()
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT array_agg(DISTINCT e.node_id)
      FROM public.edges e
      JOIN public.causes c ON c.id = e.cause_id
      JOIN public.nodes n ON n.id = e.node_id
     WHERE e.user_id = v_uid
       AND c.cause_type = 'import'
       AND c.created_by = v_uid
       AND n.deleted_at IS NULL
       AND (n.url ILIKE '%youtube.com/watch%' OR n.url ILIKE '%youtu.be/%')
  ), '{}'::uuid[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_onboarding_import_node_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_import_node_ids() TO authenticated;
