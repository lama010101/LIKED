# LIKED — Unified Product Requirements Document

**Version: 27.2**  
**Status: AUTHORITATIVE**  
**This is the complete single merged document integrating PRD v25.0 and UIX Amendment v26.0. The UIX Amendment v26.0 fully supersedes §11, §12 (drag contract additions), §13, §14 (card detail), and §39 (checklist) of PRD v25.0 on all UI/UX matters. All other sections of PRD v25.0 remain unchanged and authoritative. No information has been lost or summarized.**  
**Reference prototype updated: LIKED_Prototype (React, multi-file JSX). Supersedes liked-ux-redesign-v4.html as of this version.**  
**Built for: Windsurf Editor (https://windsurf.com) + Cascade AI agent (Next.js 15 / React (https://react.dev) + Tailwind (https://tailwindcss.com) + Supabase (https://supabase.com))**

---

## 0. DOCUMENT AUTHORITY

### 0.1 This document defines:

- Full system behavior
- Data model and schema
- Visibility logic (edge-based, non-negotiable)
- Write system and transactional guarantees
- Feature contracts
- UI/UX layout and interaction model
- Media playback
- Rating system
- Selection, filtering, multi-select, long-press
- Trash / restore system
- Tag system with canonical multilingual labels
- Admin permissions
- Tech stack and deployment
- Profile identity system
- Multilingual system
- Node provenance tracking
- Text nodes and infinite canvas
- Validation checklist

Does NOT define:

- Feed SQL implementation (separate spec)
- Chat implementation (deferred to last phase)

### 0.2 AMENDMENT SCOPE (from UIX Amendment v26.0)

This document replaces the following sections of PRD v25.0:

| Section | v25 title | Status |
|---|---|---|
| §11.1 | Top Bar (2-row layout) | **Replaced** |
| §11.3 | Floating Create Button | **Replaced** |
| §11.4 | Unified Friends & Groups Bar | **Replaced** |
| §11.5 | Folders Bar | **Replaced** |
| §11.6 | "Me" Avatar | **Replaced** |
| §11.8 | Top Hierarchy Navigation | **Replaced** |
| §11.3 | FAB — Speed-Dial | **Replaced by v27.1** |
| §11.4 | Friends & Groups Strip — 3-state model | **Replaced by v27.1** |
| §11.1 | Top Bar — Search + Tags replace Sliders | **Replaced by v27.2** |
| §11.3e | Filter Feed Bottom Sheet | **Removed by v27.2** |
| §11.3f | Tags Strip (new) | **Added by v27.2** |
| §12 | Drag-and-Drop Contract (additions) | **Extended** |
| §13.1 | Card Anatomy | **Extended** |
| §13.2 | Folder Card Anatomy | **Replaced** |
| §14 | Card Detail Modal | **Replaced** |
| §39 | v25 Validation Checklist | **Replaced** |

Sections **not changed**: §1–10, §11.2 (five view modes), §15–38, §40.

---

## 1. SYSTEM OVERVIEW

LIKED is a **deterministic, full-stack content-sharing web application** where:

- Users create **nodes** (cards created from URLs **or direct text input**)  
- Visibility is resolved through **explicit edge state only**  
- All features are **orchestrators of cause + edge creation/removal**  
- The feed is the **only consumption surface**

**Responsive layout:**

- **Desktop default** (large screen): masonry grid workspace **with infinite canvas support** (default), switchable to icon grid / list / horizontal row / infinite canvas  
- **Mobile default** (small screen): icon grid (5 cards per row), switchable to masonry / list / horizontal row / infinite canvas  
- View mode **auto-detects** screen size via Tailwind breakpoints **and** can be manually overridden via view toggle

All interactions (drag-and-drop, sharing, folders, groups) are fully persisted in Supabase/Neon Postgres. Real-time updates via Supabase subscriptions.

---

## 2. SOURCE OF TRUTH

| Domain      | Source                                                                 |
|-------------|------------------------------------------------------------------------|
| Identity    | users (with normalized_display_name)                                   |
| Content     | nodes (with origin_user_id, origin_created_at, language_code)         |
| Visibility  | edges (keyed to causes; no UNIQUE(node_id, user_id))                   |
| Causes      | causes (direct_share \| group_share \| import)                         |
| Groups      | group_members                                                          |
| Folders     | folder_edges (organizational only)                                     |
| Ratings     | ratings                                                                |
| Aggregation | nodes_sort_cache (includes avg_rating)                                 |
| Tags        | tag_edges + tags (concept layer) + tag_translations (display labels)   |
| Translations| translations (node content i18n)                                       |
| Trash       | nodes.deleted_at (soft delete, restorable)                             |
| Permissions | folder_admins / group_admins                                           |

---

## 3. CORE PRINCIPLE (NON-NEGOTIABLE)

> A user can see a node **ONLY if an active edge exists.**

Everything else — groups, folders, imports — **MUST resolve into causes + edges.**

> ⚠️ **RESOLUTION — Inconsistency #1 (Folder/Group visibility):**  
> UIX PRD v2 stated folders/groups are "purely organizational (no visibility impact)." FULL PRD v18 defines folder and group sharing as write-expansion orchestrators that create/remove edges. **FULL PRD v18 wins.** Folders/groups have no read-time visibility role but do have write-time edge expansion impact.

---

## 4. DATA MODEL

### 4.1 Core Tables

| Table            | Key fields                                                                                                                                    |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| users            | id, display_name, normalized_display_name (UNIQUE), language_code, avatar_key (internal), username_changed_at, avatar_change_count_today, created_at |
| nodes            | id, url, title, thumbnail_key (internal), owner_id, language_code, origin_user_id (NOT NULL), origin_created_at (NOT NULL), deleted_at, created_at |
| causes           | id, cause_type (direct_share \| group_share \| import), created_by, created_at, metadata (JSONB)                                              |
| edges            | id, node_id, user_id, cause_id (FK → causes ON DELETE CASCADE), sender_id, direction, depth (optional), created_at — **NO UNIQUE(node_id, user_id)** |
| ratings          | id, node_id, user_id, score (0–10, step 0.5), updated_at                                                                                     |
| nodes_sort_cache | node_id, avg_rating, view_count, share_count, updated_at                                                                                      |
| blocks           | blocker_id, blocked_id                                                                                                                        |

> **`edges.cause_id`**: every edge traces to exactly one cause. Deleting a cause cascades to all its edges with no further checks.

> **`edges.direction`**: values `sent` or `received` — used to power the "I sent / I received" card badge and feed filter without a separate query.

> **`edges.sender_id`**: the user who initiated the share, enabling "I sent" attribution even when querying from recipient side.

> **`edges.depth`**: `0` for import; `parent_depth + 1` for all share types. Written once at creation; never recomputed.

> **`nodes.origin_user_id` / `nodes.origin_created_at`**: set once at node creation; never modified. Records the original creator and creation timestamp independent of sharing history.

> **`users.avatar_key`**: references an internally stored object (e.g., Supabase Storage key). **No external avatar URLs are stored or accepted.**

> **`users.normalized_display_name`**: lowercase, NFKC-normalized, trimmed version of `display_name`. Enforced UNIQUE. Used for identity deduplication.

### 4.2 Group Tables

| Table         | Purpose                              |
|---------------|--------------------------------------|
| group_nodes   | Nodes shared to a group              |
| group_members | Users belonging to a group           |
| group_admins  | user_id + group_id + granted_by      |

### 4.3 Folder Tables

| Table         | Purpose                                                         |
|---------------|-----------------------------------------------------------------|
| folders       | id, name, owner_id, parent_folder_id, deleted_at                |
| folder_edges  | Node ↔ folder membership (organizational only)                  |
| folder_tree   | Hierarchy / acyclic parent pointers                             |
| folder_admins | user_id + folder_id + granted_by                                |

**`folders.color_hex`**: system-assigned on creation from the 20-color tag palette (same palette as `tags.color_hex`, same cycling logic). Stored as a 7-char hex string. User can override in edit mode. Never null — always has a value from the moment of creation.

### 4.4 Tag Tables

| Table            | Purpose                                                                  |
|------------------|--------------------------------------------------------------------------|
| tags             | id, color_hex (unique per tag, auto-assigned or user-set), created_at    |
| tag_translations | id, tag_id, language_code, label, created_at — UNIQUE(tag_id, language_code) |
| tag_edges        | node_id OR folder_id + tag_id (organizational only)                      |

> **Removed from v20:** `tags.name` (string-based) is removed. Tags are now concept-only objects; all display labels live in `tag_translations`.

> **Tag filtering** is strictly by `tag_id`. Language-independent. Search includes `tag_translations.label` for the current user's `language_code`.

### 4.5 Translation Table

| Table        | Purpose                                                         |
|--------------|-----------------------------------------------------------------|
| translations | id, node_id, language_code, title, description, created_at — UNIQUE(node_id, language_code) |

No runtime translation. All translated content is pre-stored. Fallback chain is deterministic (see §33).

### 4.6 Import Tables

| Table              | Purpose                         |
|--------------------|---------------------------------|
| external_sources   | Registered import origins       |
| external_items_map | Deduplication via external_id   |

### 4.7 System Tables

| Table         | Purpose                                                   |
|---------------|-----------------------------------------------------------|
| notifications | Async notifications (non-blocking)                        |
| activity_log  | Append-only: shares, unshares, imports, ratings, profile changes |

### 4.8 Chat Tables (deferred — last phase)

direct_chats, messages, group_messages, node_messages.

### 4.9 Initial Seed Data (on first deploy)

- 20 realistic nodes with scraped metadata
- 12 demo user accounts
- 4 demo groups
- 8–10 demo folders
- Tags with distinct colors pre-assigned and English labels in `tag_translations`

---

## 5. VISIBILITY MODEL (FINAL)

A node is visible to a user IFF:

```
node.deleted_at IS NULL
AND
(
  user IS owner
  OR at least one active edge exists:
     SELECT 1 FROM edges e
     JOIN causes c ON e.cause_id = c.id
     WHERE e.node_id = $node_id
       AND e.user_id = $user_id
)
AND
NOT blocked(current_user, owner)
```

Strict rules: edges only, no implicit visibility, no JOIN-based visibility at read time, no path checks, no recomputation.

> **An active edge** is any edge row in the `edges` table whose `cause_id` references an existing cause. Cause deletion cascades to edge deletion; there is no `deleted_at` on edges.

---

## 6. WRITE SYSTEM

All writes MUST run in ONE atomic transaction with rollback on failure.

### 6.1 Edge Model (v21 — Causal)

```
edges.cause_id → causes.id (NOT NULL, ON DELETE CASCADE)
NO UNIQUE (node_id, user_id)
Multiple edges per (node, user) are required and expected.
```

Each edge is owned by exactly one cause. Cause deletion is the sole mechanism for edge removal. No fallback checks; no path analysis.

### 6.2 Direct Share → INSERT cause + INSERT edge(s)

1. INSERT `causes` row: `cause_type = 'direct_share'`, `created_by = sharer_id`, `metadata = {node_id, target_user_id}`
2. INSERT `edges` row: `node_id`, `user_id = target`, `cause_id`, `sender_id = sharer`, `direction = 'received'`, `depth = parent_depth + 1`
3. INSERT reciprocal `edges` row for sender: `direction = 'sent'`

> Not idempotent by design. Each share action produces a distinct cause + edges. Sharing the same node to the same user twice = two causes = two edge sets. Both are valid and independent.

### 6.3 Group Share

1. INSERT `causes` row: `cause_type = 'group_share'`, `metadata = {node_id, group_id}`
2. INSERT `group_nodes` row
3. For each group member → INSERT `edges` row (node → user, cause_id = above)

### 6.4 Group Unshare

1. DELETE `group_nodes`
2. DELETE `causes` row (type = `group_share`, node_id + group_id match)
   → All edges created by this cause are cascade-deleted automatically
3. **No path checks. No fallback logic.**

### 6.5 Folder System

- Folders are acyclic trees; unlimited depth; cycles forbidden
- A node can exist in multiple folders

**Share Folder (one transaction):**

1. Resolve full subtree
2. Resolve all nodes in subtree
3. Resolve all target users (direct + group expansion)
4. For each `(node, user)` pair:
   - INSERT `causes` row: `cause_type = 'direct_share'`, `metadata = {node_id, user_id, folder_id, folder_share_op_id}`
   - INSERT `edges` rows (sent + received)
5. All causes from this operation share a common `metadata.folder_share_op_id` (UUID) for grouped revocation

**Unshare Folder (one transaction):**

1. DELETE all `causes` where `metadata.folder_share_op_id = $op_id`
   → All associated edges cascade-deleted automatically
2. **No path checks. No "other paths remaining" analysis. Deterministic.**

> **Note:** If a node was independently shared to the same user via another cause (direct_share, group_share), those edges are unaffected. Each cause is independent.

### 6.6 Tags — organizational only, no edge side-effects

### 6.7 Ratings — UPSERT, MUST update `nodes_sort_cache.avg_rating` in SAME transaction

### 6.8 Import System

1. INSERT `causes` row: `cause_type = 'import'`, `created_by = importer_id`
2. INSERT `nodes` row with `origin_user_id = importer_id`, `origin_created_at = now()`
3. INSERT `edges` row: `depth = 0`, `cause_id = above`
4. Idempotent: replay-safe via `external_items_map` dedup; defaults to private

### 6.9 Trash / Soft Delete

- Deleting a node sets `node.deleted_at` (soft delete)
- Node becomes invisible to all users (visibility model checks `deleted_at IS NULL`)
- **Edges and causes are NOT removed on soft delete** — restoring a node restores visibility for all users with existing edges
- Folders and groups are also soft-deleted via `deleted_at`
- A dedicated **Trash view** lists all soft-deleted items owned by the current user
- User can **restore** any trashed item (clears `deleted_at`)
- User can **permanently delete** (hard delete) from Trash only

### 6.10 Auto-Create on Drag (name prompt)

When a drag-and-drop action triggers auto-creation of a folder or group:

1. Optimistically show a "New folder" / "New group" placeholder in the relevant bar immediately
2. **Prompt user for a name** (inline rename input, auto-focused) **with explicit cancel option** (Escape or tap outside)
3. On confirm (Enter or blur): persist with the given name
4. On cancel: discard and remove placeholder
5. New item appears in the corresponding bar immediately after naming

---

## 7. FEED SYSTEM

**Properties:** single entry point, no duplicates, deterministic ordering, cursor-based pagination.

**Pipeline:**

```
nodes → visibility → context → block filter → cursor → ordering → dedup → limit
```

### 7.1 Feed View Toggle (3 states)

| State        | Description                                                        |
|--------------|--------------------------------------------------------------------|
| **All**      | Default — all visible nodes for current user                        |
| **Received** | Nodes where `edge.sender_id ≠ current_user`                        |
| **Sent**     | Nodes owned by current user with at least one active outbound edge |

These three states replace the previous two-state "I received / I sent/shared" toggle. **All** is the default on app load.

### 7.2 Sort Options

- Newest (default)
- Oldest
- Rating (highest rated first; unrated cards last)
- Most Shared
- **Custom** (automatically selected when user manually reorders via drag)

---

## 8. CONTEXT SYSTEM

Exactly ONE active context at a time. Multiple selection is handled at the filter layer (§16), not the context layer.

| Context  | Description                                       |
|----------|---------------------------------------------------|
| personal | Nodes owned by current user                       |
| shared   | All nodes shared to current user                  |
| friend   | Nodes shared with a specific friend               |
| group    | Nodes shared within a specific group              |
| folder   | Nodes organized in a specific folder              |

Rules: context filters only, MUST NOT create visibility, MUST NOT expand dataset.

**Click friend (friend context):** Returns all nodes with at least one active edge to that friend — edges already created by prior share/folder-share writes. No folder join at read time. Folders bar switches to show **ONLY** folders shared with that specific friend.

> ⚠️ **RESOLUTION — Inconsistency #3:** UIX PRD v2 implied a folder-aware query on friend click. FULL PRD mechanism is edge-only at read time.

---

## 9. FRIEND SYSTEM

- Friendship = two reciprocal active edges (from distinct causes)
- No separate `friends` table
- Used for context filtering and Friends bar display

> ⚠️ **RESOLUTION — Inconsistency #2:** UIX PRD v2 specified a dedicated `Friends` table. FULL PRD v18 wins — friendships are reciprocal edge pairs.

### 9.1 Model

- No separate `friends` table.
- A `friend_invites` table tracks all outgoing invitations (see §9.2).
- A user appears in your Friends bar the moment you invite them — no confirmation required. This is intentional (WhatsApp model, not LinkedIn model).
- Friendship is considered active as soon as one party has invited the other. It does NOT require reciprocal acceptance.
- Block (§10) overrides all friendship visibility regardless of invite state.

### 9.2 friend_invites Table

| Field        | Type                                      |
|--------------|-------------------------------------------|
| id           | uuid PK                                   |
| from_user_id | uuid references users(id) NOT NULL        |
| to_email     | text NOT NULL                             |
| to_user_id   | uuid references users(id) DEFAULT NULL    |
| created_at   | timestamptz DEFAULT now()                 |

- `to_user_id` is NULL when the invitee has not yet signed up.
- On signup: scan `friend_invites` where `to_email` = new user's email → backfill `to_user_id` for all matching rows.
- Duplicate prevention: one active invite per (from_user_id, to_email) pair. Subsequent attempts are silently ignored.
- No status field. An invite is permanent until a block is placed.

### 9.3 Who Appears in the Friends Bar

A user X appears in current user A's Friends bar if ANY of these is true:
  - A has a friend_invites row where from_user_id = A and to_user_id = X (A invited X)
  - A friend_invites row exists where from_user_id = X and to_user_id = A (X invited A)

This means: invite anyone → they appear in your bar immediately, even before they accept or log in (shown as "Pending" state with a dimmed avatar). Once they sign up and the to_user_id backfill runs, their avatar activates.

### 9.4 Pending State (UI)

- Pending friends (to_user_id IS NULL): shown in Friends bar with dimmed avatar + clock icon overlay + tooltip "Invite sent".
- They cannot be used for sharing or context filter until active.
- Once they sign up, their avatar activates with no user action required (real-time or on next load).

### 9.5 Removing a Friend

- Deleting a friend_invites row removes them from the bar.
- If a block is placed (§10), the invite row is soft-hidden but not deleted (for audit), and the blocked user disappears from all bars and filters.

---

## 10. BLOCK SYSTEM

Symmetric exclusion; overrides all visibility; stored in `blocks`.

---

## 11. UI SYSTEM

### 11.1 Top Bar (revised — v27.2)

Always visible. Exactly 1 permanent row.

| Position | Element | Behavior |
|---|---|---|
| Left | Logo `liked.` | Tap: clear all filters, return to root All feed |
| Right of logo | Tags icon-btn | Tap: toggle Tags Strip (§11.3f) visibility. Badge shows count of active tag filters when ≥1 tag active. Icon: `tag` (feather). |
| Right | Search icon-btn | Tap: open Search sheet (§9 — P9). Icon: `search` (feather). |
| Right | Bell icon-btn | Notification badge. |
| Far right | Profile avatar | Tap: open Profile modal (§11.7). |

The Sliders icon is **removed**. The Filter Feed bottom sheet (§11.3e) is **removed**.

All tap targets minimum 44×44 px.

#### Sort / View Row

Sits between the feed filter tabs and the feed content. Always visible on the Home and Folder screens.

| Element | Detail |
|---|---|
| Sort button | Shows current sort label. Tap → inline dropdown: Newest / Oldest / Rating / Most Shared / Custom |
| View mode icons | 5 flat icons: Icon Grid · Masonry · List · Horizontal Rows · Infinite Canvas. Active icon highlighted amber. |

### 11.2 Five View Modes (unchanged from v25.0 §11.2)

Users can switch between these five layouts at any time via the top bar view toggle. Selection persists per user in preferences.

#### A. Masonry Grid (desktop default)

- Pinterest-style variable-height cards
- Auto-column count based on screen width

#### B. Icon Grid (mobile default)

- Column count is user-adjustable via a zoom pill in the utility bar: − icon · N col label · + icon
- Range: 2 to 6 columns. Default: 2 columns
- Preference persisted to localStorage (key: 'liked.zoom')
- The zoom pill is only visible when the col/icon grid view is active
- Large rounded square thumbnails with title below

#### C. List View

- Full-width rows, one card per row
- Thumbnail left, title + metadata right
- Compact density

#### D. Horizontal Row-Based Layout (Netflix style)

- Multiple rows, each row is a horizontally scrollable strip
- Each row is labeled by context: e.g., "Shared with me", "By folder name", "Tagged: music"
- Cards within a row scroll horizontally; rows scroll vertically
- Row grouping logic: by folder, by tag, by sender, by recency bucket

#### E. Free View (grid-snap resize)

- Cards are arranged in a CSS grid with `grid-auto-flow: dense`
- Each card can be resized by dragging a resize handle at its bottom-right corner
- Resizing snaps to grid units; enlarged cards span multiple columns/rows
- Other cards reflow automatically via CSS grid dense packing
- Card sizes are persisted per scope in `sizes[scopeKey][cardId] = {w, h}` (column span, row span)
- This is NOT free absolute positioning — all cards remain in grid flow
- Pan and pinch-to-zoom are removed

### 11.2a Feed Filter Tabs (3 states — revised)

Three tabs sit directly below the top bar. **"Sent" tab is removed.**

| Tab | Color | What it shows |
|---|---|---|
| **All** | `--color-all` (neutral grey) | Everything visible to the user — own cards + received |
| **Mine** | `--color-mine` = `--color-accent` (amber) | Cards where `origin_user_id = current_user`. Includes shared-out and unshared. "Sent" is a subset of Mine, not a separate tab. |
| **Received** | `--color-received` (blue) | Cards where `edges.direction = 'received'` |

> **"Sent" as a feed filter is retired.** To see only cards shared with a specific person: select Mine tab + tap that friend in the Friends Strip.

When the Mine tab is active, a secondary sub-filter row appears immediately below the feed tabs:
- **All Mine** (default, selected): shows all cards where origin_user_id = current_user
- **Not shared**: subset where sentTo is empty (no active outbound edges from this node)
- **Shared**: subset where at least one active outbound edge exists

Sub-filter stored in local UI state, not persisted. Resets to 'All Mine' on tab switch.

### 11.3 Floating Action Button (FAB — Speed-Dial)

The FAB is a floating amber circle. Visual and positional spec unchanged (44×44 px minimum, amber, drop shadow, bg2 ring, horizontally centered 20 px above the Friends & Groups Strip handle on mobile, fixed bottom-right on desktop).

**First tap:** The `+` icon rotates 45° to `×` (200ms ease). Four action buttons fan out in a **radial arc** above the FAB, positioned at equal angular spacing across a 160° arc (left to right: Tag · Card · Folder · Template). Each button is placed at radius ~80 px from the FAB center using fixed offsets. A frosted dark background (rounded pill, `rgba(20,20,30,.72)` with `backdrop-filter: blur(14px)`) sits behind the arc to ensure legibility over any feed content. Each button is a smaller circle (36 px), labeled with short text below. A semi-transparent scrim covers the feed (not the bars). Tapping the scrim or the FAB `×` collapses the speed-dial.

**Speed-dial actions (bottom to top order):**

| Position | Icon | Label | Action |
|---|---|---|---|
| 1 (closest to FAB) | `tag` | Tag | Enters Tag Mode (§11.3b) |
| 2 | `credit-card` | Card | Opens Add Card bottom sheet (§11.3c) |
| 3 | `folder-plus` | Folder | Opens New Folder sheet: name input + color swatch row (7 colors from system palette) + Save button |
| 4 (farthest) | `layout-template` | Template | Opens Template Picker sheet (§11.3d) |

**Desktop:** buttons fan out in the same radial arc pattern upward-left from the bottom-right FAB position.

**Phase sequencing:** Folder action requires P4 completion. Tag Mode requires P6 completion. Template action requires P4 completion. Until a dependency phase is complete, tapping that action shows a "Coming soon" toast. Buttons are never hidden or visually disabled — they always render.

### 11.3b Tag Mode

Entered via the Tag speed-dial button. Speed-dial collapses on entry.

1. A **floating Tag Pill** appears anchored at FAB position: colored chip showing tag name + `×` dismiss button on right. Shows "Pick a tag" if no tag selected yet.
2. A **half-height Tag Sheet** slides up simultaneously: header "Tag Mode — tap cards to apply", search input, scrollable list of all user tags as colored chips, "＋ New tag" input at bottom.
3. User taps a tag chip in the sheet → sheet collapses, Tag Pill updates to selected tag name + color.
4. Feed is fully interactive behind the pill. User taps any card or folder → tag assigned instantly via `addTagToNode()` / `addTagToFolder()`. Card/folder flashes a 150 ms accent ring as confirmation. Card tap does NOT open card detail while Tag Mode is active.
5. Tapping `×` on the Tag Pill exits Tag Mode. Feed returns to normal tap behavior.
6. Tag Mode is mutually exclusive with multi-select mode. If multi-select is active, Tag Mode cannot be entered.

### 11.3c Add Card Bottom Sheet

Triggered by tapping the FAB.

Two separate input fields (not auto-detect):
1. **URL input field**: placeholder 'Paste or type URL…'. When a URL is entered and focus leaves the field (or after 600ms debounce), fetch OG metadata and show preview card (thumbnail + title + domain) below the field.
2. **Note/text textarea**: placeholder 'Add a note (optional)'. Grows with content up to 40% of sheet height.

Below the inputs: **TAG section** — chip row, single-select, all available tags shown. Selected tag highlighted with accent outline.

Below tags: **SHARE WITH (OPTIONAL) section** — 5-column grid of friend avatars (circles) and group avatars (rounded squares). Tap to select (accent outline + checkmark badge).

Save button: full-width amber button at bottom.

### 11.3d Template Picker Sheet

Header: "Choose a template". Scrollable list of preset templates — each row: icon + name + one-line description. Name input below list, placeholder "Name it… (optional)". "Add to workspace" button full-width amber at bottom.

On confirm: if name input is non-empty, use that name; else use the template's own name. Creates the folder/card structure atomically.

Preset templates (v1):
- "Read Later" — single folder
- "Watch List" — single folder
- "Trip Planner" — folder with 3 sub-folders: Before / During / After
- "Book Notes" — single folder

### 11.3e Filter Feed Bottom Sheet — REMOVED (v27.2)

This sheet is removed. Sort is accessible via the Sort button in the Sort/View row. Friends filtering is via the Friends & Groups strip (§11.4). Tag filtering is via the Tags Strip (§11.3f). Folder navigation is via breadcrumb and drag panel.

### 11.3f Tags Strip

A collapsible horizontal strip that appears **between the top bar and the feed filter tabs** when active. Hidden by default (zero height, no chrome).

**Trigger:** Tap the Tags icon-btn in the top bar. Strip slides down (200ms ease). Tap again or tap `×` on any active tag pill in the context strip to collapse.

**Content (top to bottom inside the strip):**

1. **Search input row** — full-width, `placeholder="Search tags…"`, with a `×` clear button. Filters the tag chips in real time as user types. Auto-focused when strip opens.
2. **Tag chips row** — horizontally scrollable. Each chip: colored rounded pill showing tag label. Tap to toggle-select (accent outline + checkmark). Multi-select allowed (AND logic). Selected chips are pinned to the left of the row so they remain visible during scroll.

**Data scope (non-negotiable):**
Tags shown are **only tags that exist on nodes currently visible to the current user** — i.e. nodes reachable via `edges WHERE user_id = current_user AND deleted_at IS NULL`. This requires a dedicated DB function `getVisibleTags(userId, languageCode)`:

```sql
SELECT DISTINCT t.id, t.color_hex, tt.label
FROM tag_edges te
JOIN tags t ON t.id = te.tag_id
JOIN tag_translations tt ON tt.tag_id = t.id AND tt.language_code = $languageCode
JOIN nodes n ON n.id = te.node_id
JOIN edges e ON e.node_id = n.id AND e.user_id = $userId
WHERE n.deleted_at IS NULL
ORDER BY tt.label ASC
```

Global tag list (`getAllTags()`) is never used for this surface.

**Interactions:**

| Action | Result |
|---|---|
| Tap tag chip | Toggle-select. Feed filters immediately (no Apply button). Active tag chip moves to left of row. Context strip pill appears with `×`. |
| Tap `×` on context strip pill | Removes that tag filter. If 0 tags active and strip was opened by Tags icon, strip collapses automatically. |
| Search input | Filters visible chips in real time. Selected chips remain visible regardless of search. |
| Clear search (`×` in input) | Resets chip list to full visible set. |
| Tap Tags icon again | Collapses strip. Active tag filters remain applied. |

**State:** Strip open/closed state stored in local UI state only. Not persisted. Resets to closed on page reload.

**Desktop:** Tags strip appears below the top bar in the same position. Same behavior.

### 11.3g Context Strip

The context strip is a **conditional** horizontal strip of active-filter pills. It appears **only when ≥1 filter is active**. It is hidden by default (zero chrome when unfiltered).

- Lives between the feed filter tabs and the sort/view row.
- Each pill shows the filter label (friend name with mini avatar, tag name, folder name) and an `×` icon.
- Tapping `×` on a pill removes that filter immediately; feed re-queries in real time.
- A **"Clear all"** pill appears at the end when ≥2 filters active.

### 11.4 Friends & Groups Strip (3-state model)

The strip has three states. State is persisted to `localStorage` key `liked.friendsStripState` with values `hidden` | `strip` | `expanded`. Default value: `strip`.

#### State 1 — Hidden

Strip avatars are not visible. Only a minimal handle sits at the very bottom of the screen (above system home indicator safe area):
- 36 px × 3 px pill bar (`--text-3`, 35% opacity)
- Chevron-up icon (14 px, `--text-3`)
- Label: `Friends (N) & Groups (N)` (9 px, uppercase, letter-spacing 0.12em, `--text-3`). N = live counts of friends and groups respectively.
- Total handle height: 28 px.
- FAB floats 20 px above this handle in hidden state.

#### State 2 — Strip (default)

Full avatar row visible. "Me" avatar pinned first (sticky left, never scrolls). Friends as circles. Groups as rounded squares (border-radius ~10 px). Group chip contains group initial letter + member micro-avatar stack (up to 3, 8 px, 1 px border, bottom-right). Overflow: "+N" badge. Friend/group name shown below avatar (max 6 chars, truncated, 9 px). No label row.

- **New-activity ring**: amber 2 px outline + amber dot (bottom-right of avatar) when that friend shared something new since user last viewed.
- **Active filter ring**: blue 2.5 px outline when that friend/group is an active feed filter.

Handle sits above the strip showing `Friends (N) & Groups (N)` label + chevron-up. FAB floats 20 px above the handle.

#### State 3 — Expanded Panel

Full-height bottom sheet. All existing §11.4a behavior applies unchanged. See §11.4a.

#### State Transitions

| Gesture | From → To |
|---|---|
| Swipe down on strip or handle (velocity > 40 px) | Strip → Hidden |
| Swipe up on handle (> 40 px) or tap handle | Hidden → Strip |
| Swipe up on strip (> 40 px) or tap chevron handle | Strip → Expanded Panel |
| Swipe down on panel or tap `×` | Expanded Panel → Strip |

#### Interactions (Strip state)

| Gesture | Result |
|---|---|
| Single tap friend/group | Apply as feed filter. Context strip pill appears. Blue ring on avatar. |
| Tap again (or tap × in context strip) | Remove filter |
| Long press | Options popover: View feed · Share card to · Remove friend · Block |

### 11.4a Friends Panel (full-height, on demand)

Triggered by tapping the chevron expand handle above the strip, or by initiating a drag (§12).

**Uses:**
1. Browse friends & groups with activity timestamps
2. Filter feed (multi-select)
3. Organise groups (add/remove members)
4. Share panel during drag (§12)

**Layout (top to bottom):**

1. Drag handle (pill) at top center
2. Header row: title ("Friends & Groups") · `+ Invite` chip · Close `×` button
3. Search bar: searches friend display names and group names
4. **Friends** section label + results list:
   - Each row: avatar · name · "Shared N cards · Xh ago" · new-activity dot
   - Tap row = toggle-select for filter or share
5. **Groups** section label (below friends):
   - Each row: rounded-square avatar · group name · member count
   - Tap row = toggle-select; tap `›` = open group editor (§11.4b)
6. Confirm button (amber, full width): "Apply filter" or "Share with N" depending on context

**Search behavior:** Results filter instantly. Already-selected friends/groups are always pinned to top of results regardless of query — selections are never hidden by a search.

#### Group Management via Drag-Drop (Expanded Panel)

- Groups section displays group chips as large rounded-square tiles (48 px) in a 5-per-row grid.
- Friend avatars are draggable within the panel. Dragging a friend avatar onto a group chip → calls `addMemberToGroup()`. Group chip highlights with accent ring on drag-hover.
- Long-pressing a group chip enters inline group detail. Dragging a member avatar out of the group → calls `removeMemberFromGroup()`. Confirmation toast with 5 s Undo.
- Group chips are reorderable via drag within the groups grid. Order persisted to `localStorage` key `liked.groupOrder`.
- Long-pressing a group chip (outside inline detail mode) → popover with "Delete group" (destructive, red) + Cancel. Requires confirmation.
- The `›` Group Editor (§11.4b) remains accessible and unchanged for non-drag management.

### 11.4b Group Editor

Opened from the Friends Panel by tapping `›` on a group row, or from the group chip long-press menu.

- Header: group name (editable inline) + Close
- **Members section**: current member avatars with `−` remove button on each
- **Add from friends**: list of all friends not yet in group, each with `+` add button
- Greyed-out rows for members already in the group (with "already in" label)
- **Save group** button at bottom

> Group editor replaces the "double-tap group chip" pattern from v25. The Friends Panel is the single entry point.

### 11.5 Folders Bar — REMOVED

The dedicated Folders Bar (v25 §11.5) is **removed entirely**.

Folders are accessed via:
1. ~~Filter Feed sheet~~ — removed v27.2
2. **Breadcrumb** when inside a folder
3. **Drag panel** folder section during card drag
4. **Long press card → Move to folder**

There is no persistent folder bar on mobile.

### 11.5a Folder View Header

When a folder is open (user has navigated into a folder), the standard top bar (liked. + tags + search + bell + avatar) is replaced by a folder-specific header:
- Left: folder color dot (12px, rounded 3px) + folder name in Fraunces serif (large, --text-1)
- Right: grid-view icon-btn + list-view icon-btn + tags icon-btn (toggles Tags Strip in folder context)

Below the folder header: breadcrumb row — back chevron icon-btn + path text (e.g. 'Feed › Favorites'). Tapping back chevron navigates up one level. Tapping any segment navigates directly to that level.

The friends strip and FAB remain visible when inside a folder. Only the top bar changes.

### 11.6 "Me" Avatar

The "Me" avatar in the Friends Strip (pinned first, left) is the personal feed entry point:
- Tap: clear all filters, return to root All feed
- Does **not** open Profile modal (that is the top-right avatar)
- Shows online indicator dot (green, bottom-right)

### 11.7 Profile Modal (unchanged from v25 §11.7)

Triggered by the **top-right profile avatar** (not "Me" in the strip).

- User avatar + display_name
- Light / Dark theme toggle (persisted to `localStorage`)
- Log out → `supabase.auth.signOut()` + redirect to `/login`
- Username change (rate-limited: 1 per 24h)
- Avatar change (rate-limited: 5 per day)

### 11.8 Breadcrumb Navigation (revised)

Shown **only when inside a folder** (depth ≥ 1). Hidden at root feed.

- Placement: between top bar and sort/view row.
- Format: `← [Back button]   Feed  ›  FolderName  ›  SubfolderName`
- Back button (←): returns to parent folder, or to root if at top-level folder. 26×22 px, `bg3`, rounded 7 px.
- Each path segment is tappable (jumps directly to that depth).
- **Folder name replaces logo in top bar** when inside a folder. The folder's color dot (7×7 px, rounded square) appears left of the name. Folder options `⋯` button replaces the sliders icon in top bar when inside a folder.
- Breadcrumb never wraps; truncates middle segments with `…` if path is too long.

---

## 12. DRAG-AND-DROP CONTRACT

All drags persisted to DB with smooth Tailwind animations (200 ms). Mobile: proper touch events, no browser context menu on long-press.

**Drag Physics (non-negotiable):**  
A dragged item must behave like a lifted physical object: it scales up slightly (~1.05×), gains elevation (drop shadow increases significantly), and offsets from the pointer/finger so the item remains fully visible and never obscured by the hand or cursor. Offset direction: **upward ~80 px on mobile** (so the thumb does not cover the card), **slight diagonal offset (8 px right, −8 px up) on desktop**. Transition from resting to lifted state must complete in ≤ 100 ms. This applies to all draggable types: cards, friend avatars, folder chips, group chips, tag chips. Implemented via CSS `transform: scale(1.05)` + elevated `box-shadow` on `dragstart` / `touchstart`.

| Drag action                         | Result |
|-------------------------------------|--------|
| Node → Friend / Group               | Share |
| Node → Folder                       | Add to folder |
| Node → Tag chip                     | Add tag |
| Tag chip dragged off                | Remove tag |
| Friend avatar ↔ Folder              | Bidirectional folder share |
| Card → Card                         | Auto-create Folder → immediate inline name prompt **with cancel option** (Escape or outside tap) |
| Friend avatar → Friend avatar       | Auto-create Group → immediate inline name prompt **with cancel option** |
| Drag-to-Remove                      | Visible semi-transparent "Remove from …" zone appears on drag start for current group/folder |
| Friend avatar → Group chip          | Add friend to group |
| Group chip → Friend avatar          | Add friend to group |
| Card / Friend / Group dragged onto Trash icon | Instant soft delete |

**Additional rules:**
- Drag-pause over collapsed bar → auto-expand.
- All new drop targets (group chip, folder chip, etc.) supported.
- Drag-and-drop reordering of cards inside the feed (any view mode) automatically switches Sort dropdown to **Custom** and persists order per user + context.

**Additions and overrides from UIX Amendment v26.0 (all v25 drag rules remain):**

### 12.1 Mobile Drag-to-Share / Move — Panel Pattern

When a card drag is initiated on mobile (hold ~400 ms → haptic → lift):

1. FAB + Friends Strip animate **out** (slide down, ~200 ms ease-out).
2. **Drag Panel** slides up from the bottom in their place. The panel is a full-width surface with two tab sections:

**Tab A — Share with (friends & groups):**
- Search bar at top
- Friends grid (5-per-row circles)
- Groups grid (5-per-row rounded squares) below separator
- Tap avatar to toggle-select (amber border + checkmark badge)
- Already-selected items are pinned at top of results during search — never hidden by query
- Confirm button: **"Share with N →"** (amber). Disabled / greyed when 0 selected.

**Tab B — Move to folder:**
- Search bar at top
- Folder grid (4-per-row collage thumbnail tiles — see §13.2)
- Tap tile to toggle-select (amber border + checkmark badge)
- Search results show sub-folders indented (↳ prefix) under their parent
- **"All… →"** tile at end: opens full Folder Tree Picker sheet (§12.2) without cancelling drag
- Confirm button: **"Move to [FolderName] →"** (amber). Disabled when 0 selected.

Both tabs visible simultaneously if screen height allows; else swipe between them. **Actions are not mutually exclusive** — user can share AND move to folder before confirming.

**Release / cancel:**
- Confirming via button: executes actions, panel slides out, FAB + strip return.
- Releasing card outside any target: cancel. Card returns to original position.
- Toast + 5s undo after every successful drop action.

### 12.2 Folder Tree Picker

A dedicated full-height sheet for deep folder navigation.

- Triggered by "All…" in drag panel, or long press card → Move to folder.
- Shows full folder hierarchy, indented by depth (2-space indent per level).
- Search bar at top (searches all folder names at all depths).
- Currently active folder highlighted.
- Tap any folder row to select destination.
- Confirm + Cancel buttons at bottom.
- Does not cancel an in-progress drag — it resolves the drop target.

### 12.3 Desktop Drag (unchanged from v25, additions)

On desktop, the sidebar is always visible. Drag targets:
- Friend rows in sidebar → share
- Group rows in sidebar → share to group
- Folder rows in sidebar → move to folder
- Folder rows support nested drop (hover to expand sub-folders)

Drag panel (§12.1) does not appear on desktop — sidebar serves this purpose.

---

## 13. CARD DESIGN

### 13.1 Card Anatomy (revised)

Every card in the feed displays:

| Element | Position | Detail |
|---|---|---|
| Thumbnail | Full card background | Fills card area. Grey placeholder if no image. |
| Direction badge | Bottom-right | Circle, 9–10 px. **Blue** = received (`--color-received`). **Amber** = mine (`--color-mine`). |
| Sent indicator | Top-left | Small purple rounded square (9×9 px) visible **only** on cards where current user has shared this card to ≥1 person. Color: `--color-sent` (`#a78bfa`). Independent of direction badge. Both can appear simultaneously. |
| Average rating | Top-left of meta row (below image) | Numeric (e.g. "8.5 ★"). Sourced from `nodes_sort_cache.avg_rating`. |
| Title | Meta area | 2-line truncation. User's `language_code` translation if available. |
| Tag chips | Meta area | Single-line, scrollable. Each chip in its `color_hex`. |
| Sender avatar | Meta area bottom-left | Avatar of friend who shared it (if received). Initials fallback. |

#### Card Interactions

| Gesture | Result |
|---|---|
| Tap | Open Card Detail bottom sheet |
| Long press (~400 ms) | Context menu (bottom sheet mobile, popover desktop): Share · Move to folder · Add tags · Trash |
| Swipe left (mobile, list view) | Reveal quick actions: Share · Trash |
| Drag (hold + move) | Initiates drag-to-share / move (§12.1) |
| Long press + tap others | Multi-select mode; action bar: Share all · Move all · Trash all |

### 13.2 Folder Tile Anatomy (revised)

Folder tiles in the feed grid are **visually identical in size to card tiles**. They appear before card tiles in a folder context (sub-folders first).

| Element | Detail |
|---|---|
| 2×2 thumbnail collage | Four card thumbnails from the folder's most recent cards, displayed in a 2×2 grid with 1 px gap. If fewer than 4 cards: fill remaining quarters with `--color-bg-3`. |
| Color dot | 7×7 px rounded square, top-left of tile. Shows `folders.color_hex`. |
| Folder name | Overlay at bottom of tile. White text, gradient scrim behind. 8 px bold, truncated. |
| Access avatars | **Removed from tile face.** Visible in Card Detail / folder detail only. |
| Average rating | **Removed from tile face.** Visible in folder detail only. |

**In drag panel and filter sheet**, folder tiles follow the same collage pattern at smaller size (48×40 px).

---

## 14. CARD DETAIL (revised)

Triggered by single tap on any card. Opens as a **bottom sheet** on mobile, not a full modal navigation push. Feed position is preserved on dismiss.

### 14.1 Mobile Layout (bottom sheet)

**Media section (top, fixed height ~170 px):**

- For YouTube URLs: embedded YouTube player chrome.
  - Video thumbnail with centered red play button circle.
  - Progress bar at bottom of media area.
  - Play/pause icon + title + timestamp (current / total).
  - **Fullscreen button**: top-right of media area, 28×28 px, `rgba(0,0,0,0.5)` background, rounded 7 px. Opens native full-screen player.
  - Drag handle (pill) top-center for swipe-to-dismiss.
- For other URLs: OG thumbnail image with "Open externally" overlay.
- For text cards: no media section; sheet starts with title text.

**Detail section (scrollable below media):**

1. **Open externally** — primary CTA. Full-width button, `--color-received` (blue) background, `↗` icon + label "Open in [platform]" (e.g., "Open in YouTube"). This is the **most prominent action** in the entire sheet.

2. **Meta pills row**: avg rating · view count · share count · direction badge (↓ Received / mine) · sent indicator (↑ Sent to N, purple) — shown only if card was shared out.

3. **Rating row**: "Your rating" label · slider (0–10, step 0.5, touch-friendly 44 px handle) · numeric value. Auto-saves on slide end.

4. **Tag chips**: small chips, scrollable row.

5. **Shared with** (if card was shared to others): section label + small avatar row (26 px circles) showing recipients.

6. **Action grid (2 actions only)**:
   - Share (share icon)
   - Trash (trash icon, red)
   - "Move to folder" and "Add to group" are accessed via **long press context menu**, not the card detail action grid.

**Sheet dismiss:** Swipe down to dismiss. Tap outside to dismiss. Feed scrolls back to the tapped card position.

**Sheet expand:** Swipe up to expand to near-full-screen (reveals full metadata including individual friend ratings and edit fields for owners).

### 14.2 Desktop Layout

Side panel (right ~320 px), persistent while a card is selected. Close button top-right. Same content order as mobile. "Open externally" is a large button at top.

---

## 15. MEDIA VIEWING & LINK PREVIEW

Triggered by clicking any card → opens Card Detail Modal (§14).

| URL type                        | Embed behavior                                 |
|---------------------------------|------------------------------------------------|
| YouTube (https://youtube.com)                         | Full embedded YouTube player                   |
| Suno (`suno.com/s/...`) (https://suno.com)         | Embedded Suno audio player                     |
| Spotify (track/playlist/album) (https://spotify.com)  | Embedded Spotify player                        |
| Any other URL                   | In-app iframe + "Open externally" fallback     |

Metadata (title, thumbnail, tags) auto-extracted on card creation via Supabase Edge Function (https://supabase.com/docs/guides/functions).

Playback state saved per user ("continue listening" on return).

### 15.1 Metadata & Auto-Tagging Edge Function Contract

**Trigger:**  
- Fired synchronously inside the **same atomic transaction** as node creation whenever a user pastes a URL **or** submits a text-only card via the floating + modal or drag-and-paste flow.  
- Edge Function name: `extract-node-metadata` (deployed via Supabase CLI or Dashboard).  
- Timeout: 10 seconds (configurable).  
- Invoked via Supabase client: `supabase.functions.invoke('extract-node-metadata', { body: { url, text_content, user_language_code } })`.

**Input payload:**
```ts
{
  url?: string,                    // null for pure text cards
  text_content?: string,           // null for URL cards
  user_language_code: string       // e.g. "en", "th", "fr"
}
```

**Output contract (JSON returned to the transaction):**
```ts
{
  title: string,                   // final title after fallback logic
  description?: string,
  thumbnail_key?: string,          // uploaded to Supabase Storage by the function
  language_code: string,           // detected or user_language_code
  suggested_tags: string[],        // array of raw label strings (max 8)
  og_data?: {                      // raw Open Graph / meta for audit
    og_title?: string,
    og_description?: string,
    og_image?: string,
    og_type?: string
  }
}
```

**Exact extraction & auto-tagging logic (deterministic, no runtime AI in read path):**

1. **URL cards (url provided)**  
   a. Fetch the page with `fetch(url, { headers: { "User-Agent": "LIKED-Bot/1.0" } })`.  
   b. Parse HTML for:  
      - Open Graph tags first (preferred): `og:title`, `og:description`, `og:image`, `og:type` (https://ogp.me/).  
      - Fallback to standard `<title>`, `<meta name="description">`, `<meta property="twitter:...">`, and `<link rel="icon">`.  
   c. **Auto-tagging rules** (applied only to URL cards):  
      - Extract up to 8 candidate tags from:  
        • `og:type` / `og:video:tag` / `og:article:tag`  
        • URL path + domain keywords (e.g., `/music/` → “music”, `youtube.com/watch` → “video”)  
        • Title + description: split on common separators, lowercase, NFKC normalize, remove stop-words (English + user_language_code).  
      - Remove duplicates and empty strings.  
      - Return the list as `suggested_tags`.

2. **Text-only cards (text_content provided, url = null)**  
   a. Use `text_content` directly as `title` (or first 120 chars if longer).  
   b. **Auto-tagging:** optional simple keyword extraction (same normalization as §19.3). No external fetch. If no meaningful keywords, return empty array.  
   c. `language_code` defaults to `user_language_code`.

3. **Common post-processing (both card types)**  
   - Upload any discovered image to Supabase Storage → return internal `thumbnail_key`.  
   - Set `language_code` = detected (from `og:locale` or HTML `lang`) or fallback to `user_language_code`.  
   - If any step fails (network error, invalid URL, timeout): return sensible defaults (`title = url or text_content`, `suggested_tags = []`, `thumbnail_key = null`).

4. **Error handling & guarantees**  
   - Function is idempotent and retry-safe.  
   - No side effects inside the Edge Function itself (all DB writes happen in the calling transaction).  
   - Logging: every invocation logged to `activity_log` with `action = 'metadata_extraction'`.  
   - Rate limit: 30 calls per user per minute (enforced at Supabase Edge Function level).  
   - Caching: optional 5-minute cache key on `url` (using Supabase KV or simple in-memory) to avoid hammering popular links.

**Flow after Edge Function returns (already defined in v22 §19.3 & §22):**  
Each string in `suggested_tags` is passed through the **exact deterministic tag creation process** (§19.3): normalize → lookup in `tag_translations` for user’s `language_code` → reuse or create new `tag_id` + color → INSERT `tag_edges`.

---

## 16. SELECTION, FILTERING, AND MULTI-FILTER

### 16.1 Single-Click Selection

- Clicking a **Friend avatar** = select that friend as an active filter (highlight state)
- Clicking again = **deselect** (toggle off)
- Clicking a **Folder chip** = select that folder as active filter
- Clicking again = deselect
- Clicking a **Tag chip** in the top bar = select tag filter (by tag_id, language-independent)
- Clicking again = deselect
- Clicking **"Me" avatar** = clear all filters and return to personal feed

### 16.2 Multi-Filter (AND logic)

- Multiple friends, folders, and/or tags can be selected simultaneously
- Feed shows content matching **all active selections** (intersection / AND)
- Example: Friend A selected + Folder X selected → show nodes shared with A AND in Folder X
- Active selections are visually highlighted (colored border / filled state)

### 16.3 Clear Filters Button

- Appears in the top bar **only when any filter is active** (friend, folder, tag, or feed view is not "All")
- Single tap clears ALL active filters and resets feed to "All" view
- Also accessible via clicking "Me" avatar

### 16.4 Folder / Group Selected State — Friends with Access

When a **folder or group is selected**:

- The Unified bar visually highlights (glows or marks) all friends who have access to that folder/group
- This is read from `causes` (folder_share_op_id metadata) / `group_members` — no edge scan required
- A new scrollable row of small access avatars appears directly above the bars with “View all” icon

---

## 17. LONG-PRESS / MULTI-SELECT MODE

Triggered by: long-press on any **card, folder, friend avatar, or group** (mobile and desktop).

### 17.1 Activation

- Selected item(s) enter **wobble animation** (CSS keyframe, subtle rotation ±2°)
- An **(×) close icon** appears on each selected item (iOS-style)
- Multi-select is allowed: subsequent taps add items to the selection set
- Long-pressing additional items adds them to selection without deactivating mode
- User can drag the whole multi-selection together

### 17.2 Actions While in Multi-Select Mode

A **context action menu** appears (**Bottom-sheet on mobile / Side drawer on desktop**) with:

| Action              | Applicable to              |
|---------------------|---------------------------|
| Edit (name/title)   | Single selection only      |
| Move to folder...   | Cards                      |
| Add to folder...    | Cards                      |
| Add to group...     | Cards, friends             |
| Share with...       | Cards                      |
| Remove tag          | Cards, folders             |
| Give admin rights   | Friends (in folder/group context) |
| Move to trash       | Cards, folders, groups     |
| Remove from folder  | Cards (if folder is active context) |
| Cancel              | Exits multi-select mode    |

### 17.3 Single (×) tap

- Tapping the (×) on a single item while in multi-select mode → **move that item to trash** (soft delete)
- Confirmation toast appears with **Undo** option (5-second window)

### 17.4 Exiting Multi-Select Mode

- Tap anywhere outside selection
- Tap Cancel in the action menu
- Press Escape (desktop)

---

## 18. RATING SYSTEM

### 18.1 Rating Model

- Each user rates each node independently: `ratings(node_id, user_id, score)`
- Score range: **0 to 10, step 0.5** (21 possible values)
- `nodes_sort_cache.avg_rating` = average of all friends' ratings for that node (updated in same transaction as any rating write)

### 18.2 Rating Entry Points

1. **On card face**: tap the displayed rating score → opens rating slider inline or in modal
2. **In Card Detail Modal**: tap the rating area → inline rating panel expands (§14)

### 18.3 Rating UI

**Rating input UI:** horizontal slider, range 0–10, step 0.5. Displays current value numerically (e.g. '7.5'). Default/unrated state = 0 (slider at leftmost position). A 'Clear' action resets to 0.

**Display on card tiles:** amber star icon + numeric value (e.g. ★ 7.5). Hidden when rating = 0.

**DB storage:** ratings table uses numeric(3,1). nodes_sort_cache.avg_rating uses numeric(3,1). Valid values: 0.0, 0.5, 1.0, 1.5 … 10.0.

**Sort by Rating:** ORDER BY nodes_sort_cache.avg_rating DESC NULLS LAST. Unrated nodes (avg_rating IS NULL or 0) appear last.

- **Your Rating**: pre-filled with existing score if already rated
- **Average Rating**: shown as read-only alongside your rating
- **Friend breakdown** (in modal only): list of friends who rated + their individual scores + avatars
- Auto-saves on slide end (UPSERT)

### 18.4 Display on Cards and Folders

- **Cards**: show `avg_rating` as e.g., "★ 7.5" on card face
- **Folders**: show aggregated avg_rating across all nodes in subtree

---

## 19. TAG SYSTEM (CANONICAL MULTILINGUAL)

Tags are concept-only objects (`tags` table has no `name` field). All display labels live in `tag_translations`.

**Deterministic creation process (§19.3):**

1. Normalize input label (lowercase, NFKC, trim)
2. Lookup in `tag_translations` for current user’s `language_code`
3. If not found → lookup English
4. If still not found → create new `tag_id` + auto-assign color from 20-color palette + insert translation

**Tag edges** are organizational only (no visibility impact).

---

## 20. TRASH SYSTEM

### 20.1 Trash View

Dedicated view (accessed via top-bar trash icon with badge count) lists all soft-deleted items owned by the current user. Shows: thumbnail/icon, name, date trashed.

### 20.2 Actions per item

- **Restore**: clears `deleted_at`, item returns to feed and bars
- **Delete permanently**: hard delete, irreversible, requires confirmation dialog

### 20.3 Soft Delete Behavior

- Soft-deleted nodes: invisible to all users (visibility check requires `deleted_at IS NULL`)
- **Causes and edges are NOT removed** on soft delete — restoring a node restores visibility for all users with existing edges via existing causes
- Soft-deleted folders: disappear from Folders bar but can be restored
- Soft-deleted groups: disappear from context but can be restored

---

## 21. ADMIN PERMISSIONS

### 21.1 Folder Admins

- Creator of a folder is the owner and has full admin rights
- Owner can grant **admin permissions** to any friend with access to the folder
- Stored in `folder_admins(folder_id, user_id, granted_by)`
- Admins can: rename folder, add/remove nodes, share/unshare folder with others, grant admin to others, delete folder

### 21.2 Group Admins

- Creator of a group is the owner
- Owner can grant admin rights to group members
- Stored in `group_admins(group_id, user_id, granted_by)`
- Admins can: rename group, add/remove members, share nodes to group, delete group

### 21.3 Granting Admin via UI

- In long-press context menu (§17.2): "Give admin rights" action available when a friend is selected in the context of a folder or group the current user owns/admins
- In folder/group detail view: member list with admin toggle per member

---

## 22. INTERACTION CONTRACTS

- **Add node:** Now triggered exclusively via floating + FAB → New Card modal (URL / text / image) → `extract-node-metadata` Edge Function (https://supabase.com/docs/guides/functions) → auto-create tags (deterministic via §19.3 using the returned `suggested_tags`) → persist node (origin_user_id = current user, origin_created_at = now()) → edges default private  
- **Auto-create on Drag (name prompt)** — immediate inline name prompt with explicit **cancel option** (Escape or tap outside); also triggers infinite-canvas positioning for the newly created folder/group
- **Edit / Delete node:** Fully persisted (soft delete via §6.9)
- **No duplicate nodes:** Deterministic deduplication on URL per owner
- **Default ordering:** Newest first
- **Real-time sync:** Supabase subscriptions for shares, folder changes, new ratings, profile updates
- **Auto-create naming prompt:** Always triggered when drag creates a new folder or group (§6.10)
- **Clicking "Me" avatar = personal feed + clear all filters** (no separate Home button needed)

---

## 23. AUTH & PERSISTENCE

- Supabase Auth (https://supabase.com) (or Clerk) for real user accounts
- OAuth avatar → stored internally on first login (see §32.4); no external avatar URL persisted
- Real-time via Supabase subscriptions

---

## 24. STYLING & POLISH CONTRACT

- Clean modern design, Tailwind CSS (https://tailwindcss.com)
- Full dark / light theme (toggle in Profile modal)
- Smooth animations throughout
- Wobble animation on long-press multi-select (CSS keyframes, ±2° rotation, 0.3s period)
- Drag-expand animation on collapsed bars (smooth height transition, ~200ms)
- Avatars rendered from internal storage; deterministic SVG/color default based on user_id hash when no avatar uploaded
- All tap targets minimum 44×44 px
- Fully responsive + manual view override
- Tag chips always rendered in their unique color with translated label
- Rating sliders large-handled and touch-friendly
- Deployable one-click via Windsurf Editor (https://windsurf.com) (Netlify / Vercel)
- Bars have opaque contrasting background
- Desktop bars include permanent left/right arrows when overflowing

---

## 25. NOTIFICATION SYSTEM

Triggered on: share / unshare / group changes / folder share changes / imports / ratings / profile changes.  
Async only; no impact on visibility.

---

## 26. ICON SYSTEM

All icons throughout the application use a **flat, monochrome, stroke-based icon set** (feather-style: 1.75 px stroke, round line caps and joins, no fill).

- **No emoji icons** anywhere in the UI.
- **No colored icon assets.**
- Icons are rendered as inline SVG symbols for performance and theming.
- Icon sizes: 14 px (small/inline), 16 px (top bar), 18 px (FAB, primary actions), 20 px (card detail primary).
- Color: inherits `currentColor` from parent. Inactive: `--color-text-3`. Active: `--color-text` or `--color-accent`.

| Location | Icon | Symbol |
|---|---|---|
| Filter trigger | Sliders (3 horizontal lines with adjustment marks) | `ic-sliders` |
| Notification | Bell | `ic-bell` |
| Search | Magnifying glass | `ic-search` |
| FAB | Plus | `ic-plus` |
| Breadcrumb back | Left chevron | `ic-chevl` |
| Expand handle | Up chevron | `ic-chevu` |
| Close / cancel | × | `ic-x` |
| Open externally | Arrow up-right from box | `ic-ext` |
| Share | Three circles connected by lines | `ic-share` |
| Trash | Bin | `ic-trash` |
| Fullscreen | Corner arrows outward | `ic-max` |
| Sort | Up/down arrows | `ic-sort` |
| Settings | Gear | `ic-settings` |
| Folder | Folder outline | `ic-folder` |

---

## 26. ACTIVITY LOG

Append-only: shares, unshares, imports, ratings, profile changes (username, avatar). Powers feed filters and audit.

---

## 27. PERFORMANCE CONSTRAINTS

- Max nodes per expansion: configurable
- Max users per expansion: configurable
- Max folder recursion depth: configurable (default 5)
- Monitor: cause writes, edge writes, expansion size, write latency, failure rate

---

## 28. CHAT SYSTEM (DEFERRED — LAST PHASE)

Not part of core. Implement only after §29 passes entirely.

---

## 29. INVARIANTS (NON-NEGOTIABLE)

- Visibility derived ONLY from edges (edge existence = at least one active cause)
- No implicit access, no JOIN-based visibility at read time
- Block system overrides all visibility
- Deterministic cursor-based ordering
- **NO UNIQUE(node_id, user_id) on edges** — multiple edges per pair are valid
- Every edge references exactly one cause: `cause_id NOT NULL`
- Cause deletion cascades to all its edges; no other deletion mechanism exists for edges
- No path checks, no fallback logic, no recomputation in unshare paths
- Full transaction integrity on all writes
- Rating writes update `nodes_sort_cache` in same transaction
- Soft delete never removes causes or edges
- `nodes.origin_user_id` and `nodes.origin_created_at` are immutable after creation
- Tags are concept-only; all labels live in `tag_translations`; no tag name field exists
- No external avatar URLs stored anywhere in the system
- `users.normalized_display_name` is UNIQUE and enforced at DB level
- No runtime translation in any read path

**Final rule:**

If you cannot answer:
> "Why does user X see node Y?"

with:
> "Because `edge(Y → X)` exists and its `cause_id` references an existing cause."

→ **SYSTEM IS INVALID.**

---

## 30. VALIDATION CHECKLIST

### Data & Visibility

- [ ] Edge-based visibility enforced end-to-end (no path logic at read time)
- [ ] Every edge has a non-null `cause_id` referencing a valid cause
- [ ] `edges.sender_id` and `edges.direction` populated on every share write
- [ ] `edges.depth` populated at creation (0 for import, parent+1 for shares)
- [ ] Rating writes update `nodes_sort_cache` atomically
- [ ] Soft delete does not remove causes or edges; restore restores visibility
- [ ] Folder share creates N `direct_share` causes (one per node per user) via atomic expansion (§6.5)
- [ ] Folder unshare deletes causes by `folder_share_op_id`; edges cascade automatically
- [ ] Group unshare deletes cause; edges cascade automatically — no path checks
- [ ] Block system prevents mutual node visibility
- [ ] All writes atomic with rollback on failure

### Provenance

- [ ] `nodes.origin_user_id` and `nodes.origin_created_at` set at creation and never modified
- [ ] Import sets `edges.depth = 0`; all shares set `depth = parent + 1`

### Profile Identity

- [ ] `users.display_name` required, 3–32 chars, Unicode allowed
- [ ] `users.normalized_display_name` is lowercase, NFKC, trimmed; enforced UNIQUE at DB level
- [ ] Empty strings and invisible-only strings rejected on username creation/change
- [ ] Username change rate-limited to 1 per 24h
- [ ] Avatar stored internally (Supabase Storage); no external URLs accepted
- [ ] OAuth avatar downloaded and stored internally on first login
- [ ] Deterministic default avatar generated from user_id hash when no avatar uploaded
- [ ] Avatar change rate-limited to 5 per day
- [ ] All profile changes logged in activity_log

### Multilingual

- [ ] `users.language_code` present and defaults to 'en'
- [ ] `nodes.language_code` present
- [ ] `translations` table exists with UNIQUE(node_id, language_code)
- [ ] Tag labels served from `tag_translations` for user's language_code; fallback chain applied
- [ ] No runtime translation or AI in any read path
- [ ] Tag filtering by `tag_id` only (language-independent)
- [ ] Search includes `tag_translations.label` for user's language_code

### Tag System

- [ ] `tags` table has no `name` field
- [ ] `tag_translations` has UNIQUE(tag_id, language_code)
- [ ] Tag creation is deterministic: normalize → lookup → reuse or create
- [ ] Every tag has a unique color
- [ ] Tag colors consistent across card chips, collapsible tag row, tag editor

### Feed & Filters

- [ ] Feed 3-state toggle: All / Received / Sent — correct edge-filtered results
- [ ] Multi-filter AND logic: selecting friends + folders + tags intersects correctly
- [ ] Clear Filters button visible only when filters active; clears all on tap
- [ ] Clicking "Me" avatar returns to personal feed + clears all filters
- [ ] Folder/group selection highlights friends with access in Unified bar

### Layout & Views

- [ ] 5 cards per row in mobile icon grid view
- [ ] 5 friend avatars visible at mobile screen width in Unified bar
- [ ] All five view modes functional: Masonry / Icons / List / Horizontal Rows / Infinite Canvas
- [ ] View preference persisted per user
- [ ] Horizontal Row layout groups by folder/tag/sender correctly
- [ ] Infinite Canvas supports free positioning + sub-folder zooming (pinch-to-zoom removed)

### Cards

- [ ] Sent/Received icon badge visible on every card (uses `--color-sent` / `--color-received` tokens)
- [ ] Average rating displayed on card face (numeric)
- [ ] Tag chips show unique colors and translated labels (single-line scroll)
- [ ] Folder chips show average rating + friend access avatars (with View all)

### Card Detail Modal

- [ ] Near-full-screen modal opens on card tap
- [ ] Correct embed player loads (YouTube / Suno / Spotify / iframe)
- [ ] Full-screen button works for media
- [ ] All metadata fields populated (views, share count, friends, rating)
- [ ] Rating slider 0–10 step 0.5, auto-saves on slide end
- [ ] Your Rating + Average Rating + friend breakdown shown
- [ ] All actions work: share, move to folder, add to group, trash, open externally
- [ ] Context menu = Bottom-sheet (mobile) / Side drawer (desktop)

### Long-Press / Multi-Select

- [ ] Long-press activates wobble animation on all selected items
- [ ] (×) icon appears; tap (×) = soft delete with Undo toast
- [ ] Context menu shows correct actions per item type
- [ ] Admin rights grantable via long-press menu
- [ ] Multi-select works across cards, folders, friends, groups

### Drag & Drop

- [ ] All drag targets functional and persisted
- [ ] Drag physics: items scale ~1.05×, elevate (shadow), offset from pointer (mobile: up ~80 px; desktop: 8 px right / −8 px up); lift transition ≤ 100 ms
- [ ] Tag drag onto card/folder adds tag; drag off removes tag
- [ ] Friend ↔ Folder bidirectional drag triggers folder share
- [ ] Dragging and pausing over collapsed bar → bar auto-expands
- [ ] Card → Card auto-creates Folder with name prompt **with cancel**
- [ ] Friend → Friend auto-creates Group with name prompt **with cancel**
- [ ] Name prompt appears immediately after auto-create; new item visible in bar after naming
- [ ] Mobile drag works reliably (touch events, no context menu)
- [ ] Drag-to-remove target visible
- [ ] Enhanced drop targets for friend/group avatars
- [ ] Card reordering switches sort to Custom

### Trash

- [ ] Trash icon in top bar with badge count
- [ ] Restore item restores visibility via existing edges and causes
- [ ] Permanent delete requires confirmation
- [ ] Direct drag-to-trash supported

### Admin

- [ ] Folder/group owner can grant admin to friends with access
- [ ] Admins can rename, share, manage members

### Bars & Navigation

- [ ] Top bar renders in exactly 1 permanent row
- [ ] Tags icon-btn triggers Tags Strip; badge shows active tag count
- [ ] Search icon-btn opens Search sheet
- [ ] Profile avatar (top-right) opens Profile modal
- [ ] Logo tap clears all filters and returns to root feed
- [ ] No Sliders icon anywhere in the layout
- [ ] No Filter Feed bottom sheet anywhere in the layout
- [ ] No bottom tab bar anywhere on mobile
- [ ] Feed Filter Tabs: 3 tabs only (All / Mine / Received)
- [ ] Context strip hidden when no filters active
- [ ] Context strip appears between feed tabs and sort row when ≥1 filter active
- [ ] FAB is a circle (not pill, not bar-docked)
- [ ] FAB icon: `+` only, no text
- [ ] FAB floats 20 px above Friends Strip on mobile
- [ ] FAB is bottom-right fixed on desktop
- [ ] Add Card Sheet: single input field, auto-detects URL/text
- [ ] Friends & Groups Strip is **permanently at the bottom**
- [ ] Strip never appears at the top
- [ ] "Me" avatar pinned left, never scrolls
- [ ] Friends displayed as **circles**
- [ ] Groups displayed as **rounded squares** (~10 px radius)
- [ ] Group chip shows member micro-avatar stack (up to 3, 8 px) bottom-right
- [ ] New-activity ring: amber 2 px outline + amber dot
- [ ] Active filter ring: blue 2.5 px outline
- [ ] Expand chevron above strip opens Friends Panel
- [ ] Friends Panel: search filters friends/groups; selected items pinned
- [ ] Group Editor accessible from Friends Panel and long-press
- [ ] Drag Panel (mobile): slides up on card drag; Share + Move tabs
- [ ] Folder Tree Picker: full-height sheet with hierarchy
- [ ] Folder tiles: same size as cards; 2×2 collage
- [ ] Breadcrumb hidden at root; visible in folders
- [ ] Card Detail Sheet: bottom sheet; "Open externally" primary CTA
- [ ] Sent indicator = small purple rounded square (9×9 px, top-left)
- [ ] Desktop sidebar: Feed · Folders · Trash; friends/groups/folders/tags
- [ ] Icons: flat SVG stroke-based (feather-style); no emoji

### Design Tokens & Z-Index

- [ ] `--color-received` and `--color-sent` defined as global CSS tokens; used by BOTH toggle buttons AND card badges
- [ ] Z-index hierarchy (`--z-bars`, `--z-top-bar`, `--z-fab`, `--z-modal`, `--z-sheet`, `--z-toast`, `--z-overlay`) defined and enforced across all components

### Auth & Real-Time

- [ ] Real Supabase auth (https://supabase.com) + persistent data
- [ ] Supabase subscriptions push share/rating/profile updates in real time
- [ ] Seed data on first deploy

---

## 31. INCONSISTENCY RESOLUTION SUMMARY

| # | v20 (overridden)                                                    | v21+ (authoritative)                                                                    |
|---|---------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| 1 | Folders/groups are purely organizational, no visibility impact       | Folders/groups are write-expansion orchestrators; sharing creates causes + edges        |
| 2 | Dedicated `friends` table                                           | Friendships are reciprocal edge pairs; no separate table                                |
| 3 | Friend click uses folder-aware query                                | Friend click uses edge-only query (edges pre-created by folder share)                   |
| 4 | Home \| Orange + \| Profile navbar                                  | Friends/Groups \| Create \| Folders/Tags — UIX visual polish retained                   |
| 5 | UNIQUE(node_id, user_id) on edges + UPSERT writes                   | No uniqueness constraint; each share = new cause + new edges; deletion by cause         |
| 6 | Unshare checks for "remaining paths" before deleting edges          | Unshare deletes cause; edges cascade; no path checks                                    |
| 7 | `tags.name` as string identifier                                    | Tags are concept-only; all labels in `tag_translations`                                 |
| 8 | External avatar URLs stored in `users.avatar_url`                   | Avatars stored internally; deterministic default; no external URLs                      |
| 9 | No multilingual support                                             | `language_code` on users + nodes; `translations` table; deterministic fallback          |
| 10| No node provenance fields                                           | `origin_user_id`, `origin_created_at` on nodes; immutable                               |

---

## 32. PROFILE IDENTITY SYSTEM

### 32.1 User Identity Fields

```
users:
  display_name              TEXT NOT NULL
  normalized_display_name   TEXT NOT NULL UNIQUE
  language_code             TEXT NOT NULL DEFAULT 'en'
  avatar_key                TEXT  -- internal storage reference; NULL = use default
  username_changed_at       TIMESTAMPTZ
  avatar_change_count_today INTEGER NOT NULL DEFAULT 0
  avatar_last_reset_date    DATE
```

### 32.2 Display Name Rules

- Required; 3–32 characters
- Unicode allowed
- Normalization applied before storing `normalized_display_name`:
  - Lowercase
  - Trim leading/trailing whitespace
  - NFKC Unicode normalization
- Rejected: empty strings, strings that normalize to empty, invisible-character-only strings
- `normalized_display_name` enforced UNIQUE at database level

### 32.3 Username Rate Limit

- Maximum 1 display_name change per 24-hour window (enforced via `username_changed_at`)
- All changes logged in `activity_log`
- Real-time propagation via Supabase subscriptions to all surfaces showing this user's name

### 32.4 Avatar Rules

- Stored **internally only** (Supabase Storage or equivalent). No external URLs accepted or stored.
- On first OAuth login: provider avatar is downloaded and stored internally; `avatar_key` is set
- When no avatar uploaded: **deterministic default** generated from `user_id` hash (e.g., color block + initials, seeded by UUID)
- Maximum 5 avatar changes per calendar day (enforced via `avatar_change_count_today` + daily reset)
- All changes logged in `activity_log`

### 32.5 Real-Time Propagation

Profile changes (name, avatar) propagate via Supabase subscriptions to:
- All card surfaces displaying sender/recipient avatars
- Unified bar
- Card detail modal "Shared with" list

---

## 33. MULTILINGUAL SYSTEM

### 33.1 Language Fields

```
users.language_code   TEXT NOT NULL DEFAULT 'en'   -- user's display language preference
nodes.language_code   TEXT NOT NULL DEFAULT 'en'   -- language of the original node content
```

### 33.2 Translations Table

```
translations:
  id            UUID PRIMARY KEY
  node_id       UUID NOT NULL REFERENCES nodes(id)
  language_code TEXT NOT NULL
  title         TEXT
  description   TEXT
  created_at    TIMESTAMPTZ NOT NULL
  UNIQUE(node_id, language_code)
```

No runtime translation. No AI in any read path. All translated content must be pre-stored.

### 33.3 Content Resolution (Deterministic Fallback Chain)

When rendering a node's title/description for a user:

1. Look up `translations` WHERE `node_id = $node_id AND language_code = user.language_code`
2. If not found → look up `translations` WHERE `node_id = $node_id AND language_code = nodes.language_code`
3. If not found → use `nodes.title` directly (original content)

This chain is deterministic, static, and requires no runtime computation beyond two indexed lookups.

### 33.4 Tag Label Resolution

When rendering a tag label for a user:

1. Look up `tag_translations` WHERE `tag_id = $tag_id AND language_code = user.language_code`
2. If not found → look up `tag_translations` WHERE `tag_id = $tag_id AND language_code = 'en'`
3. If not found → show `tag_id` shortened (last 8 chars) as fallback identifier

### 33.5 Search Behavior

Search queries include:
- `translations.title` and `translations.description` for `language_code = user.language_code`
- `tag_translations.label` for `language_code = user.language_code`
- `nodes.title` as final fallback

No cross-language search blending at runtime. All indexed. Deterministic.

### 33.6 Visibility Independence

Language preferences have **no impact** on visibility. Visibility is determined solely by edge existence (§5).

---

## 34. NODE PROVENANCE

### 34.1 Origin Fields (Immutable)

```
nodes:
  origin_user_id    UUID NOT NULL REFERENCES users(id)
  origin_created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Rules:
- Set once at node creation (`INSERT` time)
- `origin_user_id = current_user` at creation
- **Never modified** — no UPDATE path exists for these fields
- Independent of `owner_id` (which may change if ownership transfer is ever supported), edges, and causes

### 34.2 Purpose

| Use case     | Description                                                  |
|--------------|--------------------------------------------------------------|
| Traceability | Identifies who originally created a node regardless of sharing history |
| Analytics    | Enables provenance-aware ranking and feed personalization    |
| Ranking      | `nodes_sort_cache` may incorporate origin signals            |
| Audit        | Activity log can reference original creator                  |

### 34.3 Edge Depth (Optional, Recommended)

```
edges.depth   INTEGER   -- nullable; 0 for import; parent_depth + 1 for shares
```

- Written **once** at edge creation time
- Never recomputed
- Enables provenance chain analysis without graph traversal at read time

---

## 35. SQL SCHEMA (COMPLETE)

```sql
-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name                TEXT NOT NULL,
  normalized_display_name     TEXT NOT NULL UNIQUE,
  language_code               TEXT NOT NULL DEFAULT 'en',
  avatar_key                  TEXT,                     -- internal storage key; NULL = deterministic default
  username_changed_at         TIMESTAMPTZ,
  avatar_change_count_today   INTEGER NOT NULL DEFAULT 0,
  avatar_last_reset_date      DATE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- NODES
-- ============================================================
CREATE TABLE nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url               TEXT,                                 -- nullable; NULL = pure text card
  text_content      TEXT,                                 -- optional rich text / markdown for text-only cards
  title             TEXT,
  thumbnail_key     TEXT,                               -- internal storage key
  owner_id          UUID NOT NULL REFERENCES users(id),
  language_code     TEXT NOT NULL DEFAULT 'en',
  origin_user_id    UUID NOT NULL REFERENCES users(id), -- immutable
  origin_created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- immutable
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(url, owner_id) -- text-only cards (url=NULL) are still deduplicated by owner + text_content in app logic
);

-- ============================================================
-- CAUSES
-- ============================================================
CREATE TABLE causes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cause_type   TEXT NOT NULL CHECK (cause_type IN ('direct_share', 'group_share', 'import')),
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB         -- e.g., {node_id, target_user_id, group_id, folder_id, folder_share_op_id}
);

-- ============================================================
-- EDGES
-- No UNIQUE(node_id, user_id) — multiple edges per pair are valid
-- Deletion via cause cascade ONLY
-- ============================================================
CREATE TABLE edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  cause_id    UUID NOT NULL REFERENCES causes(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id),
  direction   TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  depth       INTEGER,        -- 0 for import; parent_depth + 1 for shares; written once
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX edges_node_user_idx ON edges(node_id, user_id);
CREATE INDEX edges_cause_idx ON edges(cause_id);

-- ============================================================
-- RATINGS
-- ============================================================
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  score       NUMERIC(3,1) NOT NULL
              CHECK (score >= 0 AND score <= 10 AND MOD(score * 2, 1) = 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(node_id, user_id)
);

-- ============================================================
-- NODES SORT CACHE
-- ============================================================
CREATE TABLE nodes_sort_cache (
  node_id      UUID PRIMARY KEY REFERENCES nodes(id),
  avg_rating   NUMERIC(3,1),
  view_count   INTEGER NOT NULL DEFAULT 0,
  share_count  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- GROUPS
-- ============================================================
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_nodes (
  group_id    UUID NOT NULL REFERENCES groups(id),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id, node_id)
);

CREATE TABLE group_members (
  group_id    UUID NOT NULL REFERENCES groups(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE group_admins (
  group_id    UUID NOT NULL REFERENCES groups(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  granted_by  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(group_id, user_id)
);

-- ============================================================
-- FOLDERS
-- ============================================================
CREATE TABLE folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  owner_id         UUID NOT NULL REFERENCES users(id),
  parent_folder_id UUID REFERENCES folders(id),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE folder_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  folder_id   UUID NOT NULL REFERENCES folders(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(node_id, folder_id)
);

CREATE TABLE folder_tree (
  folder_id   UUID NOT NULL REFERENCES folders(id),
  ancestor_id UUID NOT NULL REFERENCES folders(id),
  depth       INTEGER NOT NULL,
  PRIMARY KEY(folder_id, ancestor_id)
);

CREATE TABLE folder_admins (
  folder_id   UUID NOT NULL REFERENCES folders(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  granted_by  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(folder_id, user_id)
);

-- ============================================================
-- TAGS (CANONICAL MODEL)
-- ============================================================
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_hex   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tag_translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id        UUID NOT NULL REFERENCES tags(id),
  language_code TEXT NOT NULL,
  label         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tag_id, language_code)
);

CREATE INDEX tag_translations_lookup_idx ON tag_translations(language_code, label);

CREATE TABLE tag_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id      UUID NOT NULL REFERENCES tags(id),
  node_id     UUID REFERENCES nodes(id),
  folder_id   UUID REFERENCES folders(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (node_id IS NOT NULL AND folder_id IS NULL) OR
    (node_id IS NULL AND folder_id IS NOT NULL)
  )
);

-- ============================================================
-- TRANSLATIONS (NODE CONTENT I18N)
-- ============================================================
CREATE TABLE translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       UUID NOT NULL REFERENCES nodes(id),
  language_code TEXT NOT NULL,
  title         TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(node_id, language_code)
);

-- ============================================================
-- BLOCKS
-- ============================================================
CREATE TABLE blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id),
  blocked_id  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(blocker_id, blocked_id)
);

-- ============================================================
-- IMPORT TABLES
-- ============================================================
CREATE TABLE external_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE external_items_map (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_source_id UUID NOT NULL REFERENCES external_sources(id),
  external_id        TEXT NOT NULL,
  node_id            UUID NOT NULL REFERENCES nodes(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(external_source_id, external_id)
);

-- ============================================================
-- SYSTEM TABLES
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  payload     JSONB,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,
  target_id    UUID,
  target_type  TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 36. SYSTEM INVARIANTS (MACHINE-VERIFIABLE)

| # | Invariant | Enforcement |
|---|-----------|-------------|
| I-01 | A node is visible to a user IFF at least one edge exists for (node_id, user_id) | Read path; no other mechanism |
| I-02 | Every edge has exactly one non-null cause_id | DB constraint: NOT NULL FK |
| I-03 | Cause deletion cascades to all its edges; no other edge deletion path | ON DELETE CASCADE |
| I-04 | No UNIQUE(node_id, user_id) on edges | Schema enforced; absent from DDL |
| I-05 | Cause types are exactly: direct_share, group_share, import | DB CHECK constraint |
| I-06 | No path checks or fallback logic in unshare operations | Code review; no SELECT before DELETE |
| I-07 | No recomputation of visibility at read time | Code review; edges queried directly |
| I-08 | `nodes.origin_user_id` and `nodes.origin_created_at` never updated | No UPDATE path in application code |
| I-09 | `tags` has no name column | Schema enforced; absent from DDL |
| I-10 | UNIQUE(tag_id, language_code) in tag_translations | DB constraint |
| I-11 | Tag filtering by tag_id only | Query review; no label-based filter |
| I-12 | No external URLs in users.avatar_key | Application validation layer |
| I-13 | `users.normalized_display_name` is UNIQUE | DB constraint |
| I-14 | No runtime translation in read path | Code review; no translation API calls |
| I-15 | `edges.depth` written once at creation; never recomputed | No UPDATE path in application code |
| I-16 | Rating writes update `nodes_sort_cache.avg_rating` in same transaction | Single atomic transaction |
| I-17 | Soft delete does not remove causes or edges | Code review; only sets deleted_at |
| I-18 | Username change rate-limited to 1 per 24h | Application enforcement via username_changed_at |
| I-19 | Avatar change rate-limited to 5 per day | Application enforcement via avatar_change_count_today |
| I-20 | `--color-received` and `--color-sent` CSS tokens used by both toggle buttons and card badges | Design token audit; no hardcoded hex values at component level |
| I-21 | Z-index hierarchy (§24) enforced; FAB never below bars; modals never below FAB | CSS audit; component z-index references tokens only |

---

## 37. MIGRATION NOTES (v20 → v21)

### 37.1 Edge Table Migration

```sql
-- Step 1: Add cause system
CREATE TABLE causes ( ... );  -- per §35

-- Step 2: Create a migration cause for all existing edges
INSERT INTO causes (id, cause_type, created_by, metadata)
SELECT gen_random_uuid(), 'direct_share', e.sender_id,
       jsonb_build_object('migrated_from_v20', true, 'node_id', e.node_id)
FROM edges e;

-- Step 3: Add cause_id to edges and populate
ALTER TABLE edges ADD COLUMN cause_id UUID REFERENCES causes(id) ON DELETE CASCADE;
-- (populate cause_id per-edge from migration causes)

-- Step 4: Add depth column
ALTER TABLE edges ADD COLUMN depth INTEGER;
-- Set depth = 0 for imported edges, 1 for shared edges (approximation for migration)

-- Step 5: Remove UNIQUE constraint
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_node_id_user_id_key;

-- Step 6: Remove deleted_at from edges (deletion is now via cause cascade)
-- Note: edges with deleted_at IS NOT NULL → delete their cause (which cascades)
-- edges with deleted_at IS NULL → keep as-is
ALTER TABLE edges DROP COLUMN deleted_at;
```

### 37.2 Tag Table Migration

```sql
-- Step 1: Create tag_translations table (per §35)
CREATE TABLE tag_translations ( ... );

-- Step 2: Migrate existing tags.name to tag_translations
INSERT INTO tag_translations (id, tag_id, language_code, label, created_at)
SELECT gen_random_uuid(), id, 'en', name, created_at
FROM tags
WHERE name IS NOT NULL AND name != '';

-- Step 3: Remove tags.name column
ALTER TABLE tags DROP COLUMN name;
```

### 37.3 Node Provenance Migration

```sql
-- Step 1: Add origin fields to nodes
ALTER TABLE nodes ADD COLUMN origin_user_id UUID REFERENCES users(id);
ALTER TABLE nodes ADD COLUMN origin_created_at TIMESTAMPTZ;

-- Step 2: Populate from existing data (best approximation)
UPDATE nodes SET origin_user_id = owner_id, origin_created_at = created_at;

-- Step 3: Apply NOT NULL constraints
ALTER TABLE nodes ALTER COLUMN origin_user_id SET NOT NULL;
ALTER TABLE nodes ALTER COLUMN origin_created_at SET NOT NULL;
```

### 37.4 User Profile Migration

```sql
-- Step 1: Rename avatar_url to avatar_key; null out external URLs
ALTER TABLE users RENAME COLUMN avatar_url TO avatar_key;
UPDATE users SET avatar_key = NULL
WHERE avatar_key LIKE 'http%';   -- external URLs removed; deterministic default applies

-- Step 2: Add new identity fields
ALTER TABLE users ADD COLUMN normalized_display_name TEXT;
ALTER TABLE users ADD COLUMN language_code TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN username_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN avatar_change_count_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN avatar_last_reset_date DATE;

-- Step 3: Populate normalized_display_name from existing display_name
UPDATE users
SET normalized_display_name = lower(trim(display_name));
-- Note: handle duplicates before applying UNIQUE constraint

ALTER TABLE users ALTER COLUMN normalized_display_name SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_normalized_display_name_key UNIQUE (normalized_display_name);
```

### 37.5 Removed Tables

```sql
-- These tables are removed in v21; data is superseded by causes.metadata
DROP TABLE IF EXISTS folder_shares;
DROP TABLE IF EXISTS folder_nodes_tracking;
```

### 37.6 Translations Table

```sql
-- New table; no migration from existing data (empty initially)
CREATE TABLE translations ( ... );  -- per §35
```

---

## 38. COMPLIANCE CONFIRMATION

### Causal Constraints (I-01 through I-07)

| Constraint | Status |
|---|---|
| 1. Every edge has exactly one cause_id | ✅ COMPLIANT — NOT NULL FK in schema |
| 2. No derived/recursive/folder-based causes | ✅ COMPLIANT — cause_type CHECK limits to direct_share, group_share, import |
| 3. No UNIQUE(node_id, user_id) on edges | ✅ COMPLIANT — absent from DDL |
| 4. Deterministic deletion: cause delete cascades all edges | ✅ COMPLIANT — ON DELETE CASCADE |
| 5. Visibility = edge existence, no recomputation | ✅ COMPLIANT — §5 read path is a direct SELECT |
| 6. No cross-cause awareness | ✅ COMPLIANT — causes reference no other causes |
| 7. Folder share = N direct_share causes (Option A) | ✅ COMPLIANT — §6.5 |
| 8. Group share = 1 cause + N edges | ✅ COMPLIANT — §6.3 |
| 9. Import = 1 cause + 1 edge | ✅ COMPLIANT — §6.8 |

### Multilingual Determinism

| Requirement | Status |
|---|---|
| users.language_code present | ✅ COMPLIANT |
| nodes.language_code present | ✅ COMPLIANT |
| translations table with UNIQUE(node_id, language_code) | ✅ COMPLIANT |
| No runtime translation in read path | ✅ COMPLIANT — §33 fallback is static lookup only |
| tag_translations with UNIQUE(tag_id, language_code) | ✅ COMPLIANT |
| Tag filtering language-independent | ✅ COMPLIANT — by tag_id only |

### Tag Consistency

| Requirement | Status |
|---|---|
| tags has no name field | ✅ COMPLIANT — removed in §4.4 and §35 |
| All labels in tag_translations | ✅ COMPLIANT |
| No tag duplication across languages | ✅ COMPLIANT — UNIQUE(tag_id, language_code) |
| Deterministic tag creation | ✅ COMPLIANT — §19.3 normalize → lookup → reuse or create |

### Profile Identity

| Requirement | Status |
|---|---|
| normalized_display_name UNIQUE | ✅ COMPLIANT |
| No external avatar URLs | ✅ COMPLIANT — avatar_key is internal storage reference |
| Deterministic default avatar | ✅ COMPLIANT — hash of user_id |
| Rate limits enforced | ✅ COMPLIANT — username 1/24h, avatar 5/day |

### Invariant Violations

> **None detected.** All 21 system invariants in §36 are satisfied by the schema and write system as specified.

---

## 39. VALIDATION CHECKLIST v26 (replaces §39 of v25)

### Top Bar & Navigation

- [ ] Top bar is exactly 1 row (logo · tags · search · bell · avatar)
- [ ] Tags icon-btn triggers Tags Strip (§11.3f); badge shows active tag count
- [ ] Search icon-btn opens Search sheet (P9)
- [ ] Profile avatar (top-right) opens Profile modal
- [ ] Logo tap clears all filters and returns to root feed
- [ ] No Sliders icon anywhere in the layout
- [ ] No Filter Feed bottom sheet anywhere in the layout
- [ ] No bottom tab bar anywhere on mobile

### Feed Filter Tabs

- [ ] 3 tabs only: All · Mine · Received
- [ ] No "Sent" tab
- [ ] Tab colors: All = neutral grey · Mine = amber · Received = blue
- [ ] Active tab shows `bg4` background + colored label

### Context Strip

- [ ] Context strip hidden when no filters active
- [ ] Context strip appears between feed tabs and sort row when ≥1 filter active
- [ ] Each pill has `×` to remove individual filter
- [ ] "Clear all" pill visible when ≥2 filters active
- [ ] Feed re-queries on each pill removal
- [ ] Active tag filters appear as pills in context strip with × to remove
- [ ] Removing last active tag filter auto-collapses Tags Strip

### Tags Strip

- [ ] Tags Strip hidden by default (zero height)
- [ ] Tap Tags icon opens strip with slide-down animation (200ms)
- [ ] Strip contains: search input (auto-focused) + horizontally scrollable chip row
- [ ] Only tags present on visible nodes (own + received) are shown — never global tag list
- [ ] Search filters chips in real time; selected chips always remain visible
- [ ] Tap chip: selects tag, chip moves to left of row, feed filters immediately
- [ ] Multi-select works (AND logic between selected tags)
- [ ] Selected chips pinned left during scroll
- [ ] `getVisibleTags(userId, languageCode)` DB function used — not `getAllTags()`

### FAB

- [ ] FAB is a circle (not pill, not bar-docked)
- [ ] FAB icon: `+` only, no text; rotates to `×` on speed-dial open
- [ ] Speed-dial has exactly 4 actions: Tag · Card · Folder · Template (bottom to top)
- [ ] Speed-dial scrim dismisses on tap outside
- [ ] Tag Mode: floating Tag Pill + half-height sheet; card tap assigns tag, not detail
- [ ] Tag Mode exits on `×` tap; feed returns to normal
- [ ] New Folder sheet: name input + 7-color swatch + Save
- [ ] Template Picker: preset list + optional name input + "Add to workspace"
- [ ] Unwired actions (pre-dependency phase) show "Coming soon" toast
- [ ] FAB floats 20 px above Friends Strip handle on mobile
- [ ] FAB is bottom-right fixed on desktop

### Add Card Sheet

- [ ] Single input field, no URL/Text tabs
- [ ] Auto-detects URL on paste (starts with `http://`/`https://`)
- [ ] Auto-detects text card on regular typing
- [ ] Input expands with content (starts 1 line, max ~40% sheet height)
- [ ] URL preview (thumbnail + title + domain) shown during/after fetch
- [ ] Auto-tag chips shown; user can remove/add before save
- [ ] Quick share avatar row present (optional, multi-select)
- [ ] Save creates `node + cause (import) + edge` atomically
- [ ] Fetch failure: saves card with URL as title, no thumbnail, never blocks

### Friends & Groups Strip

- [ ] Strip has 3 states: Hidden / Strip / Expanded Panel
- [ ] State persisted to localStorage key `liked.friendsStripState` 
- [ ] Hidden state: only handle visible (28 px) with `Friends (N) & Groups (N)` label
- [ ] Strip state: full avatar row + handle above
- [ ] Swipe down on strip → Hidden; swipe up on handle → Strip; swipe up on strip → Expanded Panel
- [ ] Handle label shows live counts: `Friends (N) & Groups (N)` 
- [ ] "Me" avatar pinned left, never scrolls
- [ ] Friends displayed as circles
- [ ] Groups displayed as rounded squares (~10 px radius)
- [ ] Group chip shows member micro-avatar stack (up to 3, 8 px) bottom-right
- [ ] New-activity ring: amber 2 px outline + amber dot
- [ ] Active filter ring: blue 2.5 px outline
- [ ] Single tap friend → apply filter → blue ring + context strip pill
- [ ] Long press → options popover
- [ ] Expanded Panel: friend drag onto group chip adds member
- [ ] Expanded Panel: drag member out of group removes member with Undo toast
- [ ] Expanded Panel: group chip long-press → delete popover
- [ ] Expanded Panel: group chips reorderable; order persisted to localStorage

### Friends Panel

- [ ] Opens by tapping chevron handle or during drag
- [ ] Search bar filters friends and groups by name
- [ ] Already-selected items pinned above search results
- [ ] Friends section: avatar · name · activity timestamp · new dot
- [ ] Groups section: rounded-square avatar · name · member count · `›`
- [ ] Group `›` opens Group Editor
- [ ] Confirm button shows correct label: "Apply filter" vs "Share with N"

### Group Editor

- [ ] Accessible from Friends Panel `›` button and from group long-press
- [ ] Shows current members with `−` remove
- [ ] Shows non-member friends with `+` add
- [ ] Already-in-group rows greyed out with "already in" label
- [ ] Save button persists changes

### Drag Panel (mobile)

- [ ] Card drag (hold ~400 ms) slides FAB + strip out, drag panel slides up
- [ ] Drag panel has two sections: Share (friends/groups) + Move (folders)
- [ ] Friends grid: 5-per-row circles + groups as rounded squares
- [ ] Folder grid: 4-per-row collage thumbnail tiles
- [ ] Search bars in both sections filter in real time
- [ ] Already-selected items pinned above results during search
- [ ] "All…" tile in folder grid opens Folder Tree Picker
- [ ] Confirm button disabled (grey) when 0 items selected
- [ ] Confirm button amber with count when ≥1 selected
- [ ] Share and folder-move are NOT mutually exclusive; both can apply in one confirm
- [ ] Release outside targets = cancel; card returns to position
- [ ] Toast + 5s undo after every successful drop

### Folder Tree Picker

- [ ] Full-height sheet; search bar at top
- [ ] Hierarchical indent (per depth level)
- [ ] Sub-folders visible under parent
- [ ] Currently active folder highlighted
- [ ] Confirm + Cancel at bottom

### Folder Tiles

- [ ] Folder tiles are same size as card tiles in the grid
- [ ] 2×2 thumbnail collage from folder's most recent cards
- [ ] Color dot (7×7 px rounded square) top-left showing `folders.color_hex`
- [ ] Folder name overlay at bottom (gradient scrim behind)
- [ ] Sub-folder tiles appear before card tiles in folder context

### Breadcrumb

- [ ] Breadcrumb hidden at root feed
- [ ] Breadcrumb visible when inside any folder (depth ≥ 1)
- [ ] Folder name replaces logo in top bar when inside folder
- [ ] Color dot + folder name in top bar
- [ ] `⋯` button replaces tags/search icons in top bar when inside folder
- [ ] Back `←` button returns to parent or root
- [ ] Each path segment tappable
- [ ] Middle segments truncated with `…` if path too long

### Card Detail Sheet

- [ ] Opens as bottom sheet (not page navigation)
- [ ] Feed position preserved on dismiss
- [ ] YouTube cards: player chrome (thumbnail, red play button, progress bar, time, fullscreen btn)
- [ ] Fullscreen button: top-right of media area, opens native full-screen
- [ ] **"Open in [platform]"** is the primary CTA: full-width, blue, at top of detail section
- [ ] Meta pills: avg rating · views · shares · direction · sent indicator
- [ ] Rating slider: 0–10 step 0.5, auto-saves on release
- [ ] "Shared with" avatar row shows recipients (if card was shared out)
- [ ] Action grid: Share + Trash only (2 actions)
- [ ] Move to folder / Add to group: long-press context menu only
- [ ] Swipe down dismisses sheet
- [ ] Swipe up expands to near-full-screen

### Sent Indicator

- [ ] Sent indicator = small purple rounded square (9×9 px, top-left of card tile)
- [ ] Visible only when `current_user` has shared this card to ≥1 person
- [ ] Visible in all feed views (icon grid, masonry, list, etc.)
- [ ] Visible in desktop masonry
- [ ] Card detail meta shows "↑ Sent to N" pill (purple) when applicable
- [ ] Card detail "Shared with" section shows recipient avatars

### Desktop

- [ ] Left sidebar: Feed · Folders · Trash nav items at top
- [ ] Sidebar: Friends section (circles with new-activity dot)
- [ ] Sidebar: Groups section (rounded squares) below Friends
- [ ] Sidebar: Folders section (indented sub-folders)
- [ ] Sidebar: Tags section (colored chips)
- [ ] Sidebar bottom: user avatar + name + settings icon
- [ ] Top bar: feed filter tabs (All/Mine/Received) · sort · view toggle icons · bell
- [ ] FAB: fixed bottom-right floating circle (not sidebar button)

### Icons

- [ ] No emoji used anywhere in the application UI
- [ ] All icons are flat SVG stroke-based (feather-style)
- [ ] Tags icon for tag filter; Search icon for search
- [ ] Icons use `currentColor` (themeable)
- [ ] Tag icon badge visible when tags active

---

## 40. CHAT SYSTEM (DEFERRED — LAST PHASE)

Not part of core. Implement only after §29 passes entirely.

---

*End of merged LIKED Unified PRD v26.0*  
