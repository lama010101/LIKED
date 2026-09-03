-- ============================================================
-- Migration 080 — AUDIT-06 P1-9: Drop non-deterministic create_folder overload
-- ============================================================
-- Migration 010 defined create_folder(UUID, TEXT, UUID) which uses
-- ORDER BY random() LIMIT 1 for color selection — non-deterministic,
-- violating the LIKED determinism rule.
--
-- Migration 057 defined a newer create_folder(TEXT, UUID) overload with
-- deterministic color via liked_tag_palette, but did NOT drop the old
-- 3-parameter overload. Both remained reachable.
--
-- This migration drops the old non-deterministic overload. The
-- deterministic create_folder(TEXT, UUID) from 057 remains.
-- ============================================================

DROP FUNCTION IF EXISTS create_folder(UUID, TEXT, UUID);
