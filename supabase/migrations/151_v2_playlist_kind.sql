-- ============================================================
-- Migration 151 — v2 YouTube playlist items (PLAN-V2-002 §6.2,
-- decision D32 approved by Lolo; DRAFT for
-- V2-W9-PLAYLIST-1128-001, not pre-authorized)
-- ============================================================
-- Additive constraint widening on public.items:
--   * kind CHECK gains 'playlist'
--   * items_identity_format gains the youtube/playlist pattern
--     '^(PL|OL|UU|FL)[A-Za-z0-9_-]{11,62}$'
-- Mixes (RD…), Liked (LL…) and Watch Later (WL…) lists are NOT
-- representable: the prefix allowlist excludes them, and the
-- resolver rejects them before any insert.
--
-- No SQL function is recreated here: every function that touches
-- items.kind either passes it through unchanged (upsert_item —
-- the table CHECK is the validator) or branches on items.source
-- (get_inbox type derivation, enrichment enqueue staleness,
-- items_purge_unreferenced, housekeeping_purge), never on a
-- kind allowlist — verified against migrations 142–149 and the
-- live pg_constraint/pg_proc catalogues, so zero CREATE OR
-- REPLACE statements are needed and no later change is reverted.
-- The 30-day YouTube display-field rule keys off source='youtube',
-- which covers kind='playlist' automatically.
-- ============================================================

ALTER TABLE public.items DROP CONSTRAINT items_kind_check;
ALTER TABLE public.items ADD CONSTRAINT items_kind_check
  CHECK (kind IN ('movie','series','video','channel','playlist'));

ALTER TABLE public.items DROP CONSTRAINT items_identity_format;
ALTER TABLE public.items ADD CONSTRAINT items_identity_format CHECK (
     (source = 'tmdb'    AND kind IN ('movie','series') AND external_id ~ '^[0-9]{1,10}$')
  OR (source = 'youtube' AND kind = 'video'             AND external_id ~ '^[A-Za-z0-9_-]{11}$')
  OR (source = 'youtube' AND kind = 'channel'           AND external_id ~ '^UC[A-Za-z0-9_-]{22}$')
  OR (source = 'youtube' AND kind = 'playlist'          AND external_id ~ '^(PL|OL|UU|FL)[A-Za-z0-9_-]{11,62}$'));
