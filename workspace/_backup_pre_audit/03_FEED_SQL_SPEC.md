
# LIKED — Feed SQL Specification

## Document Authority

This document defines:

* exact SQL query structure
* join composition rules
* pagination contracts (per sort)
* deduplication guarantees

This is a **NON-NEGOTIABLE implementation contract**.

Any deviation = **data corruption risk**.

---

# 1. Core Invariants Enforced

* I14 → stable sort (tie-breaker required)
* I16 → no duplicates
* I17 → dedup BEFORE pagination
* I18 → joins must not affect result cardinality

---

# 2. MANDATORY QUERY SHAPE (NO EXCEPTIONS)

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

    nsc.avg_rating,
    nsc.rating_count,

    r.value AS personal_rating,
    e.created_at AS shared_at

  FROM nodes

  /* === CONTEXT JOIN (EXACTLY ONE) === */
  {{CONTEXT_JOIN}}

  /* === OPTIONAL FILTER JOINS (ISOLATED) === */
  {{FILTER_JOINS}}

  /* === REQUIRED SAFE JOINS === */
  LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = nodes.id

  LEFT JOIN ratings r
    ON r.node_id = nodes.id
   AND r.user_node = :me

  LEFT JOIN edges e
    ON e.from_node = nodes.id
   AND e.to_node = :me
   AND e.deleted_at IS NULL

  /* === WHERE === */
  WHERE nodes.deleted_at IS NULL
    {{CONTEXT_CONDITION}}
    {{FILTER_CONDITIONS}}
    {{BLOCK_CONDITION}}

  ORDER BY nodes.id
) dedup

ORDER BY {{OUTER_SORT}}
LIMIT :limit
```

---

# 3. CONTEXT CONTRACT (EXACTLY ONE)

Multiple contexts = **FORBIDDEN**

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
```

---

### GROUP

```sql
JOIN group_edges ge ON ge.node_id = nodes.id
AND ge.group_id = :group_id
```

---

### SHARED

```sql
JOIN edges e_ctx ON e_ctx.from_node = nodes.id
AND e_ctx.to_node = :me
AND e_ctx.deleted_at IS NULL
```

---

### FRIEND

```sql
JOIN edges e_ctx ON e_ctx.from_node = nodes.id
AND e_ctx.to_node = :me
AND e_ctx.from_node = :friend_id
AND e_ctx.deleted_at IS NULL
```

---

# 4. FILTER COMPOSITION RULES (CRITICAL)

## RULE: FILTERS MUST NOT MULTIPLY ROWS

### 4.1 TAG FILTER (SAFE FORM ONLY)

❌ FORBIDDEN:

```sql
JOIN tag_edges te ON te.node_id = nodes.id
```

✅ REQUIRED:

```sql
WHERE EXISTS (
  SELECT 1
  FROM tag_edges te
  WHERE te.node_id = nodes.id
    AND te.tag_id = ANY(:tag_ids)
    AND nodes.owner_id = :me
)
```

---

### 4.2 GROUP FILTER

```sql
WHERE EXISTS (
  SELECT 1
  FROM group_edges ge_filter
  WHERE ge_filter.node_id = nodes.id
    AND ge_filter.group_id = ANY(:group_ids)
)
```

---

### 4.3 FOLDER FILTER

```sql
WHERE EXISTS (
  SELECT 1
  FROM folder_edges fe_filter
  WHERE fe_filter.child_id = nodes.id
    AND fe_filter.parent_id = ANY(:folder_ids)
)
```

---

### 4.4 FRIEND FILTER

```sql
WHERE EXISTS (
  SELECT 1
  FROM edges ef
  WHERE ef.from_node = nodes.id
    AND ef.to_node = ANY(:friend_ids)
    AND ef.deleted_at IS NULL
)
```

---

### 4.5 RATING FILTER

```sql
AND nsc.avg_rating BETWEEN :min AND :max
```

---

# 5. BLOCK FILTER (SCALABLE)

### ≤100

```sql
AND nodes.owner_id NOT IN (:blocked_ids)
```

### >100

```sql
AND NOT EXISTS (
  SELECT 1
  FROM blocks b
  WHERE b.blocker_id = :me
    AND b.blocked_id = nodes.owner_id
)
```

---

# 6. SORT CONTRACTS (EXPLICIT — NO GENERIC SORT)

## created_date

```sql
ORDER BY nodes.created_date DESC, dedup.id ASC
```

Cursor:

```sql
AND (
  nodes.created_date < :cursor_date
  OR (
    nodes.created_date = :cursor_date
    AND nodes.id > :cursor_id
  )
)
```

---

## alpha

```sql
ORDER BY nodes.title ASC, dedup.id ASC
```

---

## global_rating

```sql
ORDER BY nsc.avg_rating DESC, dedup.id ASC
```

---

## rating_count

```sql
ORDER BY nsc.rating_count DESC, dedup.id ASC
```

---

## personal_rating

```sql
ORDER BY r.value DESC NULLS LAST, dedup.id ASC
```

---

## shared_at

```sql
ORDER BY e.created_at DESC, dedup.id ASC
```

---

# 7. PAGINATION CONTRACT (MANDATORY)

Cursor MUST encode:

```json
{
  "sort_value": "...",
  "id": "uuid"
}
```

Rules:

* always include `id`
* always match sort direction
* always use strict inequality for primary field
* always use `id` as tie-breaker

---

# 8. HARD FORBIDDEN PATTERNS

❌ GROUP BY in feed queries
❌ DISTINCT outside inner query
❌ JOIN for tag filtering
❌ ORDER BY without `id`
❌ OFFSET pagination
❌ application-level deduplication
❌ mixing contexts

---

# 9. QUERY BUILDER CONTRACT (THIS WAS MISSING)

You MUST enforce this in code:

```ts
buildFeedQuery({
  context: ONE_ONLY,
  filters: SAFE_EXISTS_ONLY,
  sort: ENUM_ONLY,
  cursor: STRUCTURED,
})
```

Rules:

* context required
* filters injected ONLY as EXISTS
* sort mapped to predefined SQL block
* cursor generated per sort

---

# 10. FAILURE MODES PREVENTED

This spec explicitly eliminates:

* duplicate rows under multi-join
* pagination skipping / looping
* cross-user tag leaks
* join explosion
* inconsistent ordering
* cursor corruption

