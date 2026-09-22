-- ============================================================
-- Migration 105 — N4 Phase B: LLM categorization suggestions
-- ============================================================
-- Stores Gemini-generated organization suggestions for a user's liked
-- (YouTube-imported) videos. Review-gated: rows are created 'pending' by
-- POST /api/categorize and only take effect when the user accepts them
-- (acceptCategorizationAction applies the folder/tag write through the
-- normal RPC path). Nothing is written to folders/tags without review.
--
-- RLS: owner reads own suggestions. No authenticated write policies —
-- all writes go through the service client inside server actions/routes.
-- ============================================================

CREATE TABLE IF NOT EXISTS categorization_suggestions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id),
  node_id               UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  suggested_folder_name TEXT,
  suggested_tag_labels  TEXT[] NOT NULL DEFAULT '{}',
  reason                TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at           TIMESTAMPTZ,
  UNIQUE (node_id)
);

ALTER TABLE categorization_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorization_suggestions_select_own"
  ON categorization_suggestions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
