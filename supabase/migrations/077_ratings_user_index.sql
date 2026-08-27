-- ============================================================
-- P1-11: Add index on ratings.user_id for "ratings by user" queries
-- The existing UNIQUE(node_id, user_id) constraint covers node_id-leading
-- queries, but user_id-leading queries (e.g. "all ratings by this user")
-- require a separate index.
-- ============================================================

CREATE INDEX IF NOT EXISTS ratings_user_id_idx ON ratings(user_id);
