# SPEC V14 — Multi-dimensional ratings

**Status:** spec proposal — no implementation. (§41.6 deferral.)

## Current state evidence

- `ratings` = single numeric 0–10 per (rater, node); read paths surface
  `avg_rating` via `nodes_sort_cache.avg_rating` and the `highest_rated`
  sort option in `get_feed`.
- `get_node_friend_ratings` exposes per-friend scores for card detail.

## The decision

What a multi-dimensional rating model is and how it interacts with the
existing single-score `ratings`/`nodes_sort_cache` pipeline.

## Dimension-model options

### A — Fixed dimensions (recommended for v1)

- Small fixed set (e.g. `quality`, `fun`, `useful`) as columns on a new
  `rating_dimensions` table — `(node_id, rater_id, dimension, value)`
  or a jsonb column on `ratings`.
- Pros: deterministic aggregation, cheap indexes, explainable UI
  (3 mini-bars on card detail). Cons: schema-bound to the chosen dims.

### B — Free axes

- Users define dimensions per folder/group. Pros: flexible. Cons: no
  cross-user aggregation possible, heavy UX — v2+ at best.

## Schema + pipeline impact

- `nodes_sort_cache.avg_rating` semantics must be pinned: overall mean
  across dims, or the primary dim only? (Recommend: primary `quality`
  dim feeds `avg_rating` so `highest_rated` sort stays meaningful and
  unchanged.)
- `get_node_friend_ratings` gains a dimension field — additive return
  column; existing callers unaffected.
- Rating write path (`upsert_rating`) becomes multi-row or takes a
  dims jsonb — a cause/edge-adjacent write: keep single-transaction
  semantics; no new visibility path (ratings are not edges).

## Recommendation

Option A with 3 fixed dims; `quality` (or mean) continues to populate
`avg_rating` so sort behavior is unchanged. Ship behind card-detail UI
only — no feed surface changes.

## Open questions for owner

- Dimension names/labels (product call — recommendation is neutral:
  Quality / Fun / Useful).
- Whether anonymous aggregate (friend avg per dim) is shown to the
  recipient or only to the rater.
