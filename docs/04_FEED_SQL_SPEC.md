# LIKED — Feed SQL Specification

**Version: 1.0**  
**Status: AUTHORITATIVE**  
**Companion to: 01_PRD.md v26.0 · 02_BUILD_PLAN.md v1.0 · 03_TECHNICAL_ARCHITECTURE.md v1.0**  
**Explicitly deferred in PRD §0.1 — this document fulfills that deferral.**

---

## PURPOSE

This document defines every SQL query that powers the feed. It is the single source of truth for what the feed returns, in what order, with what data attached, under every combination of filters.

Cascade must use these exact queries. Do not improvise feed queries. If a scenario is not covered here, raise it — do not invent a query.

---

## 1. FEED PIPELINE (CANONICAL)

The PRD defines the pipeline as:

```
nodes → visibility → context → block filter → cursor → ordering → dedup → limit
```

Each stage is a filter or transform applied in strict order. No stage can be skipped. No stage can create visibility.

| Stage | What it does | Can create visibility? |
|---|---|---|
| nodes | Base table scan | — |
| visibility | Owner OR edge exists | No |
| context | Narrow by friend/folder/group/personal | No |
| block filter | Remove blocked users' nodes | No |
| view filter | All / Mine / Received | No |
| tag filter | AND-intersect by tag_id(s) | No |
| search | Text match on title/tags | No |
| cursor | Pagination window | No |
| ordering | Sort direction | No |
| dedup | Collapse duplicate node_ids | No |
| limit | Page size cap | No |

---

## 2. MASTER FEED QUERY

This is the single parameterized query that powers all feed states. All parameters are optional except `p_user_id`. Every other combination is achieved by setting parameters.

