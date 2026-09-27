-- ============================================================
-- Migration 112 — MVP2 P0-04 (F7): replace direct table writes with RPCs
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Every write below previously happened as a direct supabase-js table write
-- (tag_edges, folders.color_hex, blocks, friend_invites, users.language_code,
-- notifications.read) — several of them check-then-insert, several of them
-- duplicating an existing RPC. Each becomes exactly one SECURITY DEFINER RPC
-- with auth.uid() inside; the TypeScript call sites switch in the same change
-- so the old path becomes unreachable.
--
-- Also: friend-invite backfill moves into the ensure_user_profile trigger
-- (single owner of new-user bootstrap), removing the auth-callback path.
-- ============================================================

-- ── organisational uniqueness for tag_edges (not visibility edges) ──
CREATE UNIQUE INDEX IF NOT EXISTS tag_edges_tag_node_uniq
  ON public.tag_edges (tag_id, node_id) WHERE node_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tag_edges_tag_folder_uniq
  ON public.tag_edges (tag_id, folder_id) WHERE folder_id IS NOT NULL;

-- ── internal visibility helper (node): owner OR edge, not blocked ──
CREATE OR REPLACE FUNCTION public._node_visible(p_node_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nodes n
    WHERE n.id = p_node_id
      AND n.deleted_at IS NULL
      AND (n.owner_id = p_user_id
           OR EXISTS (SELECT 1 FROM edges e WHERE e.node_id = n.id AND e.user_id = p_user_id))
      AND NOT EXISTS (SELECT 1 FROM blocks b
                      WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
                         OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id))
  );
$$;
REVOKE ALL ON FUNCTION public._node_visible(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── tags ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_tag_to_node(p_tag_id UUID, p_node_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT _node_visible(p_node_id, auth.uid()) THEN
    RAISE EXCEPTION 'node not accessible' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tag_edges (tag_id, node_id, folder_id)
  VALUES (p_tag_id, p_node_id, NULL)
  ON CONFLICT (tag_id, node_id) WHERE node_id IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_tag_from_node(p_tag_id UUID, p_node_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT _node_visible(p_node_id, auth.uid()) THEN
    RAISE EXCEPTION 'node not accessible' USING ERRCODE = '42501';
  END IF;
  DELETE FROM tag_edges WHERE tag_id = p_tag_id AND node_id = p_node_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_tag_to_folder(p_tag_id UUID, p_folder_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM folders f WHERE f.id = p_folder_id AND f.deleted_at IS NULL
                   AND (f.owner_id = auth.uid()
                        OR EXISTS (SELECT 1 FROM folder_admins fa WHERE fa.folder_id = f.id AND fa.user_id = auth.uid()))) THEN
    RAISE EXCEPTION 'folder not writable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO tag_edges (tag_id, node_id, folder_id)
  VALUES (p_tag_id, NULL, p_folder_id)
  ON CONFLICT (tag_id, folder_id) WHERE folder_id IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_tag_from_folder(p_tag_id UUID, p_folder_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM folders f WHERE f.id = p_folder_id AND f.deleted_at IS NULL
                   AND (f.owner_id = auth.uid()
                        OR EXISTS (SELECT 1 FROM folder_admins fa WHERE fa.folder_id = f.id AND fa.user_id = auth.uid()))) THEN
    RAISE EXCEPTION 'folder not writable' USING ERRCODE = '42501';
  END IF;
  DELETE FROM tag_edges WHERE tag_id = p_tag_id AND folder_id = p_folder_id;
END;
$$;

-- ── folder colour (replaces PATCH /api/folders/[id] direct update) ──
CREATE OR REPLACE FUNCTION public.set_folder_color(p_folder_id UUID, p_color TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_color IS NULL OR p_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'invalid color' USING ERRCODE = '22023';
  END IF;
  UPDATE folders SET color_hex = lower(p_color)
   WHERE id = p_folder_id AND deleted_at IS NULL
     AND (owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM folder_admins fa WHERE fa.folder_id = p_folder_id AND fa.user_id = auth.uid()));
  IF NOT FOUND THEN RAISE EXCEPTION 'folder not writable' USING ERRCODE = '42501'; END IF;
END;
$$;

-- ── friends / blocks ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_friend(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := lower(btrim(p_email));
  v_target UUID;
  v_rows INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  SELECT au.id INTO v_target FROM auth.users au WHERE lower(au.email) = v_email LIMIT 1;
  IF v_target = v_uid THEN RETURN 'self'; END IF;
  INSERT INTO public.friend_invites (from_user_id, to_email, to_user_id)
  VALUES (v_uid, v_email, v_target)
  ON CONFLICT (from_user_id, to_email) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN CASE WHEN v_rows = 0 THEN 'already' ELSE 'invited' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM friend_invites
   WHERE (from_user_id = auth.uid() AND to_user_id = p_target_user_id)
      OR (from_user_id = p_target_user_id AND to_user_id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.block_user(p_blocked_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_blocked_id = auth.uid() THEN RAISE EXCEPTION 'cannot block self' USING ERRCODE = '22023'; END IF;
  INSERT INTO blocks (blocker_id, blocked_id) VALUES (auth.uid(), p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  DELETE FROM friend_invites
   WHERE (from_user_id = auth.uid() AND to_user_id = p_blocked_id)
      OR (from_user_id = p_blocked_id AND to_user_id = auth.uid());
END;
$$;

-- ── language + notifications ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_language(p_language_code TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_language_code NOT IN ('en', 'fr', 'th') THEN
    RAISE EXCEPTION 'unsupported language' USING ERRCODE = '22023';
  END IF;
  UPDATE users SET language_code = p_language_code WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE notifications SET read = true
   WHERE user_id = auth.uid() AND read = false
     AND (p_ids IS NULL OR id = ANY(p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── new-user bootstrap: profile + friend-invite backfill (single owner) ──
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_base_name TEXT;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'user'
  );
  v_base_name := lower(trim(v_display_name));

  BEGIN
    INSERT INTO public.users (id, display_name, normalized_display_name, language_code,
                              avatar_key, avatar_change_count_today, created_at)
    VALUES (NEW.id, v_display_name, v_base_name, 'en', NULL, 0, NOW())
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.users (id, display_name, normalized_display_name, language_code,
                              avatar_key, avatar_change_count_today, created_at)
    VALUES (NEW.id, v_display_name, v_base_name || '_' || left(NEW.id::text, 4), 'en', NULL, 0, NOW())
    ON CONFLICT (id) DO NOTHING;
  END;

  IF NEW.email IS NOT NULL THEN
    UPDATE public.friend_invites
       SET to_user_id = NEW.id
     WHERE lower(to_email) = lower(NEW.email)
       AND to_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ── grants: authenticated only; PUBLIC/anon revoked ─────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'add_tag_to_node(uuid,uuid)', 'remove_tag_from_node(uuid,uuid)',
    'add_tag_to_folder(uuid,uuid)', 'remove_tag_from_folder(uuid,uuid)',
    'set_folder_color(uuid,text)', 'invite_friend(text)', 'remove_friend(uuid)',
    'block_user(uuid)', 'set_language(text)', 'mark_notifications_read(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
