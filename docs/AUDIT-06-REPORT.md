# AUDIT-06 — Full Codebase Audit Report

**Date:** 2026-08-29
**Auditor:** Devin (automated)
**Scope:** Full codebase — `app/`, `lib/`, `components/`, `extension/`, `supabase/migrations/`, `supabase/functions/`
**Build status:** `tsc --noEmit` clean (exit 0), `eslint .` clean (0 errors / 0 warnings)
**Method:** 4 parallel read-only subagents + targeted verification of critical claims
**Status:** Findings reported — fixes not yet applied

---

## Summary

| Severity | Count | Notes |
|----------|-------|-------|
| P0 (Critical) | 0 | No actively-exploitable critical bugs. Two candidate P0s were downgraded after verification (see "Downgraded findings" below). |
| P1 (High) | 11 | Feed invariant violations, non-transactional writes, RLS gaps on active tables, broken deployed RPC, extension permission bug |
| P2 (Medium) | 22 | Client state mirrors, missing indexes, a11y gaps, non-atomic helpers, CORS, unencrypted token storage |
| P3 (Low) | 18 | Dead code, type duplication, hardcoded dev URLs, aria-pressed gaps, raw filter strings |
| **Total** | **51** | |

The codebase builds and lints clean. The biggest risks are concentrated in three areas:
1. **Feed ownership** — the stated "single caller" invariant is broken (`useFeed.ts` is a second `get_feed` caller).
2. **Write atomicity** — auto-folder assignment (Unsorted/YouTube) does raw `folders`/`folder_tree`/`folder_edges` inserts outside the node-creation transaction and without a `cause`.
3. **RLS** — several active tables (`users`, `folder_edges`, `folder_tree`, group tables) still have `USING (true)` SELECT policies exposing them to all authenticated users.

---

## Downgraded findings (verified as non-P0)

Two findings were initially flagged P0 by subagents but downgraded after verification:

### D-1: `create_node` RPC inserts `'created'`/`'owner'` violating CHECK constraints → **P1 (latent, not active)**
- **Claim:** `054_fix_create_node_rpc.sql:93,119` inserts `cause_type='created'` and `permission='owner'`, but `001_initial_schema.sql:44` constrains `cause_type IN ('direct_share','group_share','import')` and `010_unified_permissions.sql:16` constrains `permission IN ('view','comment','contribute','edit','reshare','admin')`. No migration ever alters these CHECKs.
- **Verification:** The app only calls `create_node_with_metadata` (grep confirms: `lib/db/nodes.ts:145`, `app/lib/actions/createNode.ts:12`). That RPC was fixed by `064_add_description_to_create_node.sql:86-102` to use `cause_type='import'` and omit `permission` (defaults to `'view'`). The simpler `create_node` from `054` is deployed to the DB and GRANTed to `authenticated`, but **no app code calls it**.
- **Downgrade reason:** Not actively breaking the app. However, the function is deployed and callable by any authenticated user via PostgREST — calling it raises a CHECK violation error. It is a broken deployed function (dead code in DB). Severity: **P1**.

### D-2: `USING (true)` RLS on `messages`/`group_messages`/`node_messages`/`direct_chats` → **P2 (latent, tables unused)**
- **Claim:** `003_rls_policies.sql:315-352` creates permissive SELECT policies on all four messaging tables.
- **Verification:** Grep for these tables in `*.ts/tsx` returns matches only in `lib/types/database.ts` (generated types). No app code reads/writes messaging tables — the messaging feature is not implemented.
- **Downgrade reason:** No active data exposure (tables are empty/unused). However, if messaging is ever built, these policies are a pre-existing security hole. Severity: **P2**.

---

## P1 — High Priority

