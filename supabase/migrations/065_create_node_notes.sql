-- ============================================================
-- Migration 065 — Create node_notes table (PRD §8, P0 feature)
-- ============================================================
-- Personal notes let users annotate saved items with context
-- ("Why did I save this?"). PRD §8 lists this as P0.
--
-- Model: one note per (node_id, user_id). The popup has a single
-- textarea, so one note per node per user is the MVP contract.
-- PRD §24 Open Question 6 asks about multiple notes; deferred to P2.
--
-- Notes must be searchable (PRD §8). A trigram index on content
-- enables ILIKE search via get_feed's search stage or future
-- search_nodes enhancement.
-- ============================================================

CREATE TABLE IF NOT EXISTS node_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One note per (node, user) — MVP contract.
CREATE UNIQUE INDEX IF NOT EXISTS node_notes_node_user_key
  ON node_notes (node_id, user_id);

-- Index for lookup by user (e.g. "show all my notes").
CREATE INDEX IF NOT EXISTS node_notes_user_idx
  ON node_notes (user_id);

-- Trigram index for ILIKE search on content.
CREATE INDEX IF NOT EXISTS node_notes_content_trgm_idx
  ON node_notes USING gin (content gin_trgm_ops);

-- RLS: users can only see/edit their own notes.
ALTER TABLE node_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY node_notes_select_own ON node_notes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY node_notes_insert_own ON node_notes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY node_notes_update_own ON node_notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY node_notes_delete_own ON node_notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Grant access.
GRANT SELECT, INSERT, UPDATE, DELETE ON node_notes TO authenticated;
GRANT ALL ON node_notes TO service_role;
