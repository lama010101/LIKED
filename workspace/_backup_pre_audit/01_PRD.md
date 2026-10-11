
# LIKED — Product Requirements Document

**Version:** 7.0 (Final, Hardened)
**Status:** Production-Ready

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

### folder_edges

Personal organization

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

* scale: 0–10
* stored per user
* aggregated on write

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

Phase 4C (Feed Validation Gate) MUST pass before any work begins on Phase 5 (Groups).

---

# Final Statement

This system is:

* deterministic
* enforceable
* resistant to developer error
* safe under scale

Any deviation from this document:
→ introduces undefined behavior