### P1-1: `useFeed.ts` is a second `get_feed` caller — feed "single ownership" invariant broken
**File:** `lib/hooks/useFeed.ts:158,212`
**Evidence:**
```ts
// lib/db/feed.ts:8 (the stated invariant)
// - This is the ONLY file that calls get_feed RPC

// lib/hooks/useFeed.ts:158 (violation)
const res = await Promise.resolve(supabaseBrowser.rpc("get_feed", {
  ...feedParams,
  p_cursor_created_at: undefined,
  p_cursor_node_id: undefined,
  p_limit: limit,
}));
```
**Grep proof:** `rg -n '\.rpc\(["'"'"']get_feed' D:/LIKED` returns 3 call sites:
- `lib/db/feed.ts:101` (server, canonical)
- `lib/hooks/useFeed.ts:158` (client, first page)
- `lib/hooks/useFeed.ts:212` (client, pagination)

**Impact:** The client hook bypasses the canonical `getFeed()` wrapper. Server and client follow different code paths to the same RPC. The `FeedNode` type is duplicated (`lib/db/feed.ts:25-50` and `lib/hooks/useFeed.ts:28-54`). If the SQL return table changes, both files must be updated.
**Fix direction:** Either (a) make `useFeed` call a thin server action that wraps `getFeed`, or (b) update the `feed.ts` invariant comment to acknowledge the intentional server/client split and consolidate the `FeedNode` type into one shared file.

### P1-2: `SocialFeedView` merges cards + folders and re-sorts client-side (feed logic leak)
**File:** `app/(app)/feed/_components/SocialFeedView.tsx:97-145`
**Evidence:**
```ts
function mergeTimeline(cards: TimelineItem[], folders: TimelineItem[]): TimelineItem[] {
  return [...cards, ...folders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
// ...
const timeline = useMemo(
  () => mergeTimeline(nodesToTimeline(displayNodes), foldersToTimeline(localFolders)),
  [displayNodes, localFolders]
);
```
**Impact:** The `/social` page fetches cards from `get_feed` (correct) but then merges them with separately-fetched folders and re-sorts the combined timeline in JavaScript. This is post-SQL sorting/merging of feed data. Infinite-scroll pagination operates on this merged set, so cursor logic is also client-derived.
**Fix direction:** Add a `get_social_timeline` RPC that returns cards + folders in one sorted, paginated result; or drop folder merging and keep only `get_feed` data.

### P1-3: `HorizView` filters feed by `activeTag` client-side (feed logic leak)
**File:** `app/(app)/feed/_components/views/HorizView.tsx:193-263`
**Evidence:**
```ts
if (activeTag) {
  const withTag = items.filter((i) => i.tag === activeTag);
  const withoutTag = items.filter((i) => i.tag !== activeTag);
  ...
}
```
**Impact:** Post-SQL filtering of the feed set in TypeScript. The `activeTag` branch explicitly filters the already-fetched feed. (The `mine`/`received` and time-bucket grouping is presentation-only and acceptable.)
**Fix direction:** Pass `activeTag` as a `p_filter_tag_ids` parameter to `get_feed` instead of filtering client-side; remove the `activeTag` filter branch.

### P1-4: `createNodeAction` / `importYouTubeActivity` / `/api/import` do partial non-transactional folder writes
**Files:**
- `app/lib/actions/createNode.ts:153-169`
- `app/lib/actions/youtubeImport.ts:51-104,181-203`
- `app/api/import/route.ts:167-215`
- `lib/db/folders.ts:344-397` (`getOrCreateUnsortedFolder`)

**Evidence (createNode.ts:153-169):**
```ts
const node = await createNode(user.id, ...);
try {
  const unsortedFolderId = await getOrCreateUnsortedFolder(user.id);
  await addNodeToFolder(node.id, unsortedFolderId, user.id);
} catch (folderErr) {
  // Non-fatal: node is created even if folder assignment fails.
  logger.error("Failed to auto-assign node to Unsorted folder:", folderErr);
}
```
**Evidence (folders.ts:344-397 — `getOrCreateUnsortedFolder`):**
```ts
const { data: created } = await supabase.from("folders").insert({ ... }).select("id").single();
// ...
await supabase.from("folder_tree").insert({ folder_id: folderId, ancestor_id: folderId, depth: 0 });
```
**Impact:** The node is created in one RPC, then the folder is found/created and linked in separate calls. If folder assignment fails, the node exists without a folder. `getOrCreateUnsortedFolder` does raw `folders` + `folder_tree` inserts with **no `cause` and no `edges`** — violating the PRD write rule (every write creates a cause + edges in one transaction). The `youtubeImport` path has the same pattern for the "YouTube" folder.
**Fix direction:** Move auto-folder assignment into `create_node_with_metadata` / `import_url` RPCs (accept `auto_folder_name`, perform folder creation + edge insertion inside the same Postgres transaction with a cause).