```sql
-- supabase/migrations/005_feed_function.sql
-- Master feed function — all feed states

CREATE OR REPLACE FUNCTION get_feed(
  p_user_id          UUID,
  p_language_code    TEXT    DEFAULT 'en',

  -- View toggle (PRD §11.2a)
  p_view             TEXT    DEFAULT 'all',       -- 'all' | 'mine' | 'received'

  -- Context filters (PRD §8) — mutually exclusive
  p_friend_id        UUID    DEFAULT NULL,         -- friend context
  p_folder_id        UUID    DEFAULT NULL,         -- folder context
  p_group_id         UUID    DEFAULT NULL,         -- group context

  -- Multi-filters (PRD §16.2) — AND logic, stackable
  p_filter_tag_ids   UUID[]  DEFAULT NULL,         -- filter by these tag_ids (AND)
  p_filter_friend_ids UUID[] DEFAULT NULL,         -- filter by these friend_ids (AND)
  p_filter_folder_ids UUID[] DEFAULT NULL,         -- filter by these folder_ids (AND)

  -- Search (PRD §9 / §33.5)
  p_search_query     TEXT    DEFAULT NULL,

  -- Sorting (PRD §7.2)
  p_sort             TEXT    DEFAULT 'newest',     -- 'newest'|'oldest'|'most_shared'|'highest_rated'|'custom'

  -- Cursor pagination (PRD §7, TAD §16.1)
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,    -- last seen created_at
  p_cursor_node_id    UUID        DEFAULT NULL,    -- tiebreaker
  p_limit             INTEGER     DEFAULT 20

) RETURNS TABLE (
  -- Node fields
  node_id           UUID,
  url               TEXT,
  text_content      TEXT,
  title             TEXT,          -- resolved via language fallback chain
  thumbnail_key     TEXT,
  owner_id          UUID,
  language_code     TEXT,
  origin_user_id    UUID,
  origin_created_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ,

  -- Sort cache fields
  avg_rating        NUMERIC,
  view_count        INTEGER,
  share_count       INTEGER,

  -- Direction (for card badge)
  direction         TEXT,          -- 'sent' | 'received' | 'own'

  -- Sender info (null if own or no sender)
  sender_id         UUID,
  sender_name       TEXT,
  sender_avatar_key TEXT,

  -- Tags (aggregated as JSON array)
  tags              JSONB,         -- [{tag_id, color_hex, label}]

  -- Pagination support
  total_count       BIGINT         -- total matching rows (for UI, not for cursor logic)

) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH

  -- ================================================================
  -- STAGE 1 + 2: VISIBILITY — owner OR edge exists
  -- This CTE is the canonical visibility check. Do not alter.
  -- ================================================================
  visible_nodes AS (
    SELECT DISTINCT ON (n.id)
      n.id                  AS node_id,
      n.url,
      n.text_content,
      n.title               AS raw_title,
      n.thumbnail_key,
      n.owner_id,
      n.language_code       AS node_language_code,
      n.origin_user_id,
      n.origin_created_at,
      n.created_at,
      CASE
        WHEN n.owner_id = p_user_id THEN 'own'
        WHEN e.direction = 'sent'   THEN 'sent'
        ELSE 'received'
      END                   AS direction,
      e.sender_id
    FROM nodes n
    LEFT JOIN edges e
      ON e.node_id = n.id
     AND e.user_id = p_user_id
    WHERE
      -- Visibility predicate (PRD §5)
      n.deleted_at IS NULL
      AND (
        n.owner_id = p_user_id
        OR e.id IS NOT NULL          -- at least one edge exists
      )
      -- Block filter (PRD §10) — symmetric exclusion
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
           OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id)
      )
  ),

  -- ================================================================
  -- STAGE 3: CONTEXT FILTER — narrows dataset, never expands it
  -- ================================================================
  context_filtered AS (
    SELECT vn.*
    FROM visible_nodes vn
    WHERE
      -- Personal context: only own nodes
      -- (activated when no other context is set and p_view-based filtering handles it)

      -- Friend context (PRD §8): nodes with edge shared to/from this friend
      (p_friend_id IS NULL OR EXISTS (
        SELECT 1 FROM edges e2
        WHERE e2.node_id = vn.node_id
          AND (
            (e2.user_id = p_friend_id AND e2.sender_id = p_user_id)
            OR
            (e2.user_id = p_user_id AND e2.sender_id = p_friend_id)
          )
      ))

      -- Folder context (PRD §8): node is in this folder (edge-only, no folder join for visibility)
      AND (p_folder_id IS NULL OR EXISTS (
        SELECT 1 FROM folder_edges fe
        WHERE fe.node_id = vn.node_id
          AND fe.folder_id = p_folder_id
      ))

      -- Group context (PRD §8): node is shared in this group
      AND (p_group_id IS NULL OR EXISTS (
        SELECT 1 FROM group_nodes gn
        WHERE gn.node_id = vn.node_id
          AND gn.group_id = p_group_id
      ))
  ),

  -- ================================================================
  -- STAGE 4: VIEW TOGGLE FILTER (PRD §11.2a)
  -- All / Mine / Received
  -- ================================================================
  view_filtered AS (
    SELECT cf.*
    FROM context_filtered cf
    WHERE
      p_view = 'all'
      OR (p_view = 'mine'     AND cf.node_id IN (
            -- 'mine' view: nodes where current user is the origin creator
            SELECT id FROM nodes WHERE origin_user_id = p_user_id
          )
      )
      OR (p_view = 'received' AND cf.direction = 'received')
  ),

  -- ================================================================
  -- STAGE 5: MULTI-FILTER (PRD §16.2) — AND logic
  -- ================================================================
  multi_filtered AS (
    SELECT vf.*
    FROM view_filtered vf
    WHERE
      -- Tag filter: node must have ALL specified tags
      (p_filter_tag_ids IS NULL OR (
        SELECT COUNT(DISTINCT te.tag_id)
        FROM tag_edges te
        WHERE te.node_id = vf.node_id
          AND te.tag_id = ANY(p_filter_tag_ids)
      ) = array_length(p_filter_tag_ids, 1))

      -- Friend filter: node must have been shared to/from ALL specified friends
      AND (p_filter_friend_ids IS NULL OR (
        SELECT COUNT(DISTINCT shared_friend)
        FROM (
          SELECT UNNEST(p_filter_friend_ids) AS shared_friend
        ) AS required_friends
        WHERE EXISTS (
          SELECT 1 FROM edges ef
          WHERE ef.node_id = vf.node_id
            AND (ef.user_id = shared_friend OR ef.sender_id = shared_friend)
        )
      ) = array_length(p_filter_friend_ids, 1))

      -- Folder filter: node must be in ALL specified folders
      AND (p_filter_folder_ids IS NULL OR (
        SELECT COUNT(DISTINCT fe2.folder_id)
        FROM folder_edges fe2
        WHERE fe2.node_id = vf.node_id
          AND fe2.folder_id = ANY(p_filter_folder_ids)
      ) = array_length(p_filter_folder_ids, 1))
  ),

  -- ================================================================
  -- STAGE 6: SEARCH (PRD §33.5)
  -- Searches translated title, description, and tag labels
  -- No cross-language blending
  -- ================================================================
  search_filtered AS (
    SELECT mf.*
    FROM multi_filtered mf
    WHERE
      p_search_query IS NULL
      OR EXISTS (
        -- Search translations in user's language
        SELECT 1 FROM translations t
        WHERE t.node_id = mf.node_id
          AND t.language_code = p_language_code
          AND (
            t.title ILIKE '%' || p_search_query || '%'
            OR t.description ILIKE '%' || p_search_query || '%'
          )
      )
      OR mf.raw_title ILIKE '%' || p_search_query || '%'
      OR EXISTS (
        -- Search tag labels in user's language
        SELECT 1 FROM tag_edges te2
        JOIN tag_translations tt ON tt.tag_id = te2.tag_id
        WHERE te2.node_id = mf.node_id
          AND tt.language_code = p_language_code
          AND tt.label ILIKE '%' || p_search_query || '%'
      )
  ),

  -- ================================================================
  -- STAGE 7: TITLE RESOLUTION — deterministic fallback chain (PRD §33.3)
  -- 1. translations WHERE language_code = user's language
  -- 2. translations WHERE language_code = node's language
  -- 3. nodes.raw_title
  -- ================================================================
  with_resolved_title AS (
    SELECT
      sf.*,
      COALESCE(
        (SELECT t1.title FROM translations t1
         WHERE t1.node_id = sf.node_id
           AND t1.language_code = p_language_code
         LIMIT 1),
        (SELECT t2.title FROM translations t2
         WHERE t2.node_id = sf.node_id
           AND t2.language_code = sf.node_language_code
         LIMIT 1),
        sf.raw_title
      ) AS resolved_title
    FROM search_filtered sf
  ),

  -- ================================================================
  -- STAGE 8: JOIN SORT CACHE + SENDER INFO
  -- ================================================================
  with_meta AS (
    SELECT
      wrt.*,
      nsc.avg_rating,
      nsc.view_count,
      nsc.share_count,
      u.display_name   AS sender_name,
      u.avatar_key     AS sender_avatar_key
    FROM with_resolved_title wrt
    LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = wrt.node_id
    LEFT JOIN users u ON u.id = wrt.sender_id
  ),

  -- ================================================================
  -- STAGE 9: AGGREGATE TAGS (JSON array per node)
  -- Tag labels resolved via fallback chain (PRD §33.4)
  -- ================================================================
  with_tags AS (
    SELECT
      wm.*,
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'tag_id',    t.id,
            'color_hex', t.color_hex,
            'label',     COALESCE(
                           (SELECT tt1.label FROM tag_translations tt1
                            WHERE tt1.tag_id = t.id
                              AND tt1.language_code = p_language_code
                            LIMIT 1),
                           (SELECT tt2.label FROM tag_translations tt2
                            WHERE tt2.tag_id = t.id
                              AND tt2.language_code = 'en'
                            LIMIT 1),
                           LEFT(t.id::TEXT, 8)   -- last-resort: tag_id prefix
                         )
          )
          ORDER BY te.created_at ASC
        ), '[]'::jsonb)
        FROM tag_edges te
        JOIN tags t ON t.id = te.tag_id
        WHERE te.node_id = wm.node_id
      ) AS tags
    FROM with_meta wm
  ),

  -- ================================================================
  -- STAGE 10: DEDUPLICATION
  -- Multiple edges per (node, user) are valid — collapse to one row per node.
  -- Prefer 'received' direction over 'sent' for display badge.
  -- DISTINCT ON ordered by direction ensures 'received' wins when both exist.
  -- ================================================================
  deduped AS (
    SELECT DISTINCT ON (node_id)
      *
    FROM with_tags
    ORDER BY
      node_id,
      CASE direction
        WHEN 'received' THEN 1
        WHEN 'sent'     THEN 2
        WHEN 'own'      THEN 3
      END
  ),

  -- ================================================================
  -- STAGE 11: CURSOR PAGINATION
  -- Stable cursor based on (sort_value, created_at, node_id).
  -- Always include node_id as tiebreaker to guarantee determinism.
  -- ================================================================
  paginated AS (
    SELECT
      d.*,
      COUNT(*) OVER() AS total_count
    FROM deduped d
    WHERE
      -- Cursor: skip rows already seen
      p_cursor_created_at IS NULL
      OR (
        CASE p_sort
          WHEN 'newest'         THEN d.created_at < p_cursor_created_at
                                  OR (d.created_at = p_cursor_created_at AND d.node_id < p_cursor_node_id)
          WHEN 'oldest'         THEN d.created_at > p_cursor_created_at
                                  OR (d.created_at = p_cursor_created_at AND d.node_id > p_cursor_node_id)
          WHEN 'most_shared'    THEN d.share_count < (SELECT share_count FROM nodes_sort_cache WHERE node_id = p_cursor_node_id)
                                  OR (d.share_count = (SELECT share_count FROM nodes_sort_cache WHERE node_id = p_cursor_node_id) AND d.node_id < p_cursor_node_id)
          WHEN 'highest_rated'  THEN COALESCE(d.avg_rating, -1) < COALESCE((SELECT avg_rating FROM nodes_sort_cache WHERE node_id = p_cursor_node_id), -1)
                                  OR (COALESCE(d.avg_rating, -1) = COALESCE((SELECT avg_rating FROM nodes_sort_cache WHERE node_id = p_cursor_node_id), -1) AND d.node_id < p_cursor_node_id)
          WHEN 'custom'         THEN TRUE  -- custom sort applies ORDER BY separately; cursor not used
          ELSE TRUE
        END
      )
    ORDER BY
      CASE p_sort
        WHEN 'newest'        THEN d.created_at           END DESC NULLS LAST,
      CASE p_sort
        WHEN 'oldest'        THEN d.created_at           END ASC  NULLS LAST,
      CASE p_sort
        WHEN 'most_shared'   THEN d.share_count          END DESC NULLS LAST,
      CASE p_sort
        WHEN 'highest_rated' THEN d.avg_rating           END DESC NULLS LAST,
      -- node_id tiebreaker is always applied (guarantees stable page boundaries)
      d.node_id ASC
    LIMIT p_limit
  )

  -- ================================================================
  -- FINAL OUTPUT
  -- ================================================================
  SELECT
    p.node_id,
    p.url,
    p.text_content,
    p.resolved_title      AS title,
    p.thumbnail_key,
    p.owner_id,
    p.node_language_code  AS language_code,
    p.origin_user_id,
    p.origin_created_at,
    p.created_at,
    p.avg_rating,
    p.view_count,
    p.share_count,
    p.direction,
    p.sender_id,
    p.sender_name,
    p.sender_avatar_key,
    p.tags,
    p.total_count
  FROM paginated p;

END;
$$;
```

