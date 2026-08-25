-- ============================================================
-- Migration 075 — AUDIT-03: Add missing folder indexes
-- ============================================================
--
-- The folders table is frequently queried by owner_id (RLS policies,
-- folder access checks), parent_folder_id (tree traversal), and
-- deleted_at (every folder query filters on this). None of these
-- columns had indexes, causing sequential scans on all folder queries.
--
-- Ref: AUDIT-03-O/P/Q

-- Index for owner-based queries (RLS policy, folder list, folder tree)
CREATE INDEX IF NOT EXISTS folders_owner_idx ON folders(owner_id);

-- Index for parent_folder_id lookups (tree traversal, nested folder display)
CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders(parent_folder_id);

-- Partial index for active (non-deleted) folders — most queries filter on this
CREATE INDEX IF NOT EXISTS folders_deleted_at_idx ON folders(deleted_at) WHERE deleted_at IS NULL;
