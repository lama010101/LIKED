-- Migration 072 — Drop legacy 3-param overloads of direct_share and group_share
-- AUDIT-02 §2-B / §8 #17: direct_share and group_share each have TWO overloads
-- in the live DB because migration 010 added p_permission with a different
-- signature (CREATE OR REPLACE with a new param creates a NEW function, it
-- does NOT replace the old one). The legacy 3-param versions from migrations
-- 006/008 were never dropped.
--
-- Risk: when a caller passes 3 positional args, Postgres cannot resolve which
-- overload to call and fails with "could not choose the best candidate
-- function". The TS callers in lib/db/sharing.ts always pass p_permission
-- explicitly (4 named args) so they resolve to the 4-param version, but the
-- latent ambiguity is a runtime landmine.
--
-- Fix: DROP the legacy 3-param overloads. The 4-param versions (latest in
-- migration 058) remain as the sole direct_share / group_share functions.
--
-- Same pattern as migration 063 (which dropped the legacy 14-param get_feed
-- after migration 049 added p_exclude_foldered).

DROP FUNCTION IF EXISTS direct_share(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS group_share(UUID, UUID, UUID);