---

## 3. QUERY CALL EXAMPLES

All examples call `get_feed()` via Supabase RPC from `lib/db/visibility.ts`.

### 3.1 Default feed (All, newest first, page 1)

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_view: 'all',
  p_sort: 'newest',
  p_limit: 30   // initial load is larger (TAD §16.1)
})
```

### 3.2 Received view

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_view: 'received',
  p_sort: 'newest',
  p_limit: 20
})
```

### 3.3 Sent view

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_view: 'sent',
  p_sort: 'newest',
  p_limit: 20
})
```

### 3.4 Friend context (click friend avatar)

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_friend_id: friendId,
  p_view: 'all',
  p_sort: 'newest',
  p_limit: 20
})
```

### 3.5 Folder context

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_folder_id: folderId,
  p_view: 'all',
  p_sort: 'newest',
  p_limit: 20
})
```

### 3.6 Multi-filter: friend A AND folder X AND tag T

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_filter_friend_ids: [friendAId],
  p_filter_folder_ids: [folderXId],
  p_filter_tag_ids: [tagTId],
  p_view: 'all',
  p_sort: 'newest',
  p_limit: 20
})
```

### 3.7 Search

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_search_query: 'jazz',
  p_view: 'all',
  p_sort: 'newest',
  p_limit: 20
})
```

### 3.8 Cursor pagination (page 2)

```typescript
// Page 1 response gives you the last item's created_at and node_id
const lastItem = page1Data[page1Data.length - 1]

