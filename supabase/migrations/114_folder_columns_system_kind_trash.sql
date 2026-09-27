-- ============================================================
-- Migration 114 — MVP2 P1-01: folder description, system folders, trash batches
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- • folders.description — searchable folder description (req 7).
-- • folders.system_kind — stable identity for default folders (F8, Q15).
--   'youtube' / 'web' are protected (not renamable, trashable, movable);
--   'unsorted' is the folder-less fallback and stays user-manageable.
--   One live system folder of each kind per owner.
-- • folders.trash_batch_id / nodes.trash_batch_id — groups the rows a single
--   trash action soft-deleted so restore/permanent-delete act on exactly that
--   set (Q7, Q17). Soft delete never removes causes or edges.
-- ============================================================

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS system_kind TEXT,
  ADD COLUMN IF NOT EXISTS trash_batch_id UUID;

ALTER TABLE public.folders
  ADD CONSTRAINT folders_system_kind_check
  CHECK (system_kind IS NULL OR system_kind IN ('youtube', 'web', 'unsorted'));

ALTER TABLE public.folders
  ADD CONSTRAINT folders_description_len CHECK (description IS NULL OR length(description) <= 2000);

ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS trash_batch_id UUID;

-- Backfill: the live name-identified default folders become system folders.
-- If an owner ever had several live folders of the same default name, only
-- the oldest becomes the system folder (the rest stay ordinary folders).
WITH ranked AS (
  SELECT id,
         CASE name WHEN 'YouTube' THEN 'youtube' WHEN 'Unsorted' THEN 'unsorted' END AS kind,
         row_number() OVER (PARTITION BY owner_id, name ORDER BY created_at, id) AS rn
    FROM public.folders
   WHERE deleted_at IS NULL AND name IN ('YouTube', 'Unsorted') AND parent_folder_id IS NULL
)
UPDATE public.folders f
   SET system_kind = r.kind
  FROM ranked r
 WHERE f.id = r.id AND r.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS folders_owner_system_kind_uniq
  ON public.folders (owner_id, system_kind)
  WHERE system_kind IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS folders_trash_batch_idx ON public.folders (trash_batch_id) WHERE trash_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nodes_trash_batch_idx ON public.nodes (trash_batch_id) WHERE trash_batch_id IS NOT NULL;