### P1-5: `dndMoveNodeToFolder` and `dndAutoCreateFolder` are not atomic
**File:** `app/lib/actions/dnd.ts:83-101,150-172`
**Evidence:**
```ts
// dndMoveNodeToFolder (83-101)
await addNodeToFolder(nodeId, targetFolderId, user.id);
if (sourceFolderId && sourceFolderId !== targetFolderId) {
  await removeNodeFromFolder(nodeId, sourceFolderId, user.id);
}
// dndAutoCreateFolder (150-172)
const folder = await createFolder({ name: trimmed, parentFolderId: null });
for (const nodeId of nodeIds) {
  await addNodeToFolder(nodeId, folder.id, ownerId);
}
```
**Impact:** A failure between add and remove can leave a node in two folders. A failure mid-loop in auto-create leaves some nodes moved and some not. No single "move" transaction RPC exists.
**Fix direction:** Add `move_node_to_folder` and `create_folder_with_nodes` RPCs so each DnD operation is one transaction.

### P1-6: `create_node` RPC (054) is deployed but broken — inserts values violating CHECK constraints
**File:** `supabase/migrations/054_fix_create_node_rpc.sql:93,119`
**Evidence:**
```sql
-- 054_fix_create_node_rpc.sql:93
'created',            -- NOT in causes.cause_type CHECK ('direct_share','group_share','import')
-- 054_fix_create_node_rpc.sql:119
'owner',              -- NOT in edges.permission CHECK ('view','comment','contribute','edit','reshare','admin')
```
**Verification:** `001_initial_schema.sql:44` and `010_unified_permissions.sql:16` define the CHECKs. No migration alters them. The function is `GRANT`ed to `authenticated` and `service_role`. App code does not call it (uses `create_node_with_metadata` instead).
**Impact:** Any authenticated user can call `create_node` via PostgREST and trigger a CHECK violation error. Latent broken function in the DB.
**Fix direction:** `DROP FUNCTION create_node(UUID, ...)` (the simple overload) in a new migration, since it is unused; or fix it to use `'import'` and `'view'` like `064` does for `create_node_with_metadata`.

### P1-7: RLS `USING (true)` SELECT policies on active tables
**File:** `supabase/migrations/003_rls_policies.sql` (and `012_restore_admin_tables.sql`)
**Active tables with permissive SELECT (still in final state):**
| Table | Policy | File:Lines |
|---|---|---|
| `users` | `users_select_all` | `003:62-66` |
| `folder_edges` | `folder_edges_select_authenticated` | `003:121-125` |
| `folder_tree` | `folder_tree_select_authenticated` | `003:132-136` |
| `folder_admins` | `folder_admins_select_authenticated` | `003:143-147`, `012:18` |
| `group_nodes` | `group_nodes_select_authenticated` | `003:171-175` |
| `group_members` | `group_members_select_authenticated` | `003:182-186` |
| `group_admins` | `group_admins_select_authenticated` | `003:193-197`, `012:19` |

**Evidence:**
```sql
CREATE POLICY "users_select_all" ON users FOR SELECT TO authenticated USING (true);
```
**Impact:** Any authenticated user can read every `users` row (all profiles), every folder-to-node link (`folder_edges`), the full folder hierarchy (`folder_tree`), all group memberships/admin grants, and all folder admin grants. This bypasses the visibility model that should be edges-based.
**Fix direction:** Replace with scoped policies (e.g. `users` readable only by friends via `edges`; `folder_edges`/`folder_tree` readable only by owner or users with a share edge to the folder).

