# NEEDS-SPEC N8 — Reference-table RLS scope (8 tables on `USING (true)`)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Whether to keep, split, or lock down the permissive `USING (true)` SELECT
policies verified live on 8 reference tables (AUDIT-06 P2-7).

## Exactly what is exposed, and to whom (verified)

Live policies (`supabase/migrations/003_rls_policies.sql`, confirmed live by
the 2026-09-21 probe): every one of these is

```sql
FOR SELECT TO authenticated USING (true)
```

- **Who:** **any authenticated user** — i.e., any logged-in account can read
  **every row** in all 8 tables.
- **Who NOT:** **anonymous/public callers have no policy** (and EXECUTE
  grants were tightened in migrations 094/095 era) — exposure is
  authenticated-only, not internet-public.

### Per-table content exposed to all authenticated users

| Table | Content | Real sensitivity |
|---|---|---|
| `tags` | All users' tag labels/colors | **User-generated** — reveals every user's personal taxonomy |
| `tag_translations` | Tag label translations | Shared-vocab-ish, but rows are user-derived |
| `tag_edges` | node↔tag links for **all** users | **High** — reveals how *other* users categorize their nodes; reconstructs private org structure |
| `translations` | Node translation rows | User-derived content |
| `ratings` | All ratings rows | **User-generated** — exposes every user's rating of every node (a cross-user activity signal) |
| `nodes_sort_cache` | Sort positions per node/folder | Metadata leak — reveals node existence & ordering for nodes a user can't otherwise see |
| `external_sources` | External provider defs (e.g. YouTube) | Genuinely shared reference — low sensitivity |
| `external_items_map` | External ID ↔ node map | **User-derived** — reveals which external items (e.g. YouTube video IDs) other users imported |

So: 3–4 tables are arguably-intentional shared vocabulary; `tag_edges`,
`ratings`, `external_items_map`, `nodes_sort_cache` leak **other users'
personal data** to any logged-in user. That is what changes the urgency —
this is a cross-user data-exposure, authenticated-only but real.

## Options

### A — Leave + document as intentional
**Effort: S.** Tradeoff: defensible only for `external_sources`/translation
vocab; leaves per-user data (`ratings`, `tag_edges`, `external_items_map`)
world-readable to every account.

### B — Split: keep shared vocab open, scope user-derived tables
Open: `external_sources`, `tag_translations`, `translations` (+ maybe `tags`
if tags are meant global). Scoped to owner/edge-visibility: `ratings`,
`tag_edges`, `external_items_map`, `nodes_sort_cache`. **Effort: M** —
policy migration mirroring the edges-visibility rule; must first find all
current readers (client/service/RPC) since scoping breaks any direct cross-
user reads that features silently depend on.

### C — Lock all 8 to service-role + RPC-only reads
**Effort: M–L.** Tradeoff: strictest conformance to "visibility = edges
only"; but every legit read path must be an RPC first — highest breakage
risk, biggest audit surface.

## Recommendation

**Option B.** The exposure is real but moderate (authenticated-only), the
data genuinely splits into shared-vocab vs user-derived, and B lands the
security win without forcing an RPC-buildout first. Before any policy change,
grep for live readers of each table — scoping a table an active feature reads
directly is a silent-breakage risk.

*This is a recommendation, not a decision.*

---

## Triage (PHASE3-PURGE-MERGE-SPECTRIAGE-001)

**Tier 1 — proposed default: Option B (split scoping).** AUDIT-06 already
established the fix direction as a P1 finding ("scope the `USING (true)`
policies on active tables" — P1-7 for users/folder_edges/folder_tree/group
tables; P2-7 for these 8 reference tables). That's the Tier-1 convention:
permissive authenticated-wide reads on user-derived rows are a named defect
class, not a design choice. Proposed scope split — keep open:
`external_sources`, `translations`, `tag_translations`, `tags` (shared
vocabulary); scope to owner/edge-visible: `ratings`, `tag_edges`,
`external_items_map`, `nodes_sort_cache` (user-derived cross-user leaks).
**Mandatory precondition:** audit every live reader of each table before the
policy migration — scoping a table an active feature reads directly is a
silent-breakage vector. Proposed default; will proceed unless told
otherwise.
