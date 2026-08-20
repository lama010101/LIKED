-- ============================================================
-- Migration 063 — Drop old 14-param get_feed overload (FEED FIX)
-- ============================================================
-- Root cause: migration 049 added p_exclude_foldered to get_feed,
-- creating a 15-param function. CREATE OR REPLACE with a different
-- signature creates a NEW function — it does NOT replace the old one.
-- The old 14-param get_feed (from migration 022/023/024) was never
-- dropped, leaving two overloads. Postgres cannot resolve which to
-- call when the TypeScript caller passes 14 params.
--
-- Error: "Could not choose the best candidate function between:
--   get_feed(...14 params...), get_feed(...15 params...)"
--
-- Fix: DROP the old 14-param function. The 15-param function
-- (migration 049/051, with p_exclude_foldered DEFAULT FALSE)
-- remains as the sole get_feed. The TypeScript caller in
-- lib/db/feed.ts passes 14 params; Postgres will resolve to the
-- 15-param function with p_exclude_foldered = FALSE (default).
--
-- This does NOT modify feed SQL logic. The 15-param function body
-- is untouched. Per Rule 11 (MIGRATION SAFETY): old logic removed.
-- ============================================================

DROP FUNCTION IF EXISTS get_feed(
  UUID,
  TEXT,
  TEXT,
  UUID,
  UUID,
  UUID,
  UUID[],
  UUID[],
  UUID[],
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  UUID,
  INTEGER
);
