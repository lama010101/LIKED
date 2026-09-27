-- ============================================================
-- Migration 121 — MVP2 P1-06 fix: organize_items.target_folder_id CASCADE
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- DB-18 (T0-13): permanent delete is cascade-only — every FK referencing
-- nodes/folders must be ON DELETE CASCADE. Migration 119 used SET NULL;
-- recreating as CASCADE so a permanently-deleted proposed target folder
-- drops the proposal row (node is re-proposed on the next organize run).
-- ============================================================
ALTER TABLE public.organize_items
  DROP CONSTRAINT IF EXISTS organize_items_target_folder_id_fkey,
  ADD CONSTRAINT organize_items_target_folder_id_fkey
    FOREIGN KEY (target_folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