### P1-8: `076_auto_unsorted_folder.sql` backfill writes without cause/edges
**File:** `supabase/migrations/076_auto_unsorted_folder.sql:15-62`
**Impact:** One-shot data fix that writes to `folders`, `folder_tree`, and `folder_edges` for every orphaned node without creating `causes`/`edges`. Not wrapped in an explicit transaction guard. Already applied (historical), but the pattern is inconsistent with the write system.
**Fix direction:** No action needed for the backfill itself (already run), but ensure future backfills follow the cause→edges rule.

### P1-9: `create_folder` has two unreconciled overloads (one non-deterministic)
**Files:** `010_unified_permissions.sql:441-543` and `057_fix_folder_color_determinism.sql:12-69`
**Evidence:**
```sql
-- 010_unified_permissions.sql:469-493 (old overload, still reachable)
SELECT color_hex FROM (...) palette ORDER BY random() LIMIT 1;  -- non-deterministic

-- 057_fix_folder_color_determinism.sql:12 (new overload, does NOT drop the old one)
CREATE OR REPLACE FUNCTION create_folder(p_name TEXT, p_parent_folder_id UUID DEFAULT NULL)
```
**Impact:** `057` does not `DROP FUNCTION` the older 3-parameter overload (`create_folder(UUID, TEXT, UUID)`), so both remain reachable. The older version uses `ORDER BY random()` for color selection — non-deterministic, violating the LIKED determinism rule.
**Fix direction:** Add a migration that `DROP FUNCTION IF EXISTS create_folder(UUID, TEXT, UUID)` to remove the non-deterministic overload.

### P1-10: Chrome extension reads `tab.url`/`favIconUrl` without `tabs` permission
**File:** `extension/src/popup/popup.ts:93-101`
**Evidence:**
```ts
async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  // ... uses tab.url and tab.favIconUrl
}
```
**Manifest:** `extension/manifest.json` requests only `"activeTab"` and `"storage"`. `activeTab` does **not** grant access to `tab.url`/`tab.favIconUrl` from `chrome.tabs.query`; the `tabs` permission is required for those fields.
**Impact:** The popup may receive `undefined` for `url`/`favIconUrl` and fail to save the page. Behavior depends on Chrome version and transient grants.
**Fix direction:** Either add `"tabs"` permission to the manifest (broader access — review privacy implications) or use `chrome.scripting`/activeTab-granted tab details from the action click context.

### P1-11: `getFolderTree` implements visibility/sharing logic in TypeScript using the service client
**File:** `lib/db/folders.ts:217-305`
**Evidence:**
```ts
const [userEdgesResult, sharedCausesResult] = await Promise.all([
  supabase.from("edges").select("cause_id").eq("user_id", userId),
  supabase.from("causes").select("id, metadata").eq("cause_type", "direct_share")...
]);
// ... in-memory join, dedup, sort
const userCauseIds = new Set((userEdges ?? []).map(e => e.cause_id));
const folderIdsWithAccess: string[] = [];
for (const cause of sharedCauses ?? []) { ... }
```
**Impact:** Joins edges/causes and deduplicates/sorts the folder tree in client memory. Visibility and membership should be one SQL/RPC. Uses the service client (bypasses RLS) for a user-scoped visibility query, increasing the blast radius of a bug in the manual filter.
**Fix direction:** Add a `get_folder_tree` RPC that returns the visible folder tree for a user in one query; stop using the service client for user-scoped reads.

---

## P2 — Medium Priority

### P2-1: `SortableNodeGrid` reorders feed nodes from a local store
**File:** `app/(app)/feed/_components/SortableNodeGrid.tsx:121-137`
**Evidence:** Merges `storedOrder` (from `useFeedStore` localStorage/Zustand) with `useFeed` nodes to compute the final visible order in JS — a client-side reordering source separate from `get_feed`.

### P2-2: `FeedGrid` filters the folder list client-side
**File:** `app/(app)/feed/_components/FeedGrid.tsx:237-242`
**Evidence:** `localFolders.filter(f => f.parent_folder_id === activeFolderId)` — folder hierarchy filtering in TypeScript rather than via a folder-tree RPC.

