-- ============================================================
-- Migration 117 — MVP2 P1-04 (Q3, T0-5): folder membership attribution
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Contributors may delete only their own items in a shared folder. The
-- membership row records who put the item there. Organizational only (N9
-- exemption: no cause). Backfill: every existing membership was created by
-- the node's owner (no cross-user contribution path enforced permissions
-- before MVP2), so added_by = nodes.owner_id.
-- ============================================================

ALTER TABLE public.folder_edges
  ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.folder_edges fe
   SET added_by = n.owner_id
  FROM public.nodes n
 WHERE n.id = fe.node_id AND fe.added_by IS NULL;
