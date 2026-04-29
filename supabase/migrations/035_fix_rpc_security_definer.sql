-- Migration 035 — Fix SECURITY INVOKER → SECURITY DEFINER on write RPCs
-- TAD §7 mandates SECURITY DEFINER for all write functions.
-- No logic changes — security mode only.

ALTER FUNCTION create_node(UUID, TEXT, TEXT, TEXT) SECURITY DEFINER;

ALTER FUNCTION create_node_with_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) SECURITY DEFINER;
