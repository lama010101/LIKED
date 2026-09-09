-- Migration 097 — add OAuth token storage columns to youtube_connections
ALTER TABLE youtube_connections
  ADD COLUMN access_token text,
  ADD COLUMN refresh_token text,
  ADD COLUMN token_expires_at timestamptz,
  ADD COLUMN scopes text[],
  ADD COLUMN channel_id text,
  ADD COLUMN channel_title text,
  ADD COLUMN last_synced_at timestamptz,
  ADD COLUMN last_sync_error text;
