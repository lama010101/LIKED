-- ============================================================
-- Migration 106 — Drop dead read RPCs (COMPLETE-APP-002 / HYGIENE-001)
-- ============================================================
-- G9 follow-up (pre-drop proof run against live DB at execution):
--   (a) pg_proc:  no other function's prosrc references either name
--   (b) pg_policies: no qual/with_check references
--   (c) pg_views: no definition references
--   (d) pg_depend/pg_rewrite/triggers: no dependents
--   (e) repo grep (app/, lib/, components/, e2e/, extension/, scripts/,
--       supabase/): zero live callers — only comments, docs, generated
--       type defs, and read-only audit scripts
--
-- Dropped:
--   get_visible_nodes(UUID, BOOLEAN)            — legacy pre-020 overload
--   get_visible_nodes(UUID, TEXT, TEXT, TEXT)   — legacy feed path; feed is
--                                                 get_feed only (REPO-8)
--   get_nodes_in_folder(UUID, UUID, TEXT)       — zero callers
-- ============================================================

DROP FUNCTION IF EXISTS public.get_visible_nodes(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_visible_nodes(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_nodes_in_folder(UUID, UUID, TEXT);
