# LIKED — Documentation Index

## Purpose

This folder defines the **complete system contract** for LIKED.

It is split into three layers:

1. **PRD (What the system must do)**
2. **Roadmap (When and how it is built)**
3. **SQL Spec (How correctness is enforced)**

All three are required. None is optional.

---

## Document Order (MANDATORY)

Read in this exact order:

### 1. PRD — Source of Truth
**File:** `01_PRD.md`

Defines:
- data model
- invariants (I1–I21)
- lifecycle behavior
- system rules

This is the **single source of truth**.

If any document conflicts with PRD:
→ **PRD is correct**

---

### 2. Roadmap — Execution Contract
**File:** `02_ROADMAP.md`

Defines:
- build phases
- strict execution order
- validation gates

Rules:
- phases MUST be followed in order
- no skipping ahead
- each phase must pass validation before moving forward

---

### 3. SQL Spec — Enforcement Layer
**File:** `03_FEED_SQL_SPEC.md`

Defines:
- exact feed query structure
- pagination logic
- deduplication rules
- join safety constraints

This document makes the PRD **enforceable**.

If implementation deviates from SQL Spec:
→ feed correctness is no longer guaranteed

---

## Core System Rules

These apply across ALL documents:

### 1. Feed is a SET
- no duplicates
- deduplicated before pagination
- stable ordering required

---

### 2. Card Identity
- cards are global objects
- folders / groups / shares are projections
- removing from context ≠ deleting

---

### 3. Lifecycle
- `deleted_at` is the ONLY visibility mechanism
- no cascades
- restore restores ALL contexts automatically

---

### 4. Query Safety
- exactly ONE context per feed query
- filters use EXISTS only
- JOIN-based filtering is forbidden
- DISTINCT ON required

---

### 5. Determinism
- all behavior must be deterministic
- no heuristic or implicit logic allowed

---

## Source of Truth Hierarchy

| Layer | Responsibility |
|------|----------------|
| PRD | defines behavior |
| SQL Spec | enforces behavior |
| Roadmap | enforces execution |

---

## Absolute Rules

- No engineer writes raw feed SQL
- All feed queries go through query builder
- No feature bypasses invariants
- No undocumented behavior is allowed

---

## Failure Policy

If any part of the system violates:

- invariants
- SQL spec
- lifecycle rules

→ The implementation is INVALID and must be fixed before release

---

## Final Note

This system is designed to be:

- deterministic
- scalable
- resistant to developer error

If something feels “easy to shortcut”:
→ it is almost certainly wrong

---

End of README
