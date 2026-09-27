-- ============================================================
-- Migration 115 — MVP2 P1-02 (Q9, T0-1): folder edges
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Folder visibility = existence of a folder edge, with exactly the same
-- invariants as node edges:
--   • every edge still has a non-null cause_id (unchanged NOT NULL + FK
--     ON DELETE CASCADE)
--   • an edge targets exactly one of node_id / folder_id
--   • no UNIQUE(folder_id, user_id) — multiple causes per (folder, user)
--     are expected, exactly like nodes
-- Folders are NOT modelled as nodes.
--
-- Existing node-edge readers (get_feed and friends) join edges on node_id;
-- folder edges carry node_id NULL and therefore never match a node join.
--
-- Direct table UPDATE policies on nodes/folders are dropped: every write is
-- RPC-only (REPO-15). folders_update in particular granted edit rights via a
-- causes-metadata join (F3), which is superseded by grant-based permissions.
-- ============================================================

ALTER TABLE public.edges ALTER COLUMN node_id DROP NOT NULL;

ALTER TABLE public.edges
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE public.edges
  ADD CONSTRAINT edges_exactly_one_target CHECK (num_nonnulls(node_id, folder_id) = 1);

CREATE INDEX IF NOT EXISTS edges_folder_user_idx ON public.edges (folder_id, user_id) WHERE folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS edges_user_folder_idx ON public.edges (user_id, folder_id) WHERE folder_id IS NOT NULL;

DROP POLICY IF EXISTS folders_update ON public.folders;
DROP POLICY IF EXISTS nodes_update ON public.nodes;
