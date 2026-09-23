-- ============================================================
-- Migration 108 — delete_group RPC
-- (COMPLETE-APP-002 / SEL-MENU-001)
-- ============================================================
-- Semantics mirror delete_folder exactly:
--   * soft-delete of the groups row ONLY (deleted_at = now())
--   * causes, edges and group_members are preserved untouched
--   * authz: group owner OR group_admins member (service_role allowed)
-- G-1: caller identity is auth.uid() inside the function — no p_user_id.
-- G-2: SECURITY DEFINER + SET search_path; EXECUTE revoked from
--      PUBLIC/anon, granted to authenticated (service_role via default).
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_group(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.groups
  SET deleted_at = now()
  WHERE id = p_group_id
    AND deleted_at IS NULL
    AND (
      auth.role() = 'service_role'
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.group_admins ga
        WHERE ga.group_id = p_group_id AND ga.user_id = auth.uid()
      )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_group(UUID) TO authenticated;
