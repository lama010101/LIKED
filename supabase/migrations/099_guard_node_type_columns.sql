-- ============================================================
-- Migration 099 — IMPL-NODE-TYPE-01: guard node_type columns
-- ============================================================
-- Closes the nodes_update RLS gap flagged in INV-NODE-TYPE-01 §RLS:
-- the policy allows any edge-holder with edit/reshare/admin permission
-- (or the owner) to UPDATE the whole nodes row. With node_type and
-- parent_node_id now columns, that would let non-owners rewrite a
-- card's type or parentage.
--
-- Column-level REVOKE cannot fix this (table-level UPDATE grant
-- dominates per Postgres privilege rules), so this BEFORE UPDATE
-- trigger rejects changes to node_type / parent_node_id for
-- RLS-bound roles.
--
-- Role model (current_user inside the trigger):
--   'service_role'     — app server via service key: allowed
--   'postgres'         — direct psql/migrations AND SECURITY DEFINER
--                        RPCs (owner postgres): set_node_deleted,
--                        update_node_title etc. keep working: allowed
--   'supabase_admin'   — platform admin paths: allowed
--   'authenticated' / 'anon' — RLS-bound PostgREST roles: REJECTED
--
-- The WHEN clause limits firing to updates that actually touch the
-- protected columns, so title edits / deleted_at flips / any other
-- legitimate UPDATE by edge-holders is unaffected.
-- ============================================================

CREATE OR REPLACE FUNCTION public.nodes_guard_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'node_type and parent_node_id are immutable for role %', current_user
      USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.nodes_guard_immutable_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS nodes_immutable_columns_guard ON public.nodes;
CREATE TRIGGER nodes_immutable_columns_guard
  BEFORE UPDATE ON public.nodes
  FOR EACH ROW
  WHEN (
    OLD.node_type IS DISTINCT FROM NEW.node_type
    OR OLD.parent_node_id IS DISTINCT FROM NEW.parent_node_id
  )
  EXECUTE FUNCTION public.nodes_guard_immutable_columns();
