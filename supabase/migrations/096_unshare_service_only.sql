-- ============================================================
-- Migration 096 — unshare: service-only EXECUTE
-- ============================================================
-- lib/db/sharing.ts:unshare() calls this via getSupabaseServiceClient()
-- only. After migration 095 added the role-aware auth gate, the remaining
-- anon/PUBLIC/authenticated EXECUTE grants are unnecessary surface.
-- Revoke them (least privilege); service_role + owner keep EXECUTE.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.unshare(UUID, UUID) FROM PUBLIC, anon, authenticated;