### P2-3: `SocialFeedView` overlays client-side folder state (second source of truth)
**File:** `app/(app)/feed/_components/SocialFeedView.tsx:131-228`
**Evidence:** Folders hydrated from server props, then overwritten by a direct `supabaseBrowser.from("folders")` query, then counted from `folder_edges` — a client-owned copy of folder state.

### P2-4: `FeedGrid` mutates local folder state optimistically
**File:** `app/(app)/feed/_components/FeedGrid.tsx:91,214-216,387-393`
**Evidence:** `setLocalFolders(prev => prev.filter(...))` on delete, `setLocalFolders(prev => prev.map(...))` on rename, then `refresh()` — window where UI and DB disagree.

### P2-5: `CardDetailSheet` keeps mutable local copy of DB detail record
**File:** `components/modals/CardDetailSheet.tsx:81-100,225-237`
**Evidence:** `setDetail((prev) => prev ? { ...prev, tags: prev.tags.filter(...) } : prev)` — tag removal/rating changes derived from local state, not re-fetched after mutation.

### P2-6: `NotificationPanel` mutates read-state locally without revalidation
**File:** `components/modals/NotificationPanel.tsx:19-52`
**Evidence:** `setNotifications((prev) => prev.map(...))` after `markNotificationReadAction` — if the action fails, UI still shows read.

### P2-7: RLS `USING (true)` on reference/messaging tables (latent)
**File:** `supabase/migrations/003_rls_policies.sql:79-352`
**Tables:** `ratings`, `nodes_sort_cache`, `tags`, `tag_translations`, `tag_edges`, `translations`, `external_sources`, `external_items_map`, `direct_chats`, `messages`, `group_messages`, `node_messages`.
**Impact:** Reference data (tags/translations) exposure is arguably intentional (public read). Messaging tables are unused but have permissive policies — a pre-existing hole if messaging is built.

### P2-8: Missing indexes on frequently-queried columns
**File:** `supabase/migrations/001_initial_schema.sql` (and others)
**Missing indexes:**
- `causes(created_by)` — used by `causes_select_policy` and `unshare`
- `groups(owner_id)`, `group_members(user_id)`, `group_admins(user_id)`, `folder_admins(user_id)`
- `direct_chats(user_1_id, user_2_id)`, `messages(chat_id)`, `messages(sender_id)`
- `group_messages(group_id)`, `group_messages(sender_id)`, `node_messages(node_id)`, `node_messages(sender_id)`
- `activity_log(user_id, action, created_at)` — used by Edge Function rate-limit query (`_rateLimit.ts:9-14`)

### P2-9: `getOrCreateUnsortedFolder` is non-atomic (two separate inserts)
**File:** `lib/db/folders.ts:344-397`
**Evidence:** `folders` insert then `folder_tree` insert as separate statements. If `folder_tree` fails, the `folders` row is committed without its self-reference.

### P2-10: `createOrGetTag` is non-atomic (lookup → RPC → fetch)
**File:** `lib/db/tags.ts:82-142`
**Impact:** Two tags with the same normalized label can be created between the lookup and the insert.

### P2-11: `getUserFolders` computes counts/thumbnails/subfolder counts in TypeScript
**File:** `lib/db/folders.ts:50-138`
**Impact:** Batched `IN` queries followed by in-memory aggregation — view-layer computation that should be a `get_user_folders` RPC.

### P2-12: Custom sort order is stored but never passed to the feed query
**Files:** `lib/store/feedStore.ts:10-66`, `lib/db/nodePreferences.ts:48-67`
**Evidence:** `setCustomOrder` sets `sort="custom"` in the filter store, but `buildFeedParams` does not include the custom order, and `getCustomOrder` is never called anywhere. Setting `sort=custom` with no order list means the SQL cannot apply the intended sort.
**Impact:** Custom sort feature is disconnected — client cache exists but no wired DB path.

### P2-13: `hardDeleteNode` is not a single transaction
**File:** `lib/db/nodes.ts:317-347`
**Evidence:** Fetches node, checks `deleted_at`/`owner_id`, then issues a separate `delete`. Permission/row state can change between the two calls.

