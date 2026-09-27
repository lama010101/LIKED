-- ============================================================
-- Migration 120 — MVP2 P1-07 (Q13): explicit YouTube import consent
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- YouTube import runs only after the user explicitly opts in from inside the
-- app and confirms the consent modal. The timestamp of that confirmation is
-- the single source of truth for "may import"; no import happens at sign-in.
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS youtube_import_consent_at TIMESTAMPTZ;
