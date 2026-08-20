-- ============================================================
-- Migration 060 — P11-T01: Card positions for infinite canvas
-- ============================================================
--
-- Stores per-user, per-context card positions for the infinite canvas view.
-- Context is either root (folder_id = NULL) or a specific folder.
--
-- Ref: PRD §11.2 E — free card positioning, persist to DB

CREATE TABLE IF NOT EXISTS card_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  pos_x INTEGER NOT NULL DEFAULT 0,
  pos_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 1,
  height INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, node_id, folder_id)
);

-- Index for fast lookups
CREATE INDEX idx_card_positions_user_folder ON card_positions(user_id, folder_id);
CREATE INDEX idx_card_positions_user_node ON card_positions(user_id, node_id);

-- RLS: users can only see and modify their own card positions
ALTER TABLE card_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_positions_select_own"
  ON card_positions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "card_positions_insert_own"
  ON card_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "card_positions_update_own"
  ON card_positions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "card_positions_delete_own"
  ON card_positions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Enable Realtime for live position sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_positions;

-- ============================================================
-- RPC: upsert_card_position — atomic position save
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_card_position(
  p_node_id UUID,
  p_folder_id UUID DEFAULT NULL,
  p_pos_x INTEGER DEFAULT 0,
  p_pos_y INTEGER DEFAULT 0,
  p_width INTEGER DEFAULT 1,
  p_height INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO card_positions (user_id, node_id, folder_id, pos_x, pos_y, width, height, updated_at)
  VALUES (auth.uid(), p_node_id, p_folder_id, p_pos_x, p_pos_y, p_width, p_height, now())
  ON CONFLICT (user_id, node_id, folder_id)
  DO UPDATE SET
    pos_x = EXCLUDED.pos_x,
    pos_y = EXCLUDED.pos_y,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_card_position(UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