### P2-14: `add_node_to_folder` / `remove_node_from_folder` RPCs write without cause/edges
**File:** `supabase/migrations/036_folder_write_rpcs.sql:8-43`
**Evidence:** `add_node_to_folder` inserts `folder_edges` with no `causes`/`edges` row. `remove_node_from_folder` does a direct `DELETE FROM folder_edges` — not a cascade delete (PRD: "deletion = cascade only").

### P2-15: Most parent-delete FKs do not cascade
**File:** `supabase/migrations/001_initial_schema.sql`
**Evidence:** `nodes.owner_id`, `edges.node_id`, `edges.user_id`, `causes.created_by`, `folders.owner_id`, `messages.chat_id` all use default `NO ACTION`. `friend_invites.to_user_id` uses `ON DELETE SET NULL`.
**Impact:** Deleting a user/node/chat is blocked by FKs rather than cascading — contradicts PRD "deletion = cascade only."

### P2-16: Edge Function CORS sets empty `Access-Control-Allow-Origin` for disallowed origins
**File:** `supabase/functions/extract-node-metadata/_cors.ts:4-21`
**Evidence:** `allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ""` — empty string is not a valid CORS value. No `Vary: Origin` header.

### P2-17: Edge Function rate limiter fails open
**File:** `supabase/functions/extract-node-metadata/_rateLimit.ts:1-17`
**Evidence:** `if (error) return false;` — if the `count` query errors, the call is allowed. Combined with the unindexed `activity_log` query (P2-8), this is a soft rate limit.

### P2-18: `CardDetailMedia` renders untrusted URLs in `<audio>`/`<video>`; `detectEmbed` can return `javascript:` src
**Files:** `components/modals/CardDetailSheet/CardDetailMedia.tsx:47-83`, `components/modals/CardDetailSheet/detectEmbed.ts:100-105`
**Evidence:** `detectEmbed` generic branch returns `src: url` without scheme validation. `new URL("javascript:alert(1)")` does not throw, so `src` can be a `javascript:` URI. `<audio>`/`<video>` accept any `src` from the generic branch.
**Impact:** Currently the iframe only receives YouTube/Spotify/Vimeo embeds, but `<audio>`/`<video>` load arbitrary `src`. Any future code rendering `embed.src` as `href`/`src` would be XSS.

### P2-19: Chrome extension stores session tokens unencrypted in `chrome.storage.local`
**File:** `extension/src/auth/session.ts:49-51`
**Evidence:** `await chrome.storage.local.set({ [LIKED_SESSION_KEY]: session })` — access/refresh tokens written without encryption. Readable by other processes/extensions on a shared machine.

### P2-20: `session.ts` `refreshAccessToken` casts unvalidated JSON
**File:** `extension/src/auth/session.ts:83-87`
**Evidence:** `const data = (await res.json().catch(() => null)) as { access_token?: ... }` — no runtime validation; a malformed/MITM response can store invalid token data.

### P2-21: Extension manifest missing explicit `content_security_policy`
**File:** `extension/manifest.json`
**Impact:** MV3 default CSP applies, but no strict explicit CSP guards against future changes that insert remote HTML/JS.

### P2-22: `BottomBarAvatar` is a non-semantic, inaccessible drag/drop/click element
**File:** `components/bars/BottomBarAvatar.tsx:166-183`
**Evidence:** `<div>` handling click, drag, long-press, and drop with no `role`, `tabIndex`, or `aria-label`. Also combines `useDraggable` + `useDroppable` on the same DOM node (dnd-kit does not officially support this).

---

## P3 — Low Priority

### P3-1: `getUserFoldersAction` does not call `getUser()` at the top level
**File:** `app/lib/actions/getFolders.ts:6-18` — delegates auth to `getUserFolders()` helper (which does call `getUser()`). Safe but does not meet the self-contained auth rule.

