-- ============================================================
-- Migration 098 — IMPL-NODE-TYPE-01: node_type + parent_node_id
-- ============================================================
-- Adds two columns to public.nodes:
--
--   node_type       TEXT — 'text' | 'link' | 'image' | 'video'.
--                   Caller-supplied going forward (Decision 1); historical
--                   rows get a one-time derivation backfill below.
--                   NOT NULL is enforced via a scoped CHECK: every row must
--                   carry a valid node_type EXCEPT the 68 known junk/test
--                   rows (example.com / test-migration-check.com /
--                   import-test.com), which are excluded from backfill scope
--                   per INV-NODE-TYPE-01 and keep NULL. Written as a CASE
--                   because bare `x IN (...)` returns NULL (not FALSE) when
--                   x is NULL — and CHECK only rejects FALSE — so the naive
--                   AND/OR form silently lets NULL through on real rows.
--                   Future junk-domain inserts could still write NULL, but
--                   all writes go through SECURITY DEFINER RPCs that will
--                   require p_node_type (no INSERT RLS policy exists).
--
--   parent_node_id  UUID NULL REFERENCES nodes(id) — self-referencing FK
--                   for a future comment-node feature. Schema-only in this
--                   migration; no app code reads or writes it yet.
--                   DELETE action left at default RESTRICT: hard-deleting a
--                   node that has children will fail until the comment
--                   feature defines cascade semantics (see INV §5c flag —
--                   hard_delete_node is untouched here).
--
-- Backfill precedence (non-junk rows only):
--   a. url IS NULL AND text_content IS NOT NULL  -> 'text'   (9 rows)
--   b. host in {*.youtube.com, youtube.com, youtu.be} -> 'video' (126 rows)
--   c. any other non-junk url-bearing row         -> 'link'   (39 rows)
-- Junk rows (68) are skipped by every statement and remain NULL.
--
-- No index on node_type: get_feed / get_social_timeline never filter or
-- sort by it — the column is only projected to the client. An index would
-- cost writes with no read benefit.
-- ============================================================

ALTER TABLE public.nodes
  ADD COLUMN node_type TEXT,
  ADD COLUMN parent_node_id UUID REFERENCES public.nodes(id);

-- ── Backfill (precedence a → b → c) ─────────────────────────
UPDATE public.nodes
SET node_type = 'text'
WHERE node_type IS NULL
  AND url IS NULL
  AND text_content IS NOT NULL;

UPDATE public.nodes
SET node_type = 'video'
WHERE node_type IS NULL
  AND url IS NOT NULL
  AND url ~* '^https?://([^/?#]*\.)?(youtube\.com|youtu\.be)([/?#:]|$)'
  AND url !~* '^https?://([^/?#]*\.)?(example\.com|test-migration-check\.com|import-test\.com)([/?#:]|$)';

UPDATE public.nodes
SET node_type = 'link'
WHERE node_type IS NULL
  AND url IS NOT NULL
  AND url !~* '^https?://([^/?#]*\.)?(example\.com|test-migration-check\.com|import-test\.com)([/?#:]|$)';

-- ── Scoped CHECK: valid value required; NULL only on junk domains ──
ALTER TABLE public.nodes
  ADD CONSTRAINT nodes_node_type_check CHECK (
    CASE
      WHEN node_type IS NULL
        THEN COALESCE(url ~* '^https?://([^/?#]*\.)?(example\.com|test-migration-check\.com|import-test\.com)([/?#:]|$)', false)
      ELSE node_type IN ('text', 'link', 'image', 'video')
    END
  );
