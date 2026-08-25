-- Migration 069: Add missing write RLS policies on causes and edges
-- Causes: INSERT restricted to creator, DELETE restricted to creator
-- Edges: INSERT restricted to sender, DELETE restricted to sender or recipient
-- No UPDATE policies added (causes and edges are immutable; mutations go through RPCs)

CREATE POLICY causes_insert_policy ON public.causes
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY causes_delete_policy ON public.causes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY edges_insert_policy ON public.edges
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY edges_delete_policy ON public.edges
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR user_id = auth.uid());
