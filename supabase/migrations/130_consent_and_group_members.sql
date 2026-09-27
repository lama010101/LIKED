-- ============================================================
-- Migration 130 — MVP2 P2-09 (Q13, Q4): consent + group membership RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- set_youtube_import_consent: the confirmation-modal timestamp is the single
-- source of truth for "may import" (Q13) — nothing imports at sign-in.
-- add/remove_group_member: groups are organizing tools (Q4); membership
-- changes never re-expand past shares.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_youtube_import_consent(p_consent BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE users
     SET youtube_import_consent_at = CASE WHEN p_consent THEN now() ELSE NULL END
   WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_youtube_import_consent(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_youtube_import_consent(BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_group_member(p_group_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (public.group_is_owned(p_group_id, v_uid) OR public.is_group_admin(p_group_id, v_uid)) THEN
    RAISE EXCEPTION 'not a group admin' USING ERRCODE = '42501';
  END IF;
  INSERT INTO group_members (group_id, user_id)
  VALUES (p_group_id, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.add_group_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_member(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  -- owner/admin may remove anyone; a member may remove only themselves
  IF NOT (p_user_id = v_uid OR public.group_is_owned(p_group_id, v_uid) OR public.is_group_admin(p_group_id, v_uid)) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated, service_role;
