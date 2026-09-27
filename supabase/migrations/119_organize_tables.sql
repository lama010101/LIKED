-- ============================================================
-- Migration 119 — MVP2 P1-06 (Q2, Q16, F12): auto-organize batches
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Replaces categorization_suggestions (UNIQUE(node_id) made a node
-- un-proposable forever after one review). A batch is created for a source
-- folder (the YouTube or Web system folder); each item carries the LLM
-- proposal. Items the provider could not process in a run stay 'pending'
-- and are picked up by the next run (Q2). Acceptance is applied atomically
-- by apply_organization_batch (P2-08) and MOVES items (Q16).
--
-- categorization_suggestions is backed up here and dropped by P2-08 once
-- its writers are removed.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categorization_suggestions_backup_20260927 AS
  SELECT * FROM public.categorization_suggestions;

CREATE TABLE IF NOT EXISTS public.organize_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'discarded')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.organize_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          UUID NOT NULL REFERENCES public.organize_batches(id) ON DELETE CASCADE,
  node_id           UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'proposed', 'failed', 'applied', 'skipped')),
  target_folder_id  UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  new_folder_name   TEXT CHECK (new_folder_name IS NULL OR length(new_folder_name) BETWEEN 1 AND 120),
  tag_labels        TEXT[] NOT NULL DEFAULT '{}',
  reason            TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organize_items_batch_node_uniq UNIQUE (batch_id, node_id)
);

CREATE INDEX IF NOT EXISTS organize_batches_user_idx ON public.organize_batches (user_id, source_folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organize_items_batch_status_idx ON public.organize_items (batch_id, status);

ALTER TABLE public.organize_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organize_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY organize_batches_select_own ON public.organize_batches
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY organize_items_select_own ON public.organize_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organize_batches b WHERE b.id = batch_id AND b.user_id = auth.uid()));
