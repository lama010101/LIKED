-- ============================================================
-- Migration 116 — MVP2 P1-03 (Q3, Q10, T0-2): folder grants
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- folder_grants is the write-time expansion instruction for live folder
-- sharing (the same role group_nodes plays for group shares). It is NOT a
-- visibility source: visibility is still edge existence only. A grant on
-- folder F covers F's full subtree (Q10).
--
-- Every cause created by expanding a grant carries causes.folder_grant_id.
-- Revoking a grant = deleting its row → causes cascade → edges cascade.
-- Deletion stays cascade-only.
--
-- One grant per (folder, grantee): re-sharing to the same grantee updates
-- the role instead of adding a parallel grant, so access lists and role
-- edits are unambiguous. This uniqueness is on the instruction table, not
-- on edges (edges keep no UNIQUE(target, user)).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.folder_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id   UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  grantee_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL CHECK (permission IN ('view','comment','contribute','edit','reshare','admin')),
  granted_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT folder_grants_folder_grantee_uniq UNIQUE (folder_id, grantee_id)
);

CREATE INDEX IF NOT EXISTS folder_grants_grantee_idx ON public.folder_grants (grantee_id);

ALTER TABLE public.folder_grants ENABLE ROW LEVEL SECURITY;

-- Grantees see their own grants; the owner of the granted folder sees all of
-- them. No write policies: writes go through SECURITY DEFINER RPCs only.
CREATE POLICY folder_grants_select_scoped ON public.folder_grants
  FOR SELECT TO authenticated
  USING (grantee_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_id AND f.owner_id = auth.uid()));

ALTER TABLE public.causes
  ADD COLUMN IF NOT EXISTS folder_grant_id UUID REFERENCES public.folder_grants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS causes_folder_grant_idx ON public.causes (folder_grant_id) WHERE folder_grant_id IS NOT NULL;
