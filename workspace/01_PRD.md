
# LIKED — Product Requirements Document

**Version:** 7.1 (Hardened; schema, enforcement and lifecycle made explicit)
**Status:** Ready for Phase 1

---

# Document Authority

This document defines:

* system behavior
* data model
* invariants (I1–I21)
* lifecycle rules
* feed correctness model

This is the **single source of truth for system behavior and intent**.

If any document conflicts:
→ **This document prevails**

However:

* SQL Spec defines **how rules are enforced**
* Roadmap defines **when systems are built**
* If implementation requires behavior not defined here:
  → it MUST be added here first

---

# Enforcement Scope

The following MUST comply:

* All SQL queries → SQL Spec
* All implementation phases → Roadmap
* All APIs and services

---

# 1. Overview

LIKED is a personal content-saving and organization app.

Users:

* save URLs, files, media as cards
* organize via folders
* collaborate via groups
* distribute via shares
* rate and filter content

---

# 2. Foundational Architecture Decisions

Locked. No deviation.

| #  | Decision             | Choice                              |
| -- | -------------------- | ----------------------------------- |
| 1  | Identity             | users + user-node                   |
| 2  | owner_id             | immutable creator                   |
| 3  | Display name         | users = source of truth             |
| 4  | Containment          | folders / groups / shares separated |
| 5  | Group content        | only via `group_edges`              |
| 6  | Card identity        | global object                       |
| 7  | Lifecycle            | `deleted_at` only                   |
| 8  | Storage              | columns + JSONB                     |
| 9  | content_sources      | strict validation                   |
| 10 | Feed                 | only list endpoint                  |
| 11 | Deduplication        | `DISTINCT ON (nodes.id)`            |
| 12 | Query pattern        | two-layer mandatory                 |
| 13 | Stable sort          | id tie-breaker                      |
| 14 | Sort cache           | `nodes_sort_cache`                  |
| 15 | Idempotency          | scoped                              |
| 16 | Enrichment           | async                               |
| 17 | AI ordering          | enforced                            |
| 18 | Copy semantics       | deterministic                       |
| 19 | Tag scope            | private                             |
| 20 | Tag normalization    | single entry                        |
| 21 | Duplicate URL        | soft                                |
| 22 | Filtering boundary   | constrained                         |
| 23 | Empty state          | explicit UX                         |
| 24 | Ratings              | on-write aggregation                |
| 25 | Block filter         | scalable                            |
| 26 | Folder depth         | max 5                               |
| 27 | Pagination           | eventual consistency                |
| 28 | Personal rating sort | forbidden (MVP)                     |
| 29 | Query builder        | mandatory                           |
| 30 | Filter isolation     | EXISTS only                         |
| 31 | Context exclusivity  | exactly one                         |

---

# 2B. Deterministic Query Model (CRITICAL)

Feed queries MUST:

* be built via a single query builder
* enforce exactly one context
* use EXISTS for filters
* prevent row multiplication

Forbidden:

* direct SQL in services
* JOIN-based filters
* multi-context queries

---

# 3. Database Invariants

| ID  | Rule                              |
| --- | --------------------------------- |
| I1  | owner_id immutable                |
| I2  | user-node mapping 1:1             |
| I3  | display sync                      |
| I4  | verified contact                  |
| I5  | no circular folders               |
| I6  | depth ≤ 5                         |
| I7  | tag_source immutable              |
| I8  | content_sources strict            |
| I9  | no cascade delete                 |
| I10 | AI tagging gated                  |
| I11 | tag uniqueness                    |
| I12 | rating atomic                     |
| I13 | owner must be user-node           |
| I14 | stable sort                       |
| I15 | group via edges only              |
| I16 | no duplicates                     |
| I17 | dedup before pagination           |
| I18 | joins must not change cardinality |
| I19 | exactly one context               |
| I20 | filters cannot multiply rows      |
| I21 | no direct SQL outside builder     |

## 3.1 Invariant Enforcement (where each rule lives)

