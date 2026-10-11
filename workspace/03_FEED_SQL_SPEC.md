
# LIKED — Feed SQL Specification

**Version:** 2.0 (supersedes 1.0; fixes outer-query scoping, FRIEND context, access checks, NULL sort handling, cursors)

## Document Authority

This document defines:

* exact SQL query structure
* join composition rules
* pagination contracts (per sort)
* deduplication guarantees
* access-check requirements

This is a **NON-NEGOTIABLE implementation contract**.

Any deviation = **data corruption or data leak risk**.

---

# 1. Core Invariants Enforced

* I14 → stable sort (tie-breaker required)
* I16 → no duplicates
* I17 → dedup BEFORE pagination
* I18 → joins must not affect result cardinality
* I19 → exactly one context
* I20 → filters cannot multiply rows

`DISTINCT ON` is a **safety net**, not the mechanism that makes the feed correct. Cardinality safety comes from the unique constraints in §11. Both are mandatory.

---

# 2. MANDATORY QUERY SHAPE (NO EXCEPTIONS)

Fragments marked `[4B+]` or `[6+]` are emitted only once the phase that introduces their tables is complete (see Roadmap). In Phase 4A they are omitted entirely; the shape is otherwise identical.

```sql
SELECT *
FROM (
  SELECT DISTINCT ON (nodes.id)
    nodes.id,
    nodes.owner_id,
    nodes.type,
    nodes.title,
    nodes.url,
    nodes.created_date,

    /* sort keys: ALWAYS non-NULL (see §6) */
    {{SORT_KEY_COLUMN}}          AS sort_key,

    nsc.avg_rating,              -- [4B+]
    nsc.rating_count,            -- [4B+]
    {{SHARED_AT_COLUMN}}         AS shared_at

  FROM nodes

  /* === CONTEXT JOIN (EXACTLY ONE) === */
  {{CONTEXT_JOIN}}

  /* === REQUIRED SAFE JOINS (at most one row per node) === */
  LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = nodes.id   -- [4B+]

  /* === WHERE === */
  WHERE nodes.deleted_at IS NULL
    AND nodes.type IN ('url', 'file', 'media')
    {{CONTEXT_CONDITION}}
    {{FILTER_CONDITIONS}}   -- EXISTS only (§4)
    {{BLOCK_CONDITION}}     -- [6+]

  ORDER BY nodes.id {{DEDUP_TIEBREAK}}
) dedup

WHERE TRUE
  {{CURSOR_CONDITION}}      -- outer query, dedup.* only (§7)

ORDER BY {{OUTER_SORT}}
LIMIT :limit_plus_one
```

Rules:

* The outer query may reference **only** `dedup.*`. Referencing `nodes.`, `nsc.`, `e_ctx.` outside the subquery is a defect.
* `ratings` is NOT joined (personal-rating sorting is forbidden in MVP, PRD decision #28).
* `edges` is NOT joined outside the SHARED / FRIEND contexts. `shared_at` is `NULL::timestamptz` in every other context. This removes the multi-share row multiplication that a generic `LEFT JOIN edges` would cause.
* `nodes.type IN ('url','file','media')` is mandatory: tag, user, folder and group nodes are never feed items.
* `{{DEDUP_TIEBREAK}}` is empty, except in SHARED / FRIEND contexts where it is `, e_ctx.created_at DESC, e_ctx.id DESC` so the kept row (and therefore `shared_at`) is deterministic.
* `LIMIT` is `:limit + 1`. The builder returns the first `:limit` rows and sets `has_more` if the extra row exists. `:limit` is clamped to 1..100.

---

# 3. CONTEXT CONTRACT (EXACTLY ONE)

Multiple contexts = **FORBIDDEN**. Every context contains its own access check; the builder MUST NOT emit a context without it.

### PERSONAL

```sql
-- no join
AND nodes.owner_id = :me
```

---

### FOLDER

```sql
JOIN folder_edges fe ON fe.child_id = nodes.id
                    AND fe.parent_id = :folder_id
-- CONTEXT_CONDITION (access: folder owned by viewer, direct children only)
AND EXISTS (
  SELECT 1 FROM nodes f
  WHERE f.id = :folder_id
    AND f.type = 'folder'
    AND f.owner_id = :me
    AND f.deleted_at IS NULL
)
```

---

### GROUP

```sql
JOIN group_edges ge ON ge.node_id = nodes.id
                   AND ge.group_id = :group_id
-- CONTEXT_CONDITION (access: viewer is a member)
AND EXISTS (
  SELECT 1 FROM group_members gm
  WHERE gm.group_id = :group_id
    AND gm.user_id = :me
)
AND EXISTS (
  SELECT 1 FROM nodes g
  WHERE g.id = :group_id AND g.type = 'group' AND g.deleted_at IS NULL
)
```

---

### SHARED

```sql
JOIN edges e_ctx ON e_ctx.node_id = nodes.id
                AND e_ctx.recipient_id = :me
                AND e_ctx.deleted_at IS NULL
```

`shared_at` = `e_ctx.created_at`.

---

### FRIEND

```sql
JOIN edges e_ctx ON e_ctx.node_id = nodes.id
                AND e_ctx.recipient_id = :me
                AND e_ctx.sender_id = :friend_id
                AND e_ctx.deleted_at IS NULL
-- CONTEXT_CONDITION (access: accepted friendship)
AND EXISTS (
  SELECT 1 FROM friendships fr
  WHERE fr.user_id = :me
    AND fr.friend_id = :friend_id
    AND fr.status = 'accepted'
)
```

`shared_at` = `e_ctx.created_at`.

`edges` columns are `node_id` (the shared card), `sender_id`, `recipient_id` (user-nodes). The v1.0 `from_node` / `to_node` naming made the FRIEND context unsatisfiable and is retired.

---

# 4. FILTER COMPOSITION RULES (CRITICAL)

## RULE: FILTERS MUST NOT MULTIPLY ROWS

Every filter is a single `EXISTS` / `NOT EXISTS`, inside the inner `WHERE`. Every filter that takes ids from the client MUST also prove the viewer may use those ids (access predicate). Id lists are capped at 50 per filter; larger = request rejected.

### 4.1 TAG FILTER (SAFE FORM ONLY)

❌ FORBIDDEN:

```sql
JOIN tag_edges te ON te.node_id = nodes.id
```

✅ REQUIRED (`tag_mode = any`, default):

```sql
AND nodes.owner_id = :me
AND EXISTS (
  SELECT 1
  FROM tag_edges te
  JOIN nodes t ON t.id = te.tag_id
  WHERE te.node_id = nodes.id
    AND te.tag_id = ANY(:tag_ids)
    AND t.type = 'tag'
    AND t.owner_id = :me
    AND t.deleted_at IS NULL
)
```

`tag_mode = all`: the builder emits one such `EXISTS` per tag id (never `GROUP BY ... HAVING`).

Tags are private: a tag id not owned by `:me` simply matches nothing; the builder additionally rejects the request so tag existence cannot be probed.

---

### 4.2 GROUP FILTER

```sql
AND EXISTS (
  SELECT 1
  FROM group_edges ge_filter
  JOIN group_members gm_filter
    ON gm_filter.group_id = ge_filter.group_id
   AND gm_filter.user_id = :me
  WHERE ge_filter.node_id = nodes.id
    AND ge_filter.group_id = ANY(:group_ids)
)
```

---

### 4.3 FOLDER FILTER

```sql
AND EXISTS (
  SELECT 1
  FROM folder_edges fe_filter
  JOIN nodes f_filter
    ON f_filter.id = fe_filter.parent_id
   AND f_filter.type = 'folder'
   AND f_filter.owner_id = :me
   AND f_filter.deleted_at IS NULL
  WHERE fe_filter.child_id = nodes.id
    AND fe_filter.parent_id = ANY(:folder_ids)
)
```

---

### 4.4 FRIEND FILTER

Cards that the listed friends sent to the viewer (never the reverse direction):

```sql
AND EXISTS (
  SELECT 1
  FROM edges ef
  JOIN friendships fr
    ON fr.user_id = :me
   AND fr.friend_id = ef.sender_id
   AND fr.status = 'accepted'
  WHERE ef.node_id = nodes.id
    AND ef.recipient_id = :me
    AND ef.sender_id = ANY(:friend_ids)
    AND ef.deleted_at IS NULL
)
```

---

### 4.5 RATING FILTER  [4B+]

```sql
AND nsc.avg_rating BETWEEN :min AND :max
```

Unrated cards (no `nodes_sort_cache` row, or `rating_count = 0`) are **excluded** by this filter. This is intended and the UI must say so.

---

### 4.6 TYPE / DATE FILTERS (Phase 4A)

```sql
AND nodes.type = ANY(:types)                       -- :types ⊆ ('url','file','media')
AND nodes.created_date >= :date_from
AND nodes.created_date <  :date_to
```

---

# 5. BLOCK FILTER (SCALABLE)  [6+]

One form only (no list-size branching):

```sql
AND NOT EXISTS (
  SELECT 1
  FROM blocks b
  WHERE (b.blocker_id = :me          AND b.blocked_id = nodes.owner_id)
     OR (b.blocker_id = nodes.owner_id AND b.blocked_id = :me)
)
```

Blocking is **bidirectional**. In SHARED / FRIEND contexts the same predicate is additionally applied to `e_ctx.sender_id` (replace `nodes.owner_id`). Required index: `blocks (blocker_id, blocked_id)` and `blocks (blocked_id, blocker_id)`.

`NOT IN (...)` is forbidden (NULL-unsafe).

---

# 6. SORT CONTRACTS (EXPLICIT — NO GENERIC SORT)

`sort_key` is computed in the **inner** query and is **never NULL**, so cursors never compare against NULL. The outer query orders only by `dedup.sort_key` and `dedup.id`.

| Sort | `{{SORT_KEY_COLUMN}}` (inner) | Direction | Allowed contexts |
| ---- | ----------------------------- | --------- | ---------------- |
| `created_date` | `nodes.created_date` | DESC | all |
| `alpha` | `lower(coalesce(nodes.title, '')) COLLATE "C"` | ASC | all |
| `global_rating` [4B+] | `coalesce(nsc.avg_rating, -1)` | DESC | all |
| `rating_count` [4B+] | `coalesce(nsc.rating_count, 0)` | DESC | all |
| `shared_at` | `e_ctx.created_at` | DESC | SHARED, FRIEND only |

```sql
ORDER BY dedup.sort_key DESC, dedup.id ASC     -- DESC sorts
ORDER BY dedup.sort_key ASC,  dedup.id ASC     -- alpha
```

Notes:

* Unrated cards sort last under the rating sorts (`-1` / `0` sentinels).
* `alpha` uses `COLLATE "C"` on a lowercased title so the order is identical on every database and matches the cursor comparison. Cards with no title (pre-enrichment) sort first.
* `shared_at` outside SHARED / FRIEND is rejected by the builder (`400`), because the value would be NULL for every row.
* `personal_rating` is **not** an allowed sort in MVP (PRD decision #28). It must not appear in the builder's sort enum.

---

# 7. PAGINATION CONTRACT (MANDATORY)

Cursor is an opaque, base64-encoded JSON value:

```json
{
  "sort": "created_date",
  "sort_value": "2026-01-01T00:00:00Z",
  "id": "uuid"
}
```

Rules:

* always include `id`
* `sort` is part of the cursor; a cursor presented with a different `sort` is rejected (`400`)
* always match sort direction
* strict inequality on the primary field, `id ASC` as tie-breaker
* the cursor condition is applied in the **outer** query, against `dedup.*`, so it is evaluated after deduplication (I17)
* `sort_value` is the `sort_key` of the last returned row (the `:limit`-th row, not the lookahead row)

Generic form, emitted per sort:

```sql
-- DESC sorts (created_date, global_rating, rating_count, shared_at)
AND (
  dedup.sort_key < :cursor_value
  OR (dedup.sort_key = :cursor_value AND dedup.id > :cursor_id)
)

-- ASC sort (alpha)
AND (
  dedup.sort_key > :cursor_value
  OR (dedup.sort_key = :cursor_value AND dedup.id > :cursor_id)
)
```

---

# 8. HARD FORBIDDEN PATTERNS

❌ GROUP BY in feed queries
❌ DISTINCT outside inner query
❌ JOIN for tag / group / folder / friend filtering
❌ ORDER BY without `id`
❌ OFFSET pagination
❌ application-level deduplication
❌ mixing contexts
❌ outer query referencing inner aliases (`nodes.`, `nsc.`, `e_ctx.`)
❌ `NOT IN` against a subquery or id list
❌ a context or filter id used without its access predicate
❌ sorting on a nullable expression

---

# 9. QUERY BUILDER CONTRACT

You MUST enforce this in code:

```ts
buildFeedQuery({
  context: ONE_ONLY,          // PERSONAL | FOLDER | GROUP | SHARED | FRIEND
  filters: SAFE_EXISTS_ONLY,  // tag | group | folder | friend | rating | type | date
  sort: ENUM_ONLY,            // created_date | alpha | global_rating | rating_count | shared_at
  cursor: STRUCTURED,
  limit: 1..100,
  viewer: :me,                // always taken from the authenticated session, never the request body
})
```

Rules:

* context required; exactly one
* filters injected ONLY as the EXISTS blocks above
* sort mapped to predefined SQL block; sort/context compatibility checked (§6)
* cursor generated and validated per sort (§7)
* every client-supplied id is parameter-bound (never interpolated)
* the phase gate: fragments tagged `[4B+]` / `[6+]` are compiled in only when the corresponding feature flag is on

---

# 10. FAILURE MODES PREVENTED

This spec explicitly eliminates:

* duplicate rows under multi-join
* pagination skipping / looping
* cross-user tag leaks
* cross-user folder / group reads
* join explosion
* inconsistent ordering (including non-deterministic `shared_at`)
* cursor corruption and NULL-comparison paging failures
* tags / user-nodes leaking into the feed

---

# 11. REQUIRED SCHEMA CONSTRAINTS (PRECONDITIONS)

The join-safety guarantees above hold **only if** these exist. Phase 4C validation (see Roadmap) MUST assert them against the live schema.

| Table | Constraint |
| ----- | ---------- |
| `folder_edges` | `UNIQUE (parent_id, child_id)`; index `(child_id)` |
| `group_edges` | `UNIQUE (group_id, node_id)`; index `(node_id)` |
| `group_members` | `UNIQUE (group_id, user_id)` |
| `tag_edges` | `UNIQUE (node_id, tag_id)`; index `(tag_id)` |
| `nodes_sort_cache` | `PRIMARY KEY (node_id)` |
| `edges` | partial `UNIQUE (node_id, sender_id, recipient_id) WHERE deleted_at IS NULL`; index `(recipient_id, created_at DESC)` |
| `friendships` | `UNIQUE (user_id, friend_id)` |
| `blocks` | `UNIQUE (blocker_id, blocked_id)`; index `(blocked_id, blocker_id)` |
| `nodes` | index `(owner_id, created_date DESC, id)` where `deleted_at IS NULL` |

Even with these, `DISTINCT ON (nodes.id)` stays in place (I16). In the SHARED / FRIEND contexts several senders may have shared the same card to the viewer; `DISTINCT ON` plus `{{DEDUP_TIEBREAK}}` then deterministically keeps the most recent share.