### P3-2: `/api/auth/signout` does not explicitly verify the caller
**File:** `app/api/auth/signout/route.ts:5-36` — Supabase client validates cookie internally, but handler does not call `getUser()`.

### P3-3: OAuth callbacks ignore upsert errors
**Files:** `app/(auth)/callback/route.ts:55-62`, `app/api/youtube/callback/route.ts:61-66` — `await supabase.from("users").upsert(...)` without checking `error`.

### P3-4: Silent error swallowing in `SocialFeedView`, `FreeGrid`, YouTube page
**Files:** `SocialFeedView.tsx:186-228`, `FreeGrid.tsx:90-94`, `youtube/page.tsx` (multiple) — empty `catch` blocks with no `logger.error`.

### P3-5: `CardMenu` trigger is a `<span role="button">` not a native `<button>`
**File:** `components/modals/CardMenu.tsx:97-103` — relies on `role`+`tabIndex`; missing `aria-controls`, `aria-activedescendant`; menu items use array index as `key`; popover height estimated not measured.

### P3-6: `DroppableFolderChip` blocks self-drop but not ancestor/descendant cycles
**File:** `components/dnd/DroppableFolderChip.tsx:21-27` — server-side cycle prevention exists, but client does not pre-validate ancestry (misleading UX, avoidable round trips).

### P3-7: `AutoCreatePrompt` Escape handler on a non-focusable div
**File:** `components/dnd/AutoCreatePrompt.tsx:79-89` — `onKeyDown` on backdrop `<div>` with no `tabIndex`/`role="dialog"`/`aria-modal`.

### P3-8: `NotificationPanel` rows are clickable `<div>`s; close button has no `aria-label`
**File:** `components/modals/NotificationPanel.tsx:115-133,168-202` — no `role`/`tabIndex`/keyboard handler on rows; icon-only close button unlabeled.

### P3-9: `TagsStrip` / `AddTagModal` / `FeedTabs` / `MineSubTabs` lack `aria-pressed`/`aria-selected`
**Files:** `components/bars/TagsStrip.tsx:186-227`, `components/modals/AddTagModal.tsx:177-203`, `components/bars/FeedTabs.tsx:22-29`, `components/bars/MineSubTabs.tsx:23-31`

### P3-10: `BottomBarAvatar` uses `window.confirm` for destructive action
**File:** `components/bars/BottomBarAvatar.tsx:130-134` — blocking browser dialog, inconsistent a11y, not stylable.

### P3-11: Extension popup uses plain `<img>` for favicon without scheme validation
**File:** `extension/src/popup/popup.ts:226-227` — loads arbitrary `favIconUrl`.

### P3-12: Extension service-worker origin check uses `startsWith`
**File:** `extension/src/background/service-worker.ts:35-37` — less robust than `URL`-based validation.

### P3-13: Hardcoded dev URLs in extension manifest and fallback code
**Files:** `extension/manifest.json:9-12`, `extension/src/api/liked-client.ts:20`, `extension/src/popup/popup.ts:34`, `app/extension/auth/page.tsx:67-68`

### P3-14: Multiple `as unknown as` casts suppress generated DB types
**Files:** `lib/db/feed.ts:121`, `lib/hooks/useFeed.ts:165,219`, `lib/db/folders.ts:114`, `lib/db/tags.ts` (6 sites), `lib/db/cardDetail.ts:80,183`, `lib/db/nodePreferences.ts:59`, `lib/db/ratings.ts:76`

### P3-15: Dead code — unused exports
**Files:** `lib/db/permissions.ts:190-196,217-232` (`checkPermission`, `assertNodePermission`), `lib/dnd/types.ts:20-31` (`DND_SOURCE_PREFIX`, `DND_TARGET_PREFIX`), `lib/utils/tagColors.ts:32-48` (`getNextTagColor`, `getTagColorWithOpacity`)

### P3-16: `lib/types/app.ts` duplicates DB types
**File:** `lib/types/app.ts:25-28,55-61,97-102` — `NodeInput`, `Cause`, `Group` live alongside identically-named types in `lib/db/*.ts`.

