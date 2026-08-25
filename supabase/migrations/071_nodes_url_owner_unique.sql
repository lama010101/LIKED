-- Migration 071 — Add unique partial index on nodes(url, owner_id)
-- AUDIT-02 §4-A #3 / §8 #4: createNode race condition.
--
-- lib/db/nodes.ts:97-114 performs a SELECT-then-INSERT outside a single
-- transaction. Concurrent calls with the same (url, owner_id) can both
-- pass the check and insert duplicates.
--
-- This index enforces uniqueness at the DB level — the race window is
-- closed because Postgres will reject the second INSERT with a unique
-- constraint violation. The application-level check in createNode
-- remains for better UX (throws DuplicateNodeError before hitting the
-- DB in the non-race case).
--
-- Partial index: only applies to non-deleted nodes (deleted_at IS NULL)
-- and rows with a non-null URL (text-only cards have url = NULL and
-- are excluded — duplicates are valid for text-only cards).
--
-- This is a pure constraint addition. No write logic, no RPC changes,
-- no feed involvement.

CREATE UNIQUE INDEX IF NOT EXISTS nodes_url_owner_active_uniq
  ON nodes (url, owner_id)
  WHERE deleted_at IS NULL AND url IS NOT NULL;
