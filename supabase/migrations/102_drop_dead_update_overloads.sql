-- ============================================================
-- Migration 102 — EXEC-READY-001 / R10: drop dead update_* overloads
-- ============================================================
-- Two overloads of each profile RPC are live (verified via pg_proc
-- 2026-09-21):
--
--   update_display_name(uuid, text)                    -- atomic, rate-limited
--   update_display_name(uuid, text, text, text)        -- legacy apply-only
--   update_avatar_key(uuid, text)                      -- atomic, rate-limited
--   update_avatar_key(uuid, text, integer, text)       -- legacy apply-only
--
-- The 4-parameter variants originate from 038/043 and were carried forward
-- by 092/094. They take caller-supplied p_normalized/p_old_display_name and
-- p_new_count/p_today, i.e. they perform the UPDATE without the rate-limit
-- and uniqueness checks the 2-parameter atomic versions enforce. Any
-- authenticated caller can invoke them directly via PostgREST and bypass
-- the 24h username / 5-per-day avatar limits.
--
-- Zero callers of the 4-parameter forms exist in app/, lib/, components/,
-- extension/, supabase/functions/, or scripts/ (grep-verified). The app
-- calls only the 2-param atomic forms (lib/db/users.ts).
--
-- Same precedent as migration 095 (SWEEP-01): drop superseded, callable
-- overloads rather than leaving bypass paths live.
-- ============================================================

DROP FUNCTION IF EXISTS public.update_display_name(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.update_avatar_key(uuid, text, integer, text);