const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_sort: 'newest',
  p_cursor_created_at: lastItem.created_at,
  p_cursor_node_id: lastItem.node_id,
  p_limit: 20
})
```

### 3.9 Highest rated sort (NULLS LAST)

```typescript
const { data } = await serviceClient.rpc('get_feed', {
  p_user_id: userId,
  p_language_code: user.language_code,
  p_sort: 'highest_rated',
  p_limit: 20
})
// Unrated nodes (avg_rating IS NULL) appear at the end
```

---

## 4. CUSTOM SORT QUERY

Custom sort uses a separate, simpler query. Card positions are stored per user per context.

```sql
-- supabase/migrations/006_custom_sort.sql

CREATE TABLE user_node_sort_positions (
  user_id     UUID NOT NULL REFERENCES users(id),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  context_key TEXT NOT NULL,   -- 'personal' | 'folder:{id}' | 'friend:{id}' | 'group:{id}'
  position    INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, node_id, context_key)
);

CREATE INDEX unsp_user_context_idx ON user_node_sort_positions(user_id, context_key, position);
```

---

## 5. SIDEBAR QUERIES (supporting the feed UI)

These queries power the bars and navigation, not the feed grid itself.

### 5.1 Friends list (Unified bar — friends portion)

```sql
-- Returns all entries for the Friends & Groups Strip for the current user.
-- Friendship model (PRD §9.1–9.3): based on friend_invites table.
-- A user X appears in the strip if:
--   (a) current user invited X (from_user_id = p_user_id, to_user_id = X), OR
--   (b) X invited current user (from_user_id = X, to_user_id = p_user_id).
-- Pending invites (to_user_id IS NULL) are included — shown as dimmed with clock icon.
-- No friends table. No bidirectional edge check.