| ID  | Precise rule | Enforced by |
| --- | ------------ | ----------- |
| I1  | `nodes.owner_id` never changes after insert | DB trigger rejecting UPDATE of `owner_id` |
| I2  | each `users` row has exactly one `nodes` row with `type='user'` and `id = users.node_id` | `UNIQUE (node_id)` + FK; created in one transaction |
| I3  | `users.display_name` is source of truth; `nodes.title` of the user-node mirrors it | write path updates both in one transaction |
| I4  | a user must have ≥1 verified contact (email or phone) before any card write | service check + `users.verified_at IS NOT NULL` |
| I5  | folder graph is acyclic | trigger on `folder_edges` (ancestor walk) |
| I6  | folder depth ≤ 5 | same trigger |
| I7  | `tag_edges.tag_source` (`user`/`domain`/`ai`) never changes | DB trigger |
| I8  | `content_sources` entries match the allowed schema | JSON-schema validation in service + CHECK on shape |
| I9  | no `ON DELETE CASCADE` anywhere | schema lint in CI |
| I10 | AI tags are written only when `enrichment_status = 'done'` | service check |
| I11 | a user has at most one tag per normalized name | `UNIQUE (owner_id, normalized_title) WHERE type='tag'` |
| I12 | a rating write and its `nodes_sort_cache` update commit together | single transaction |
| I13 | `nodes.owner_id` references a node with `type='user'` | FK to `users.node_id` |
| I14 | every feed ORDER BY ends with `id` | query builder + Phase 4B tests |
| I15 | group content exists only as `group_edges` rows | no other table may reference a group |
| I16 | feed rows are unique by `nodes.id` | `DISTINCT ON` + SQL Spec §11 constraints |
| I17 | dedup happens before LIMIT / cursor | query shape |
| I18 | joins never change cardinality | SQL Spec §11 constraints + tests |
| I19 | exactly one context per feed query | builder type |
| I20 | filters are `EXISTS` only | builder + forbidden-pattern tests |
| I21 | no feed SQL outside the builder | lint rule on SQL strings, DB role that only the builder module uses for feed reads, property-based tests in Phase 4B |

---

# 4. Data Model

## nodes

Core fields:

* id
* owner_id
* type
* title
* url
* created_date
* enrichment_status
* deleted_at

JSONB:

* description
* image
* file_url
* geo

---

## Relationships

## Schema (authoritative column list)

Node types: `user`, `tag`, `folder`, `group`, and card types `url`, `file`, `media`. Only card types appear in the feed.

| Table | Columns | Constraints |
| ----- | ------- | ----------- |
| `users` | `id uuid PK`, `node_id uuid UNIQUE FK nodes`, `display_name text`, `email text`, `phone text`, `verified_at timestamptz` | email/phone unique when not null |
| `nodes` | `id uuid PK`, `owner_id uuid FK users.node_id`, `type text`, `title text`, `normalized_title text`, `url text`, `created_date timestamptz`, `enrichment_status text`, `deleted_at timestamptz`, `description/image/file_url/geo jsonb`, `content_sources jsonb` | see I1, I11, I13 |
| `folder_edges` | `parent_id`, `child_id`, `created_at` | `UNIQUE (parent_id, child_id)` |
| `group_edges` | `group_id`, `node_id`, `added_by`, `created_at` | `UNIQUE (group_id, node_id)` |
| `group_members` | `group_id`, `user_id`, `role`, `created_at` | `UNIQUE (group_id, user_id)` |
| `tag_edges` | `node_id`, `tag_id`, `tag_source`, `created_at` | `UNIQUE (node_id, tag_id)` |
| `edges` (shares) | `id`, `node_id`, `sender_id`, `recipient_id`, `created_at`, `deleted_at` | partial unique on active rows (SQL Spec §11) |
| `friendships` | `user_id`, `friend_id`, `status`, `created_at` | `UNIQUE (user_id, friend_id)`; stored in both directions when accepted |
| `blocks` | `blocker_id`, `blocked_id`, `created_at` | `UNIQUE (blocker_id, blocked_id)` |
| `ratings` | `node_id`, `user_node`, `value smallint CHECK 0..10`, `updated_at` | `UNIQUE (node_id, user_node)` |
| `nodes_sort_cache` | `node_id PK`, `avg_rating numeric(4,2)`, `rating_count int` | no per-user data |

Indexes required for the feed are listed in SQL Spec §11.

## Relationships

### folder_edges

Personal organization. A card may be in many folders; a folder shows its **direct** children only (subfolders are navigation, not feed items).

### group_edges

