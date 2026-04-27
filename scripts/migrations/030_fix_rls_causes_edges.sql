-- Migration 030: Tighten RLS policies on causes and edges tables
-- Drops wide-open write policies that allowed authenticated users to write directly
-- Service role bypasses RLS entirely, so no replacement policies are needed

-- Drop wide-open INSERT/UPDATE/DELETE policies on causes table
DROP POLICY IF EXISTS causes_insert_policy ON causes;
DROP POLICY IF EXISTS causes_update_policy ON causes;
DROP POLICY IF EXISTS causes_delete_policy ON causes;

-- Drop wide-open INSERT/UPDATE/DELETE policies on edges table
DROP POLICY IF EXISTS edges_insert_policy ON edges;
DROP POLICY IF EXISTS edges_update_policy ON edges;
DROP POLICY IF EXISTS edges_delete_policy ON edges;