CREATE OR REPLACE FUNCTION get_friend_bar(p_user_id UUID)
RETURNS TABLE (
  user_id      UUID,        -- NULL if pending (invitee not yet signed up)
  display_name TEXT,        -- NULL if pending
  avatar_key   TEXT,        -- NULL if pending
  to_email     TEXT,        -- populated for pending invites
  is_pending   BOOLEAN,     -- true when to_user_id IS NULL
  last_activity TIMESTAMPTZ -- most recent edge involving this friendship (NULL if pending)
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    u.id                                             AS user_id,
    u.display_name,
    u.avatar_key,
    fi.to_email,
    (fi.to_user_id IS NULL)                         AS is_pending,
    MAX(e.created_at)                               AS last_activity
  FROM friend_invites fi

  -- Resolve the other party: either the invitee or the inviter
  LEFT JOIN users u ON u.id = CASE
    WHEN fi.from_user_id = p_user_id THEN fi.to_user_id   -- current user sent invite
    ELSE fi.from_user_id                                    -- current user received invite
  END

  -- Last activity: most recent edge between the two resolved users
  LEFT JOIN edges e ON (
    (e.sender_id = p_user_id AND e.user_id = u.id)
    OR
    (e.sender_id = u.id AND e.user_id = p_user_id)
  )

  WHERE
    -- Invites where current user is sender or recipient
    (fi.from_user_id = p_user_id OR fi.to_user_id = p_user_id)

    -- Exclude blocked users (only when to_user_id is resolved)
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE u.id IS NOT NULL
        AND ((b.blocker_id = p_user_id AND b.blocked_id = u.id)
          OR (b.blocker_id = u.id     AND b.blocked_id = p_user_id))
    )

  GROUP BY u.id, u.display_name, u.avatar_key, fi.to_email, fi.to_user_id
  ORDER BY last_activity DESC NULLS LAST;
$$;
```

### 5.2 Groups list (Unified bar — groups portion)

```sql
CREATE OR REPLACE FUNCTION get_user_groups(p_user_id UUID)
RETURNS TABLE (
  group_id      UUID,
  name          TEXT,
  member_count  BIGINT,
  last_activity TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    g.id,
    g.name,
    COUNT(DISTINCT gm.user_id) AS member_count,
    MAX(e.created_at) AS last_activity
  FROM groups g
  JOIN group_members gm_self ON gm_self.group_id = g.id AND gm_self.user_id = p_user_id
  JOIN group_members gm ON gm.group_id = g.id
  LEFT JOIN edges e ON e.cause_id IN (
    SELECT id FROM causes
    WHERE cause_type = 'group_share'
      AND metadata->>'group_id' = g.id::TEXT
  )
  WHERE g.deleted_at IS NULL
  GROUP BY g.id, g.name
  ORDER BY last_activity DESC NULLS LAST;
$$;
```

### 5.3 Folders list (Folders bar)

```sql
CREATE OR REPLACE FUNCTION get_user_folders(
  p_user_id       UUID,
  p_friend_id     UUID DEFAULT NULL   -- when friend context active, show only shared folders
) RETURNS TABLE (
  folder_id     UUID,
  name          TEXT,
  parent_id     UUID,
  item_count    BIGINT,
  avg_rating    NUMERIC,
  access_users  JSONB    -- [{user_id, display_name, avatar_key}] up to 3
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    f.id,
    f.name,
    f.parent_folder_id,
    COUNT(DISTINCT fe.node_id) AS item_count,

    -- Folder avg rating = average of avg_ratings of all nodes inside
    AVG(nsc.avg_rating) AS avg_rating,

    -- Up to 3 users with access via causes metadata
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'user_id',      u.id,
          'display_name', u.display_name,
          'avatar_key',   u.avatar_key
        )
      ), '[]'::jsonb)
      FROM (
        SELECT DISTINCT c.metadata->>'user_id' AS uid
        FROM causes c
        WHERE c.cause_type = 'direct_share'
          AND c.metadata->>'folder_id' = f.id::TEXT
          AND c.metadata->>'user_id' IS NOT NULL
          AND c.metadata->>'user_id' != p_user_id::TEXT
        LIMIT 3
      ) AS access_uids
      JOIN users u ON u.id = access_uids.uid::UUID
    ) AS access_users

  FROM folders f
  LEFT JOIN folder_edges fe ON fe.folder_id = f.id
  LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = fe.node_id

  WHERE
    f.deleted_at IS NULL
    AND (
      -- User owns the folder
      f.owner_id = p_user_id
      -- OR user has access via an edge from a folder share
      OR EXISTS (
        SELECT 1 FROM causes c2
        WHERE c2.cause_type = 'direct_share'
          AND c2.metadata->>'folder_id' = f.id::TEXT
          AND c2.metadata->>'user_id' = p_user_id::TEXT
      )
    )
    -- Friend context filter: show only folders shared with this friend
    AND (p_friend_id IS NULL OR EXISTS (
      SELECT 1 FROM causes c3
      WHERE c3.cause_type = 'direct_share'
        AND c3.metadata->>'folder_id' = f.id::TEXT
        AND c3.metadata->>'user_id' = p_friend_id::TEXT
    ))

  GROUP BY f.id, f.name, f.parent_folder_id
  ORDER BY f.name ASC;
