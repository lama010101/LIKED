-- ============================================================
-- Migration 104 — N8: scope USING(true) SELECT policies on 4
-- user-derived reference tables (AUDIT-06 P2-7 / PHASE4 N8)
-- ============================================================
-- Replaces the "any authenticated user reads everything" policies with
-- the canonical node-visibility predicate from get_feed stage 1+2
-- (051_restore_get_feed.sql): node owner OR an edges row for the caller,
-- minus symmetric blocks. Owner-edge invariant (DB-1) means edge
-- existence covers ownership.
--
-- Live-reader audit (2026-09-22, PHASE4): ZERO user-context readers of
-- these tables — all app reads go through the service client or
-- SECURITY DEFINER RPCs, which bypass RLS. Scoping is zero-breakage;
-- it closes the ad-hoc-PostgREST cross-user read hole only.
--
-- Left open per ruling: external_sources, translations,
-- tag_translations, tags (shared vocabulary — intentionally public).
-- ============================================================

-- ---------- ratings: own rows + rows on nodes the caller can see ----------
DROP POLICY IF EXISTS "ratings_select_authenticated" ON ratings;
CREATE POLICY "ratings_select_visible"
  ON ratings FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM nodes n
      WHERE n.id = ratings.node_id
        AND n.deleted_at IS NULL
        AND (
          n.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM edges e
                     WHERE e.node_id = n.id AND e.user_id = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = n.owner_id)
             OR (b.blocker_id = n.owner_id AND b.blocked_id = auth.uid())
        )
    )
  );

-- ---------- tag_edges: only on caller-visible nodes ----------
DROP POLICY IF EXISTS "tag_edges_select_authenticated" ON tag_edges;
CREATE POLICY "tag_edges_select_visible"
  ON tag_edges FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nodes n
      WHERE n.id = tag_edges.node_id
        AND n.deleted_at IS NULL
        AND (
          n.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM edges e
                     WHERE e.node_id = n.id AND e.user_id = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = n.owner_id)
             OR (b.blocker_id = n.owner_id AND b.blocked_id = auth.uid())
        )
    )
  );

-- ---------- external_items_map: only on caller-visible nodes ----------
DROP POLICY IF EXISTS "external_items_map_select_authenticated" ON external_items_map;
CREATE POLICY "external_items_map_select_visible"
  ON external_items_map FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nodes n
      WHERE n.id = external_items_map.node_id
        AND n.deleted_at IS NULL
        AND (
          n.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM edges e
                     WHERE e.node_id = n.id AND e.user_id = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = n.owner_id)
             OR (b.blocker_id = n.owner_id AND b.blocked_id = auth.uid())
        )
    )
  );

-- ---------- nodes_sort_cache: only on caller-visible nodes ----------
DROP POLICY IF EXISTS "nodes_sort_cache_select_authenticated" ON nodes_sort_cache;
CREATE POLICY "nodes_sort_cache_select_visible"
  ON nodes_sort_cache FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nodes n
      WHERE n.id = nodes_sort_cache.node_id
        AND n.deleted_at IS NULL
        AND (
          n.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM edges e
                     WHERE e.node_id = n.id AND e.user_id = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = n.owner_id)
             OR (b.blocker_id = n.owner_id AND b.blocked_id = auth.uid())
        )
    )
  );
