-- ============================================================
-- Migration 111 — MVP2 P0-03 (F4): permanent delete is cascade-only
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- hard_delete_node does `DELETE FROM nodes`. Every node created by
-- create_node_with_metadata / import_url owns a nodes_sort_cache row and a
-- folder_edges row, both NO ACTION → the delete raised an FK violation.
-- Tier-0: "Deletion = cascade only" — no app-side multi-table deletes.
-- This migration switches every node- and folder-dependent FK to
-- ON DELETE CASCADE so a single root DELETE removes all dependents.
-- Soft delete (deleted_at) is unaffected: no rows are removed by it.
-- ============================================================

-- ── node dependents ─────────────────────────────────────────
ALTER TABLE public.nodes_sort_cache DROP CONSTRAINT nodes_sort_cache_node_id_fkey,
  ADD CONSTRAINT nodes_sort_cache_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.folder_edges DROP CONSTRAINT folder_edges_node_id_fkey,
  ADD CONSTRAINT folder_edges_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.tag_edges DROP CONSTRAINT tag_edges_node_id_fkey,
  ADD CONSTRAINT tag_edges_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.ratings DROP CONSTRAINT ratings_node_id_fkey,
  ADD CONSTRAINT ratings_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.translations DROP CONSTRAINT translations_node_id_fkey,
  ADD CONSTRAINT translations_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.group_nodes DROP CONSTRAINT group_nodes_node_id_fkey,
  ADD CONSTRAINT group_nodes_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.external_items_map DROP CONSTRAINT external_items_map_node_id_fkey,
  ADD CONSTRAINT external_items_map_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.node_messages DROP CONSTRAINT node_messages_node_id_fkey,
  ADD CONSTRAINT node_messages_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

ALTER TABLE public.nodes DROP CONSTRAINT nodes_parent_node_id_fkey,
  ADD CONSTRAINT nodes_parent_node_id_fkey FOREIGN KEY (parent_node_id) REFERENCES public.nodes(id) ON DELETE CASCADE;

-- ── folder dependents ───────────────────────────────────────
ALTER TABLE public.folder_edges DROP CONSTRAINT folder_edges_folder_id_fkey,
  ADD CONSTRAINT folder_edges_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE public.folder_tree DROP CONSTRAINT folder_tree_folder_id_fkey,
  ADD CONSTRAINT folder_tree_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE public.folder_tree DROP CONSTRAINT folder_tree_ancestor_id_fkey,
  ADD CONSTRAINT folder_tree_ancestor_id_fkey FOREIGN KEY (ancestor_id) REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE public.tag_edges DROP CONSTRAINT tag_edges_folder_id_fkey,
  ADD CONSTRAINT tag_edges_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE public.folder_admins DROP CONSTRAINT folder_admins_folder_id_fkey,
  ADD CONSTRAINT folder_admins_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;

ALTER TABLE public.folders DROP CONSTRAINT folders_parent_folder_id_fkey,
  ADD CONSTRAINT folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
