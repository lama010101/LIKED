-- ============================================================
-- Migration 079 — AUDIT-06 P1-6: Drop broken create_node RPC
-- ============================================================
-- The simple create_node(UUID, TEXT, TEXT, TEXT) overload defined in
-- migration 054 inserts cause_type='created' and permission='owner',
-- which violate the CHECK constraints on causes.cause_type
-- (IN ('direct_share','group_share','import')) and edges.permission
-- (IN ('view','comment','contribute','edit','reshare','admin')).
--
-- No application code calls this overload — the app uses
-- create_node_with_metadata (fixed in migration 064 to use 'import').
-- The broken function is deployed and GRANTed to authenticated/service_role,
-- so any PostgREST call would raise a CHECK violation.
--
-- This migration drops the broken overload. create_node_with_metadata
-- remains the canonical node-creation RPC.
-- ============================================================

DROP FUNCTION IF EXISTS create_node(UUID, TEXT, TEXT, TEXT);