Group content (explicit only)

### group_members

Access control

### tag_edges

Tag assignment

### edges

Sharing

---

# 5. Containment Systems

| System  | Meaning       |
| ------- | ------------- |
| Folders | personal      |
| Groups  | collaborative |
| Shares  | distribution  |

Rules:

* no overlap
* no inference
* projections only

## 5.1 Lifecycle Rules

* **Card delete:** sets `nodes.deleted_at`. No edge rows are touched (I9, no cascade). Restore clears it and every folder / group / tag / share projection reappears automatically.
* **Remove from folder / group / tag:** hard-deletes only that edge row. The card is untouched. Removing is not deleting.
* **Revoke a share:** sets `edges.deleted_at`. Re-sharing inserts a new active row.
* **Leave / removed from group:** deletes the `group_members` row; `group_edges` rows stay (the group still owns the projection).
* **Account deletion:** one explicit transaction sets `deleted_at` on the user-node and on every card the user owns. Shares and group projections are left untouched and become invisible because their cards are deleted.
* **Access checks:** every context and every client-supplied filter id must be authorized per SQL Spec §3–§4 (folder owned by viewer, group membership, tag owned by viewer, accepted friendship).

---

# 6. Feed — Canonical Read Model

## Core Rule

Feed is a **SET**.

Never a list.
Never duplicates.

---

## Mandatory Query Model

* DISTINCT ON required
* dedup BEFORE pagination
* stable ORDER BY required
* one context only
* filters via EXISTS only

---

## Query Structure (abstract)

```
INNER:
  DISTINCT ON nodes.id

OUTER:
  ORDER BY sort, id
```

---

## Pagination

Cursor:

```
{ sort_value, id }
```

* eventual consistency
* deterministic ordering

---

## Sort Rules

Allowed sorts:

* created_date
* alpha
* global_rating
* rating_count
* shared_at

Constraints:

* must include id tie-breaker
* must map to SQL spec

---

## nodes_sort_cache

Stores:

* avg_rating
* rating_count

Constraints:

* O(1) update
* no per-user data

---

# 7. Filter Model

Filters MUST:

* use EXISTS
* not affect row count
* be composable

Forbidden:

* JOIN filtering
* GROUP BY filtering

---

# 8. Tag System

* private namespace
* unique per user

Group limitation:

* filters apply only to viewer-owned cards

UI must communicate this.

---

# 9. Metadata Enrichment

Flow:

1. save card
2. async enrichment
3. domain tag
4. AI tagging

Constraints:

* user data never overwritten
* AI depends on enrichment

---

# 10. Copy Semantics

Copy:

* content
* user tags
* domain tags
* content_sources

Do NOT copy:

* AI tags
* ratings

Reset:

* enrichment_status

---

# 11. Rating System

* scale: integers 0–10 inclusive; 0 is a real rating
* unrated = no `ratings` row (never treated as 0)
* stored per user
* aggregated on write
* unrated cards sort last and are excluded by rating-range filters

---

# 12. UI Rules

Must reflect system truth:

* "Remove from group" ≠ "Delete"
* projections clearly shown
* filters always visible
* empty states explicit

---

# 13. Query Safety Rules

Forbidden:

* GROUP BY
* OFFSET pagination
* JOIN filters
* multiple contexts
* missing tie-breaker

---

# 14. Performance Model

Tradeoffs:

| Choice            | Reason      |
| ----------------- | ----------- |
| double sort       | correctness |
| no snapshot       | simplicity  |
| no per-user cache | scalability |

---

# 15. System Guarantees

* deterministic
* duplicate-free
* pagination-safe
* join-safe
* scalable

---

# 16. Failure Prevention Model

Prevents:

* duplicate feed items
* pagination drift
* join explosion
* tag leakage
* context mixing

---

# 17. Build Constraints

Feed must be validated BEFORE:

* ranking
* groups
* sharing

Failure blocks progress.

Phase 4B (Feed Validation Gate) MUST pass before any work begins on Phase 4C (Ranking) or Phase 5 (Groups). Phase 4D (Ranking Validation Gate) MUST pass before Phase 5.

---

# Final Statement

This system is:

* deterministic
* enforceable
* resistant to developer error
* safe under scale

Any deviation from this document:
→ introduces undefined behavior
