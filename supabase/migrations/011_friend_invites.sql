-- ============================================================
-- Migration 011: friend_invites table + get_friend_bar function
-- PRD §9.1–9.3: WhatsApp-style invite model (no reciprocal acceptance)
-- ============================================================

-- ============================================================
-- 1. FRIEND_INVITES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS friend_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = pending (invitee not yet signed up)
  to_email      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_user_id, to_email)  -- one active invite per (sender, email)
);

CREATE INDEX IF NOT EXISTS friend_invites_from_idx ON friend_invites(from_user_id);
CREATE INDEX IF NOT EXISTS friend_invites_to_user_idx ON friend_invites(to_user_id) WHERE to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS friend_invites_to_email_idx ON friend_invites(to_email);

-- ============================================================
-- 2. RLS POLICIES
-- ============================================================
ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friend_invites_select" ON friend_invites
FOR SELECT USING (
  from_user_id = auth.uid() OR to_user_id = auth.uid()
);

CREATE POLICY "friend_invites_insert" ON friend_invites
FOR INSERT WITH CHECK (
  from_user_id = auth.uid()
);

CREATE POLICY "friend_invites_delete" ON friend_invites
FOR DELETE USING (
  from_user_id = auth.uid() OR to_user_id = auth.uid()
);

-- ============================================================
-- 3. GET_FRIEND_BAR FUNCTION
-- Replaces get_friends (bidirectional edge model — removed per PRD §9.1-9.3)
-- Returns all Friends Strip entries for p_user_id.
-- ============================================================
CREATE OR REPLACE FUNCTION get_friend_bar(p_user_id UUID)
RETURNS TABLE (
  user_id       UUID,
  display_name  TEXT,
  avatar_key    TEXT,
  to_email      TEXT,
  is_pending    BOOLEAN,
  last_activity TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    u.id                                              AS user_id,
    u.display_name,
    u.avatar_key,
    fi.to_email,
    (fi.to_user_id IS NULL)                          AS is_pending,
    MAX(e.created_at)                                AS last_activity
  FROM friend_invites fi

  LEFT JOIN users u ON u.id = CASE
    WHEN fi.from_user_id = p_user_id THEN fi.to_user_id
    ELSE fi.from_user_id
  END

  LEFT JOIN edges e ON (
    (e.sender_id = p_user_id AND e.user_id = u.id)
    OR
    (e.sender_id = u.id AND e.user_id = p_user_id)
  )

  WHERE
    (fi.from_user_id = p_user_id OR fi.to_user_id = p_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE u.id IS NOT NULL
        AND ((b.blocker_id = p_user_id AND b.blocked_id = u.id)
          OR (b.blocker_id = u.id     AND b.blocked_id = p_user_id))
    )

  GROUP BY u.id, u.display_name, u.avatar_key, fi.to_email, fi.to_user_id
  ORDER BY last_activity DESC NULLS LAST;
$$;

-- ============================================================
-- 4. DROP OLD get_friends FUNCTION (superseded)
-- ============================================================
DROP FUNCTION IF EXISTS get_friends(UUID);
