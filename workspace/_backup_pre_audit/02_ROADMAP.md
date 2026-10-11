# LIKED — Build Roadmap

## Document Authority

This document defines:
- build phases
- execution order
- validation gates

It does NOT define system behavior.

### Relationships

- System rules → see `01_PRD.md`
- Feed implementation → see `03_FEED_SQL_SPEC.md`

### Precedence Rule

If this document conflicts with PRD:
→ PRD is correct

If implementation conflicts with SQL Spec:
→ SQL Spec is correct

---

## Enforcement Scope

This document controls:
- when features are implemented
- when validation must occur

It must NOT redefine:
- invariants
- schema rules
- query logic

---

# Principles (Non-Negotiable)

- Each phase has a single source of truth
- No phase introduces more than one new system dependency
- Feed correctness is validated before ranking, groups, or sharing
- No feature is layered on top of an unvalidated read model

---

# Phase 1 — Identity & Idempotency

### Scope
- OTP authentication (email + phone)
- `users` table
- user-node creation (`type = user`)
- display name sync (`users.display_name` ↔ `nodes.title`)
- Idempotency middleware

### Guarantees
- I1–I4 enforced
- Retry-safe writes
- Deterministic identity model

---

# Phase 2 — Core Nodes & Enrichment

### Scope
- `nodes` table (cards)
- Card creation API
- `content_sources` validation
- Async enrichment pipeline
- Domain tagging

### Guarantees
- Immediate persistence
- Deterministic enrichment
- No UI coupling

---

# Phase 3 — Organization Layer (Folders + Tags + Copy)

### Scope
- `folder_edges`
- Tag system (`nodes.type = tag`)
- `tag_edges`
- `findOrCreateTag`
- Copy semantics (FULL implementation)

### Guarantees
- I5–I7, I11 enforced
- Deterministic tagging
- Copy behavior stable

---

# Phase 4A — Feed Core (Correctness Only)

### Scope
- `GET /feed` (all contexts structurally supported)
- DISTINCT ON (nodes.id)
- stable sorting
- minimal filters (type, date)

### Constraints
- No ratings
- No sort cache
- No social filters

### Guarantees
- I14–I18 enforced
- deterministic feed output
- stable pagination

### Reference
Implementation must strictly follow:
→ `03_FEED_SQL_SPEC.md`

Validation must enforce invariants:
→ I14–I18 from `01_PRD.md`

---

# Phase 4B — Ranking Layer

### Scope
- `ratings` table
- rating API
- `nodes_sort_cache`
- aggregation on write
- sort integration

### Constraints
- `personal_rating` not allowed as primary sort

### Guarantees
- ranking without breaking feed correctness
- O(1) cache invalidation

---

# Phase 4C — Feed Validation Gate (MANDATORY)

### Scope
- test suite only

### Must validate
- no duplicates under any filters
- pagination stability
- join safety
- cursor correctness

### Reference
Validation derived from:
→ `01_PRD.md`
→ `03_FEED_SQL_SPEC.md`

Failure blocks progression.

---

# Phase 5 — Groups (Data Model Only)

### Scope
- `group_edges`
- `group_members`
- roles
- membership rules

### Guarantees
- group model independent
- no feed coupling

---

# Phase 6 — Social Layer

### Scope
- friendships
- sharing (`edges`)
- blocking

### Guarantees
- social graph complete
- sharing independent
- block filtering correct

---

# Phase 7 — Full Feed Integration

### Scope
- enable all contexts
- enable all filters
- integrate groups + sharing
- apply block filtering

### Guarantees
- multi-context intersection works
- no duplication regression

### Reference
All joins and filters must comply with:
→ `03_FEED_SQL_SPEC.md`

Tag behavior must comply with:
→ Section 10 in `01_PRD.md`

---

# Phase 8 — UX & Notifications

### Scope
- notification system
- UI rules enforcement
- projection awareness
- tag filter warnings
- empty state logic

### Guarantees
- UI reflects system truth
- no misleading actions

---

# Phase 9+ — Advanced Systems

### Scope
- materialized feed
- shared tags
- AI grouping
- advanced views
- async rating aggregation
- retention policies

---

# Execution Graph

Auth → Nodes → Tags/Folders → Feed Core → Ranking → Validation
      → Groups → Social → Full Feed → UI → Advanced

---

# Final Rule

If something is unclear:
→ stop and resolve in PRD

Do not guess implementation.
