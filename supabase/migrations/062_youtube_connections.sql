-- ============================================================
-- Migration 062 — P-YT-01: YouTube Activity Management
-- ============================================================
--
-- Tracks which users have connected their YouTube account via
-- Supabase Google OAuth provider with YouTube scopes.
--
-- Auth model: Option A — Extend Supabase Google provider.
-- The Google access token (with YouTube scopes) is stored in the
-- Supabase session as provider_token. This table only tracks
-- connection status — no token storage (Supabase handles tokens).
--
-- Ref: docs/Youtube_Activity_Amendment.md §41.5

CREATE TABLE IF NOT EXISTS youtube_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_account_email TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- RLS: users can only see and modify their own connection
ALTER TABLE youtube_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "youtube_connections_select_own"
  ON youtube_connections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "youtube_connections_insert_own"
  ON youtube_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "youtube_connections_update_own"
  ON youtube_connections
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "youtube_connections_delete_own"
  ON youtube_connections
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