### P3-17: `removeFriend` constructs a raw PostgREST filter string
**File:** `lib/db/friends.ts:117-122` — `.or(\`and(from_user_id.eq.${...}),and(...)\`)` — raw filter construction.

### P3-18: `unshare` parses error messages instead of error codes
**File:** `lib/db/sharing.ts:104-111` — `if (error.message.includes("not found"))` — fragile; message text may change.

---

## Verified Safe (No Action Needed)

- **tsc / eslint:** Both clean (exit 0, 0 errors/warnings).
- **`dangerouslySetInnerHTML`:** 0 matches in `app/`, `components/`, `extension/src/`.
- **`<img>` in Next app:** 0 matches — `next/image` used. (Extension popup `<img>` is P3-11.)
- **Raw SQL concatenation in TypeScript:** 0 — all DB access uses Supabase query builders / named RPCs.
- **Hardcoded secrets:** 0 — all credentials from `process.env`.
- **SQL injection in Edge Functions:** 0 — `extract-node-metadata/` uses parameterized Supabase client methods.
- **Server action auth:** All 20 actions in `app/lib/actions/` use `getUser()` or `requireUserId()` (P3-1 is a style issue, not a hole). `createNode.ts`/`youtubeImport.ts` call `getSession()` only for `access_token`/`provider_token` after `getUser()` — safe.
- **API route auth:** All routes authenticate via `getUser()` or bearer-token client (P3-2 is signout, low risk).
- **`get_feed` RPC:** Defined at `051_restore_get_feed.sql:8-71` (15 params). Old overload dropped by `063`. No SQL-correctness assessment (per rules).
- **CSP header:** Present in `next.config.ts` (added in AUDIT-04).
- **`revalidatePath`:** Called by all write actions.

---

## Recommended Fix Order

### Phase 1 — Architecture invariants (high impact)
1. **P1-1:** Consolidate feed ownership — either route `useFeed` through `getFeed` or update the invariant + share the `FeedNode` type.
2. **P1-4 / P1-5:** Move auto-folder assignment and DnD moves into single-transaction RPCs with causes.
3. **P1-7:** Scope the `USING (true)` SELECT policies on `users`, `folder_edges`, `folder_tree`, group tables.
4. **P1-6:** Drop or fix the broken `create_node` RPC (054).
5. **P1-9:** Drop the non-deterministic `create_folder` overload (010).

### Phase 2 — Feed logic leaks (high impact)
6. **P1-2:** Replace `SocialFeedView` client-side merge/sort with a `get_social_timeline` RPC (or drop folder merging).
7. **P1-3:** Pass `activeTag` to `get_feed` via `p_filter_tag_ids`; remove the `HorizView` client-side filter branch.
8. **P1-11:** Replace `getFolderTree` TS visibility logic with a `get_folder_tree` RPC; stop using the service client for user-scoped reads.

### Phase 3 — Extension + medium items
9. **P1-10:** Fix extension `tab.url`/`favIconUrl` permission.
10. **P2-12:** Wire custom sort order through to `get_feed` or remove the dead feature.
11. **P2-8:** Add missing indexes (especially `activity_log` for rate limiting).
12. **P2-18:** Sanitize `detectEmbed` src (reject `javascript:`/`data:` schemes).

### Phase 4 — Polish (P2/P3)
13. Client state mirrors (P2-3/4/5/6), a11y gaps (P3-5/7/8/9), error handling (P3-3/4), dead code (P3-15).

---

## Previous Audit Status

- **AUDIT-04:** All P0 (6) and P1 (14) fixed. ✅
- **AUDIT-05:** 0 P0, 5 P1, 8 P2, 7 P3 — all 18 actionable items fixed. ✅
- **AUDIT-06 (this report):** 0 P0, 11 P1, 22 P2, 18 P3 — findings reported, fixes not yet applied.

**Note:** AUDIT-05 reported "ALL FINDINGS RESOLVED" on 2025-11-22. Since then, 9 commits added new features (social feed, bulk YouTube import, folder nesting, portal menus) that introduced the new P1 findings in this report. The AUDIT-05 findings themselves remain resolved.