$$;
```

### 5.4 Friends with access to a folder/group (highlight query)

```sql
-- Used to highlight friends in the Unified bar when a folder/group is selected (PRD §16.4)

CREATE OR REPLACE FUNCTION get_folder_access_users(
  p_folder_id UUID,
  p_requester_id UUID
) RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  avatar_key   TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT
    u.id,
    u.display_name,
    u.avatar_key
  FROM causes c
  JOIN users u ON u.id = (c.metadata->>'user_id')::UUID
  WHERE
    c.cause_type = 'direct_share'
    AND c.metadata->>'folder_id' = p_folder_id::TEXT
    AND (c.metadata->>'user_id')::UUID != p_requester_id
  ORDER BY u.display_name ASC;
$$;

CREATE OR REPLACE FUNCTION get_group_access_users(
  p_group_id UUID
) RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  avatar_key   TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    u.id,
    u.display_name,
    u.avatar_key
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = p_group_id
  ORDER BY u.display_name ASC;
$$;
```

### 5.5 Breadcrumb path query (PRD §11.8)

```sql
CREATE OR REPLACE FUNCTION get_folder_breadcrumb(
  p_folder_id UUID
) RETURNS TABLE (
  folder_id UUID,
  name      TEXT,
  depth     INTEGER
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    f.id,
    f.name,
    ft.depth
  FROM folder_tree ft
  JOIN folders f ON f.id = ft.ancestor_id
  WHERE ft.folder_id = p_folder_id
    AND f.deleted_at IS NULL
  ORDER BY ft.depth ASC;  -- depth 0 = root, highest depth = current folder
$$;
```

### 5.6 Notification count (bell badge)

```sql
CREATE OR REPLACE FUNCTION get_unread_notification_count(
  p_user_id UUID
) RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER
  FROM notifications
  WHERE user_id = p_user_id AND read = false;
$$;
```

### 5.7 Trash item count (badge)

```sql
CREATE OR REPLACE FUNCTION get_trash_count(
  p_user_id UUID
) RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER
  FROM nodes
  WHERE owner_id = p_user_id AND deleted_at IS NOT NULL;
$$;
```

---

## 6. REQUIRED INDEXES

Add to `supabase/migrations/007_feed_indexes.sql`:

```sql
-- Visibility query performance
CREATE INDEX IF NOT EXISTS nodes_owner_deleted_idx
  ON nodes(owner_id, deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS nodes_created_at_idx
  ON nodes(created_at DESC);

-- Edge query performance
CREATE INDEX IF NOT EXISTS edges_user_direction_idx
  ON edges(user_id, direction);

CREATE INDEX IF NOT EXISTS edges_sender_direction_idx
  ON edges(sender_id, direction);

CREATE INDEX IF NOT EXISTS edges_node_user_direction_idx
  ON edges(node_id, user_id, direction);

-- Tag filtering
CREATE INDEX IF NOT EXISTS tag_edges_node_tag_idx
  ON tag_edges(node_id, tag_id);

-- Folder hierarchy
CREATE INDEX IF NOT EXISTS folder_tree_folder_idx
  ON folder_tree(folder_id, depth);

CREATE INDEX IF NOT EXISTS folder_edges_folder_node_idx
  ON folder_edges(folder_id, node_id);

-- Sort cache
CREATE INDEX IF NOT EXISTS nsc_avg_rating_idx
  ON nodes_sort_cache(avg_rating DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS nsc_share_count_idx
  ON nodes_sort_cache(share_count DESC);

-- Group membership
CREATE INDEX IF NOT EXISTS group_members_user_idx
  ON group_members(user_id);

-- Causes metadata (JSONB — for folder_share_op_id lookups)
CREATE INDEX IF NOT EXISTS causes_folder_share_op_idx
  ON causes USING gin (metadata jsonb_path_ops)
  WHERE cause_type = 'direct_share';

-- Translations lookup
CREATE INDEX IF NOT EXISTS translations_node_lang_idx
  ON translations(node_id, language_code);

-- Custom sort positions
CREATE INDEX IF NOT EXISTS unsp_user_context_pos_idx
  ON user_node_sort_positions(user_id, context_key, position ASC);

-- Block lookup (bidirectional)
CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks(blocked_id);

-- Search (pg_trgm for ILIKE performance)
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS nodes_title_trgm_idx
  ON nodes USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS translations_title_trgm_idx
  ON translations USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tag_translations_label_trgm_idx
  ON tag_translations USING gin (label gin_trgm_ops);
```

---

## 7. INVARIANT TESTS (SQL)

Run these after every migration to verify feed correctness. Use Supabase SQL Editor or a test script.

```sql
-- TEST 1: Node with no edge is invisible to non-owner
-- Setup: node owned by user_a, no edges to user_b
-- Expect: get_feed(user_b) returns 0 rows for that node
SELECT COUNT(*) = 0 AS t1_pass
FROM get_feed(:'user_b_id')
WHERE node_id = :'test_node_id';

-- TEST 2: Node becomes visible after directShare
-- Setup: after direct_share(user_a, node_id, user_b)
-- Expect: get_feed(user_b) returns that node
SELECT COUNT(*) = 1 AS t2_pass
FROM get_feed(:'user_b_id')
WHERE node_id = :'test_node_id';

-- TEST 3: Node disappears after cause deletion
-- Setup: DELETE the cause from test 2
-- Expect: get_feed(user_b) returns 0 rows for that node
SELECT COUNT(*) = 0 AS t3_pass
FROM get_feed(:'user_b_id')
WHERE node_id = :'test_node_id';

-- TEST 4: Soft-deleted node is invisible
-- Setup: UPDATE nodes SET deleted_at = now() WHERE id = node_id
-- Expect: get_feed(user_a — the owner) returns 0 rows
SELECT COUNT(*) = 0 AS t4_pass
FROM get_feed(:'user_a_id')
WHERE node_id = :'test_node_id';

-- TEST 5: Restore makes node visible again
-- Setup: UPDATE nodes SET deleted_at = NULL WHERE id = node_id
-- Expect: get_feed(user_b) returns 1 row (edge still exists from test 2)
SELECT COUNT(*) = 1 AS t5_pass
FROM get_feed(:'user_b_id')
WHERE node_id = :'test_node_id';

-- TEST 6: Blocked user's nodes are invisible
-- Setup: INSERT INTO blocks (blocker_id, blocked_id) VALUES (user_b, user_a)
-- Expect: get_feed(user_b) returns 0 rows for user_a's nodes (even with edge)
SELECT COUNT(*) = 0 AS t6_pass
FROM get_feed(:'user_b_id')
WHERE owner_id = :'user_a_id';

-- TEST 7: Multi-filter AND logic
-- Setup: node in folder_x with tag_t, shared to friend_a
-- Expect: get_feed with all 3 filters returns the node
-- Expect: get_feed with folder_x + wrong tag returns 0
SELECT COUNT(*) >= 1 AS t7_pass
FROM get_feed(
  p_user_id := :'user_b_id',
  p_filter_folder_ids := ARRAY[:'folder_x_id']::UUID[],
  p_filter_tag_ids := ARRAY[:'tag_t_id']::UUID[]
)
WHERE node_id = :'test_node_id';

-- TEST 8: Duplicate edges produce exactly 1 row per node
-- Setup: directShare called twice for same (node, user) pair
-- Expect: get_feed returns exactly 1 row for that node (dedup stage)
SELECT COUNT(*) = 1 AS t8_pass
FROM get_feed(:'user_b_id')
WHERE node_id = :'test_node_id';

-- TEST 9: Cursor pagination is stable
-- Expect: page1 last item cursor produces non-overlapping page 2
WITH page1 AS (
  SELECT node_id, created_at
  FROM get_feed(p_user_id := :'user_id', p_limit := 5)
  ORDER BY created_at DESC
),
cursor_vals AS (
  SELECT created_at AS c_at, node_id AS c_id FROM page1 ORDER BY created_at ASC LIMIT 1
),
page2 AS (
  SELECT node_id FROM get_feed(
    p_user_id := :'user_id',
    p_cursor_created_at := (SELECT c_at FROM cursor_vals),
    p_cursor_node_id := (SELECT c_id FROM cursor_vals),
    p_limit := 5
  )
)
SELECT
  (SELECT COUNT(*) FROM page1 p JOIN page2 p2 ON p.node_id = p2.node_id) = 0
  AS t9_no_overlap;

-- TEST 10: Received view excludes own nodes
SELECT COUNT(*) = 0 AS t10_pass
FROM get_feed(p_user_id := :'user_id', p_view := 'received')
WHERE owner_id = :'user_id' AND direction = 'own';

-- TEST 11: avg_rating = NULL shows as NULL (not 0)
SELECT (avg_rating IS NULL) AS t11_pass
FROM get_feed(p_user_id := :'user_id')
WHERE node_id = :'unrated_node_id';
```

---

## 8. TypeScript CALL WRAPPER

```typescript
// lib/db/feed.ts

import { createServiceClient } from '@/lib/supabase/service'
import type { VisibleNode } from '@/lib/types/app'
import { PAGINATION } from '@/lib/constants'

export interface FeedParams {
  userId: string
  languageCode: string
  view?: 'all' | 'mine' | 'received'
  friendId?: string
  folderId?: string
  groupId?: string
  filterTagIds?: string[]
  filterFriendIds?: string[]
  filterFolderIds?: string[]
  searchQuery?: string
  sort?: 'newest' | 'oldest' | 'most_shared' | 'highest_rated' | 'custom'
  cursorCreatedAt?: string
  cursorNodeId?: string
  isInitialLoad?: boolean
}

export interface FeedResult {
  nodes: VisibleNode[]
  totalCount: number
  nextCursor: { createdAt: string; nodeId: string } | null
}

export async function getFeed(params: FeedParams): Promise<FeedResult> {
  const supabase = createServiceClient()
  const limit = params.isInitialLoad ? PAGINATION.FEED_INITIAL_LOAD : PAGINATION.FEED_PAGE_SIZE

  const { data, error } = await supabase.rpc('get_feed', {
    p_user_id: params.userId,
    p_language_code: params.languageCode,
    p_view: params.view ?? 'all',
    p_friend_id: params.friendId ?? null,
    p_folder_id: params.folderId ?? null,
    p_group_id: params.groupId ?? null,
    p_filter_tag_ids: params.filterTagIds ?? null,
    p_filter_friend_ids: params.filterFriendIds ?? null,
    p_filter_folder_ids: params.filterFolderIds ?? null,
    p_search_query: params.searchQuery ?? null,
    p_sort: params.sort ?? 'newest',
    p_cursor_created_at: params.cursorCreatedAt ?? null,
    p_cursor_node_id: params.cursorNodeId ?? null,
    p_limit: limit
  })

  if (error) throw new Error(`Feed query failed: ${error.message}`)

  const nodes = (data ?? []) as VisibleNode[]
  const totalCount = nodes[0]?.total_count ?? 0

  const nextCursor = nodes.length === limit
    ? { createdAt: nodes[nodes.length - 1].created_at, nodeId: nodes[nodes.length - 1].node_id }
    : null

  return { nodes, totalCount, nextCursor }
}
```

---

## 9. FEED QUERY DECISION TABLE

Use this table to verify that every UI state maps to the correct parameters:

| UI State | `p_view` | `p_friend_id` | `p_folder_id` | `p_filter_*` | `p_sort` |
|---|---|---|---|---|---|
| Default load | `all` | null | null | null | `newest` |
| Received toggle | `received` | null | null | null | `newest` |
| Mine toggle | `mine` | null | null | null | `newest` |
| Click friend avatar | `all` | `{id}` | null | null | current |
| Click folder chip | `all` | null | `{id}` | null | current |
| Click group chip | `all` | null | null | null → `p_group_id` | current |
| Click tag chip | `all` | null | null | `tag_ids:[{id}]` | current |
| Click "Me" avatar | `all` | null | null | null | `newest` |
| Friend + folder | `all` | null | null | `friend_ids+folder_ids` | current |
| Search | `all` | null | null | null | current |
| Sort change | unchanged | unchanged | unchanged | unchanged | `{new}` |
| Card reorder | `all` | context | context | unchanged | `custom` |

---

## 10. KNOWN LIMITATIONS AND MITIGATIONS

| Limitation | Impact | Mitigation |
|---|---|---|
| Multi-filter AND with large tag arrays | Slow COUNT(*) subquery | Limit UI to max 5 simultaneous tag filters |
| JSONB GIN index on causes.metadata | Slower on high-volume write | Acceptable — causes are written once, never updated |
| `total_count` via `COUNT(*) OVER()` | Adds ~10% query overhead | Acceptable; only used for UI display, not cursor logic |
| ILIKE search on large datasets | Linear scan without trgm | `pg_trgm` extension + GIN indexes (§6) required |
| Custom sort with offset pagination | Stale pages on insert | Acceptable for MVP; switch to stable cursor in v2 |
| Nested folder feed | Resolved in P4-T04 | Subtree expanded via folder_tree in get_feed and get_user_folders |

---

*End of LIKED Feed SQL Specification v1.0*
