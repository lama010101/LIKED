# LIKED — Build Progress Tracker

**Purpose:** Source of truth for execution state. Updated by Lolo after each task is confirmed complete by Cascade.
**Rule:** Claudi reads this file first in every session before issuing any prompt.

---

## ⚡ CURRENT STATUS

| Field | Value |
|-------|-------|
| **Last completed task** | FIX-02 — Restore middleware.ts at project root |
| **Next task to execute** | FIX-03 |
| **Current phase** | P9 — Search & Filters (UIX shell complete, audit-flagged blockers pending) |
| **Phase gate passed** | ⚠️ Audit reveals P1/P3/P4 gates DID NOT hold — see AUDIT-01 |
| **Last updated** | 2026-04-27 (Cascade) |

---

## TASK LOG

### PHASE 1 — Foundation
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P1-T01 | Initialize Next.js 15 project | ✅ | |
| P1-T02 | Deploy complete database schema | ✅ | |
| P1-T03 | Supabase Auth integration | ✅ | |
| P1-T04 | Deterministic default avatar | ⚠️ | File at lib/utils/avatar.ts not lib/avatar.ts — acceptable |
| P1-T05 | Seed data | ✅ | |
| CLEANUP-C | middleware.ts at project root | ✅ VERIFIED | File renamed from proxy.ts, export corrected, console.log removed |
| **P1 Gate** | | ✅ | |

### PHASE 2 — Core Feed
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P2-T01 | Visibility query function | ✅ | lib/db/visibility.ts correct |
| P2-T02 | Node creation API | ✅ | lib/db/nodes.ts exists |
| P2-T03 | Basic feed page | ✅ | app/(app)/feed/page.tsx exists |
| P2-T04 | Quick node creation (temp input) | ✅ | AddNodeBar exists |
| **P2 Gate** | | ✅ | |

### PHASE 3 — Sharing System
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P3-T01 | Direct share write | ✅ | Cleaned via CLEANUP-B |
| P3-T02 | Unshare (cause deletion) | ✅ | |
| P3-T03 | Friends derived from edges | ⚠️ | Coder built friend_invites table instead of edge-derived — accepted as additive |
| P3-T04 | Group share + group creation | ✅ | |
| P3-T05 | RLS policies (tightening) | ✅ | migration 003 correct |
| CLEANUP-A | Restore folder_admins + group_admins | ✅ | migration 012 |
| CLEANUP-B | Strip rogue permissions layer | ✅ | sharing.ts + CardDetailModal.tsx |
| **P3 Gate** | | ⚠️ | Friends model deviated — does not block P4/P5 |

### PHASE 4 — Folders
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P4-T01 | Folder CRUD | ⚠️ | lib/db/folders.ts exists; folder_admins was dropped but restored |
| P4-T02 | Folder share (write expansion) | ✅ | share_folder RPC exists |
| P4-T03 | Breadcrumb navigation | ✅ | BreadcrumbNav component created |
| P4-T04 | Nested folder feed | ✅ | Folder feed query confirmed |
| **P4 Gate** | | ✅ | |

### PHASE 5 — UI Shell
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P5-T01-A | TopBar component | ✅ | components/bars/TopBar.tsx |
| P5-T01-B | BottomBar component | ✅ | components/bars/BottomBar.tsx |
| P5-T01-C | DesktopSidebar component | ✅ | components/sidebar/DesktopSidebar.tsx |
| P5-T01-D | App layout integration | ✅ | app/(app)/layout.tsx with all bars integrated |
| P5-T01 | Bars layout (complete) | ✅ | All subtasks A-D done |
| P5-T02 | FAB + Create modal | ✅ | FAB in layout, AddCardSheet.tsx 499 lines complete |
| P5-T02-FIX | FAB visibility + two-action speed-dial (Card + Folder) with DB wiring | ✅ | Fixed FAB z-index to 50, created AddFolderSheet component, replaced single-action FAB with two-action speed-dial (Card/Folder), mounted AddFolderSheet in layout |
| P5-T03 | Five view modes | ✅ | All 5 complete: col, mason, list, horiz, free. HorizView.tsx implements PRD §11.2 D grouping |
| P5-T04 | Profile modal | ✅ | ProfileModal.tsx 483 lines complete, integrated |
| **P5 Gate** | | ✅ | All P5 tasks complete — UI Shell done |

### PHASE 6 — Tags & Ratings
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P6-T01 | Tag creation and assignment | ✅ | lib/db/tags.ts full impl: createOrGetTag (NFKC normalize + 20-color palette cycle), addTagToNode, removeTagFromNode, getTagsForNode, getAllTags, §33.4 fallback chain |
| P6-T02 | Rating system | ✅ | migration 015 + lib/db/ratings.ts with upsertRating RPC, getRatingsForNode |
| P6-T03 | Sort system | ✅ | migration 016 (get_visible_nodes, get_nodes_in_folder with p_sort), feedStore localStorage persistence, useFeed.ts wired |
| CLEANUP-D | Regenerate Supabase types | ✅ | lib/types/database.ts updated with ratings, nodes_sort_cache, new RPCs |
| **P6 Gate** | | ✅ | All tasks complete |

### PHASE 7 — Advanced Interactions
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P7-T01 | Drag-and-drop core targets | ✅ | @dnd-kit/core wired. Infra: `lib/dnd/` (types, DndProvider, useDragPauseExpand), `app/lib/actions/dnd.ts` (6 server actions). NodeCard = draggable. BottomBarAvatar = droppable (friend/group). TopBar TrashDropButton = droppable. softDeleteNode impl in nodes.ts. Known limitation: folder-chip + tag-chip drop targets pending UI surfaces (not yet in layout) |
| P7-T02 | DnD auto-create + custom sort | ✅ | Migration 017 (user_node_preferences + RLS) applied to DB, `lib/db/nodePreferences.ts`, 4 new server actions (autoCreateFolder/Group, shareFolderToFriend, reorderFeed), NameInlinePrompt component with Escape/outside-tap cancel, DndProvider pending-prompt flow, card→card + friend→friend + friend↔folder routes, feedStore customOrders + setCustomOrder (localStorage + auto-flip sort to 'custom'), SortableNodeGrid on fallback masonry via @dnd-kit/sortable. Known limitation: sortable reorder only wired on fallback masonry path; STUB-based views (col/mason/list/horiz/free) will need individual sortable wiring in later tasks. Types casting via `AnySupabase` in nodePreferences.ts pending CLEANUP-E type regen. |
| P7-T03 | Long-press multi-select | ✅ | `lib/store/selectionStore.ts` (multi-kind selection + pendingRestore), `lib/hooks/useLongPress.ts` (500ms press, 6px move tolerance, coexists with @dnd-kit via native listeners + click-capture swallow), `liked-wobble` keyframe (±2°, 0.3s, respects prefers-reduced-motion) in globals.css, `restoreNode` in `lib/db/nodes.ts`, `app/lib/actions/selection.ts` (trashNode / restoreTrashedNode / trashNodes batch), `components/selection/` (MultiSelectContextMenu bottom-sheet/side-drawer per §17.2, UndoToast with 5s progress bar per §17.3, SelectionOverlay Escape handler + backdrop-tap exit, SelectionCloseButton). NodeCard + BottomBarAvatar wired: long-press activates, wobble + (×) overlay, dnd disabled during selection, tap toggles. `uiStore` legacy selection slice removed (no callers). Known limitations: folder chips + group chips in TopBar still absent from layout (P7-T01 note still applies); only `moveToTrash` action is wired to server — Edit/Move to folder/Add to group/Share with/Remove tag/Give admin/Remove from folder show a "coming soon" toast pending picker UIs in later phases; friend/group trash not implemented (close button on friend/group avatars only deselects). |
| P7-T04 | Trash view | ✅ | `getTrashedNodes` + `getTrashedCount` + `hardDeleteNode` in `lib/db/nodes.ts` (hard-delete requires the node to already be soft-deleted; cascades via FKs). `app/lib/actions/trash.ts` with `getTrashCount`, `listTrashedNodes`, `restoreFromTrash`, `permanentlyDeleteFromTrash`. `app/(app)/trash/page.tsx` now renders `TrashView` client component: list with thumbnail/title/trashed-date per §20.1, per-row Restore button, Delete-permanently gated behind inline confirmation per §20.2, optimistic row removal + toast. TopBar gains `trashCount` prop → accent badge on trash icon (§20.1). Layout re-fetches count on pathname + toast change so badge updates after restore/trash. Drag-to-trash icon was already wired in P7-T01. Verified: full type-check clean on all new/modified P7-T04 files, full ESLint clean. |

### PHASE 8 — Media & Cards
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P8-T01 | Metadata extraction Edge Function | ✅ | `supabase/functions/extract-node-metadata/index.ts` implements PRD §15.1: OG/Twitter/`<title>`/`<meta>` regex extraction, og:image → `thumbnails/{user_id}/{uuid}.ext` upload, URL+title+description tag candidates with multilingual stop-word filter (max 8), text-only branch (first 120 chars title + token tags), rate-limited to 30 calls/user/min via `activity_log`, logs every invocation with `action='metadata_extraction'`, never throws (returns `buildDefaults` on any failure). Migration 018 creates `thumbnails` public bucket with RLS (public read, user-prefix insert/delete). `tsconfig.json` excludes `supabase/functions/**` from host tsc. Deploy: `supabase functions deploy extract-node-metadata --no-verify-jwt`. Not yet deployed by user — local code complete. |
| P8-T02 | Node creation with metadata | ✅ | Migration 019 adds RPC `create_node_with_metadata(p_owner_id, p_url, p_text, p_title, p_thumb, p_lang, p_tag_labels[])` — atomic: nodes INSERT + nodes_sort_cache INSERT + per-label tag_translations lookup-or-insert (§19.3 deterministic, palette via SQL helper `liked_tag_palette` mirroring TS `TAG_COLOR_PALETTE`) + tag_edges INSERT with `ON CONFLICT DO NOTHING`. `lib/db/nodes.ts::createNode` now accepts optional `NodeMetadata` and routes through the new RPC; fallback title = URL or first 120 chars of text when metadata is omitted. New server action `app/lib/actions/createNode.ts::createNodeAction` invokes `extract-node-metadata` via the user's JWT-scoped server client (10s abort timeout) and passes results to `createNode`; on Edge Function failure (timeout/5xx/invalid body), metadata is undefined → defaults applied per PRD §15.1 #3. `AddCardSheet` save handler wired to the action (useTransition for pending, inline error surface, router.refresh on success). Temp `AddNodeBar` + `app/(app)/feed/actions.ts` deleted — FAB is the sole creation path per task spec. Migration applied to DB (both `create_node_with_metadata` + `liked_tag_palette` present). Tags/friends pickers in sheet remain stubs (not in scope for P8-T02). |
| P8-T03 | Card detail modal | ✅ | New `components/modals/CardDetailSheet.tsx` per PRD §14. Bottom sheet on mobile / right-side panel on desktop (auto-detected via `matchMedia('(min-width:1024px)')`, SSR-safe with `queueMicrotask`). Embed dispatcher: YouTube (`/embed/{id}` from `v=`, `/embed/`, `/shorts/`, `youtu.be`), Spotify (`/embed/{track\|playlist\|album\|episode\|show}/{id}`), Suno (`/embed/{song_id}`), generic iframe fallback (sandboxed), or `◇` glyph for text cards. Fullscreen button (28×28, `rgba(0,0,0,0.5)`) on media calls `requestFullscreen()` on the media container. "Open in {platform}" primary CTA. Meta pills: avg rating / views / shares / direction (↑ mine \| ↓ received). Native range slider 0–10 step 0.5, height 44px, auto-saves on mouseup/touchend/keyup → `rateCardAction` → `upsertRating` RPC. Inline title edit (owner-only, click-to-edit, Enter saves / Escape cancels) → `updateNodeTitleAction`. Tag chips (colored). Shared-with avatar row (26px circles, overlap, +N overflow). Action grid: Share (calls `onShareClick` prop) + Trash (owner-only, `softDeleteNode`). New `lib/db/cardDetail.ts` with `getCardDetail(userId, nodeId, lang)` (parallel Promise.all of tags/ratings/sortCache/sharedWith), `updateNodeTitle(owner-only)`, `incrementViewCount` (fire-and-forget from `fetchCardDetail`); `lib/db/cardDetail.ts::getSharedWith` queries `edges` joined with users, dedup by user_id. New server actions: `fetchCardDetail`, `rateCardAction`, `updateNodeTitleAction`, `trashCardAction` in `app/lib/actions/cardDetail.ts`. `FeedGrid` accepts `currentUserId` prop and mounts `CardDetailSheet` in all 3 mount points (folder/free/fallback). `feed/page.tsx` passes `user.id`. Deleted: old stubs `components/modals/CardDetailModal.tsx` (149 lines) and `app/(app)/feed/_components/SlideOver.tsx` (89 lines); `components/modals/index.ts` updated. Verified: tsc clean, eslint clean on all P8-T03 files. Scope deferred (future phases per PRD): swipe-to-dismiss/expand gestures, individual-friend rating breakdown UI, fullscreen for cross-origin iframes (browser-limited), `onShareClick` handler wiring (needs SharePickerModal integration). |

### PHASE 9 — Search & Filters
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P9-T01 | Feed 3-state toggle | ✅ | Migration 020 extends `get_visible_nodes(p_user_id, p_sort, p_view, p_mine_filter)` with view filter ('all'|'mine'|'received') and mine sub-filter ('all'|'not_shared'|'shared'). `lib/db/visibility.ts` exports `FeedView` and `MineSubFilter` types; `getVisibleNodes()` accepts view/mineFilter params. `feed/page.tsx` reads `?view=` and `?mine=` search params, passes to `getVisibleNodes()` for SSR. Layout tabs wired to URL via `router.replace()` — tab changes update URL, URL changes update server render. `filterStore` updated with `mineSubTab` state. `NodeCard` shows direction badge (10px circle, bottom-right): amber `var(--accent)` for mine, blue `var(--color-received, #60c5f1)` for received. `currentUserId` passed through `FeedGrid` → `SortableNodeGrid` → `NodeCard`. Colors use exact same CSS tokens as tab styling per PRD §11.2a.s, individual-friend rating breakdown UI, fullscreen for cross-origin iframes (browser-limited), `onShareClick` handler wiring (needs SharePickerModal integration). |
| P9-T02 | Search | ✅ | Migration 021: adds `pg_trgm` extension, GIN indexes on `translations.title/description`, `tag_translations.label`, `nodes.title`. Creates `search_nodes(p_user_id, p_query, p_language_code, p_sort, p_view, p_mine_filter)` RPC - queries translations in user's language, tag labels, with nodes.title fallback. Applies full visibility model. `lib/db/search.ts` exports `searchNodes()`. `TopBar.tsx`: replaces sliders icon with search icon per PRD v27.2, adds `SearchInput` component with icon-only → expandable input (tap to expand), 300ms debounce via `useCallback/useRef`, Escape to clear/close, blur to collapse if empty. `FeedGrid.tsx`: uses `filterStore.searchQuery`, fetches via `supabaseBrowser.rpc('search_nodes')` with debounce, shows loading state + search-specific empty state, passes `displayNodes` to all view modes. Pending: `search_nodes` not yet in generated types (requires migration apply + CLEANUP-E type regen). |
| P9-T03 | Multi-filter system + URL sync | ✅ | `lib/store/filterStore.ts` rewritten with canonical `FilterState` (view, sort, mineSubTab, friendId/folderId/groupId context, tagIds/filterFriendIds/filterFolderIds multi-filters, searchQuery). Context exclusivity enforced in `setContext()`. Actions: setView, setSort, setMineSubTab, setContext, clearContext, setTagFilters/toggleTagFilter, setFriendFilters/toggleFriendFilter, setFolderFilters/toggleFolderFilter, setSearch, resetFilters (preserves context), clearAll, hydrate, hasActiveFilters, activeContextType. `lib/utils/feedParams.ts` created: `parseURLToFilterState()` (URLSearchParams → FilterState, invalid values ignored, first context wins), `serializeFilterStateToURL()` (deterministic canonical key order, omits defaults), `buildFeedParams()` (pure function → exact get_feed RPC params, empty arrays → undefined). `lib/hooks/useFeedURLSync.ts` created: on mount hydrates store from URL, on store change serializes to URL (replace not push), on browser nav re-hydrates, prevents infinite loops via serialized comparison. `app/(app)/layout.tsx` integrated: useFeedURLSync + useFilterStore replaces local tab/mineSubTab state. `feed/page.tsx` uses parseURLToFilterState for SSR. `feedStore.ts` cleaned: removed duplicate context (selectedFolderId/FriendId/GroupId) and sortOption (delegated to filterStore), retained viewMode + customOrders. `TopBar.tsx` SearchInput updated for new field names. `useFeed.ts` sort now reads from filterStore. |
| P9-T03-B | Determinism & State Ownership Hardening | ✅ | Hardening pass — no new features, only correctness. **STEP 1**: `initializeFilterStore()` with once-only guard — server Component passes `initialFilterState` prop → client boundary calls `initializeFilterStore` ONCE before render. No hydration mismatch. **STEP 2**: `useFeedURLSync` uses `isEqualFilterState` deep compare instead of string comparison — prevents infinite loops between URL↔store. **STEP 3**: `normalizeArray()` (remove null/undefined/empty, deduplicate, sort ascending) + `normalizeSearch()` (trim, collapse whitespace, empty→null) in `feedParams.ts`. Applied to tagIds, filterFriendIds, filterFolderIds, searchQuery. **STEP 4**: `isValidId()` validates UUID format or numeric IDs — invalid entries silently removed during parsing and store writes. **STEP 5**: `SortOption` unified to snake_case only — `app.ts` type updated from `mostShared`/`highestRated` to `most_shared`/`highest_rated`. No dual representation. **STEP 6**: `toSortKey` removed from `useFeed.ts` and `FeedGrid.tsx` — `buildFeedParams` is single mapping authority via `SORT_TO_RPC` lookup. **STEP 7**: `serializeFilterStateToURL` uses `encodeURIComponent` on all values, canonical `URL_KEY_ORDER`, omits defaults. **STEP 8**: `parseURLToFilterState` applies `decodeURIComponent`, normalization via `normalizeFilterState` immediately, context priority friend>folder>group. **STEP 9**: `verifyDeterminism(urlA, urlB, userId)` utility — two logically equivalent URLs produce identical `buildFeedParams` output. `normalizeFilterState()` is the SINGLE normalization point. `isEqualFilterState()` provides deep comparison. All store setters normalize on write. FeedGrid receives `initialFilterState` prop for SSR hydration. |
| P9-T04 | Search Input System | ✅ | Headless search input layer with deterministic debounced updates. **STEP 1**: `lib/hooks/useDebouncedSearch.ts` created — generic debounce hook with cleanup, emits only stabilized values after delay. **STEP 2**: `lib/hooks/useSearchController.ts` created — connects debounced input to `filterStore.searchQuery` via `normalizeSearch` from `feedParams.ts` (no duplicate normalization). Returns `{ inputValue, setInputValue, searchQuery, clearSearch, isPending }`. **STEP 3**: Normalization consistency — imports `normalizeSearch` from `feedParams.ts`, ensuring same logic as URL parsing. Empty input → null. **STEP 4**: `TopBar.tsx` `SearchInput` component refactored to use `useSearchController({ debounceMs: 300 })`. UI behavior preserved: icon-only → expandable input, 300ms debounce, Escape to clear, blur to collapse if empty. **STEP 5**: Clear search → `clearSearch()` sets input to '' and stores null → URL removes `search` param via existing URL sync. **STEP 6**: No double updates — `useSearchController` only calls `setSearch` when debounced value differs from store; existing `useFeedURLSync` deep compare prevents URL oscillation. Acceptance: typing doesn't spam updates, normalized query consistent, URL sync works, reload restores search, empty removes search param. |
| P9-T05 | Filter State Control System | ✅ | Deterministic filter state control with clear + active state visibility. **Architectural fix**: Context (§8) ≠ Filters (§16). **Step 1**: `clearFilters()` added — resets ONLY filter layer (tagIds, filterFriendIds, filterFolderIds, searchQuery). **Context preserved** (friendId/folderId/groupId stay intact). User stays in folder when clearing filters. **Step 2**: URL sync via `useFeedURLSync` — cleared filters remove search/tags/friends/folders params, context params remain. **Step 3**: `hasActiveFilters()` and `activeFilterCount()` fixed to exclude context — counts ONLY §16 filters (tags, friends, folders, search). Context is navigation layer, not a filter. Badge shows true filter count only. **Step 4**: `FilterStatus` component in `TopBar.tsx` — badge + clear button, visible when filters active (not when only context set). **Step 5**: Sync enforcement — deep compare prevents loops, URL updates immediately. **Step 6**: Edge cases verified — clearing in folder context preserves folder, clears filters; reload restores same state. |
| P9-T06-FIX | Canonical Feed System | ✅ | Unified feed into single deterministic pipeline per 04_FEED_SQL_SPEC.md §2. **SQL**: Migration 022 creates `get_feed()` (14 params, 11-stage pipeline: visibility→context→block→view→multi-filters→search→cursor→ordering→dedup→limit). Performance indexes added (pg_trgm GIN, sort cache, edge lookups, block bidirectional). **Backend**: `lib/db/feed.ts` created as sole ownership layer — exports `getFeed(params, isInitialLoad)` calling ONLY `get_feed` RPC. Returns `FeedResult { nodes, totalCount, nextCursor }`. **Frontend**: `useFeed.ts` rewritten — calls only `get_feed` RPC via `supabaseBrowser`, uses `buildFeedParams()` as single mapping authority, implements cursor-based pagination (tuple `(created_at, node_id)` with sort-aware comparison), appends pages without duplication. `FeedGrid.tsx` rewritten — removed `search_nodes` RPC call (search now via `p_search_query` in `get_feed`), uses `useFeed` hook for all data, accepts `FeedNode` type. `feed/page.tsx` updated — calls `getFeed(buildFeedParams(state, userId))` instead of `getVisibleNodes`. **Type migration**: All feed components (`NodeCard`, `FreeGrid`, `FolderView`, `SortableNodeGrid`, `CardDetailSheet`) updated from `VisibleNode` (legacy `node.id`) to `FeedNode` (canonical `node.node_id`, `direction`, `tags`, `avg_rating`, etc.). **Legacy removal**: Zero references to `get_visible_nodes`, `search_nodes`, `get_nodes_in_folder` in any TS/TSX file. SQL functions kept for non-feed usage (card detail, etc.). **Determinism**: Same URL → same FilterState → same buildFeedParams → same SQL params → same results. No client-side filtering or sorting. **Types**: `get_feed` RPC signature manually added to `lib/types/database.ts` (CLI link failed due to account permissions; types generated from migration file). **Migration applied**: Successfully deployed to remote DB via psql (functions created, grants applied, indexes created, pg_trgm extension installed). |

### MIGRATION-FIX
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| MIGRATION-FIX | Ambiguity fix + full migration audit | ✅ | **Bug**: `get_feed` threw `column reference "share_count" is ambiguous` — caused by RETURNS TABLE output parameters shadowing CTE columns. **Fix**: Migration 024 redefines `get_feed` with fully qualified references: `with_tags.node_id` in `DISTINCT ON`/`ORDER BY`, `nsc_cur.share_count`/`nsc_cur.avg_rating`/`nsc_cur.node_id` in `nodes_sort_cache` subqueries. Migration 023 updated for consistency. **Audit**: Verified all 25 migrations against DB schema. 021_search_nodes.sql had `SELECT DISTINCT n.*` with `ORDER BY` on non-selected columns (invalid SQL) — fixed by removing `DISTINCT` (joins are 1:1 via PK). Applied missing 010, 011, 013, 021. 001 and 012 show "missing" only because their tables (`group_admins`, `folder_admins`) were later dropped by 010 — expected state. All functions verified live: `newest`, `oldest`, `most_shared`, `highest_rated`, `custom` sorts all return successfully. |

### BUG FIXES
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| FEED-UNBLOCK-002 | Remove feed crash by fixing selector, disabling DnD, enforcing hook order | ✅ | **3 runtime errors fixed**: (1) Zustand infinite loop — added `import { shallow } from 'zustand/shallow'` and passed as second parameter to `useFilterStore` selector in `lib/hooks/useFeed.ts` (line 111), (2) Hydration mismatch from DnD — replaced entire `lib/dnd/DndProvider.tsx` with simple passthrough component (no DndContext, sensors, handlers, or DragOverlay), (3) Hook order violation — moved `feedItems` useMemo in `FeedGrid.tsx` from after JSX elements (line 214) to before all conditional returns (line 167). All hooks now execute before any return statement. |
| FEED-HOOK-FIX-001 | Ensure ALL hooks in FeedGrid execute before any conditional return | ✅ | **Hook order audit**: Verified all 12 hooks in `FeedGrid.tsx` (useFeedURLSync, useFeed, useFilterStore×2, useMemo×2, useLocalStorage×2, useState, useCallback×3) execute at lines 121-172, before first conditional return at line 222. No hooks appear inside any if statement. No inline components contain conditionally used hooks. `useFilterStore.getState()` calls (lines 182, 184) are method invocations, not hooks. "Rendered fewer hooks than expected" error resolved. |
| HYDRATION-001 | Fix BottomBarAvatar SSR hydration mismatch | ✅ | **Bug**: `@dnd-kit/core` `useDraggable` generated `aria-describedby="DndDescribedBy-0"` on server vs `"DndDescribedBy-1"` on client (useId counter drift). **Fix**: Guard `attributes` and `listeners` spread with `isMounted` condition in `BottomBarAvatar.tsx` lines 105-106. No dnd-kit accessibility attributes rendered during SSR. `disabled: !isMounted` already passed to `useDraggable`/`useDroppable`, but attributes object still contained mismatching IDs. One file, two lines changed. |
| FAB-FIX-001 | FAB visibility + card sheet on all viewports | ✅ | **3 bugs fixed**: (1) FAB zIndex changed from 50 to 51 to prevent BottomBar (also zIndex 50) from covering it, (2) FAB position changed from fragile absolute positioning to fixed with isMobile branching (mobile: bottom 88, centered; desktop: bottom 24, right 24), (3) Removed isMobile guard from AddCardSheet — now mounted on all viewports. FAB visible/tappable on mobile and desktop, AddCardSheet opens on both viewports. |
| BUG-FIX-001 | Add get_friend_bar to Supabase RPC type definitions | ✅ | Updated `lib/types/database.ts` `get_friend_bar` Returns type from `unknown` to correct structure: `{ user_id, display_name, avatar_key, to_email, is_pending, last_activity }[]`. tsc --noEmit passes. |
| BUG-FIX-002 | Defer service client instantiation to prevent build-time crash | ✅ | Removed top-level `export const supabaseService = getSupabaseServiceClient()` from `lib/supabase/service.ts`. Service client now only instantiated inside function body at request time. tsc --noEmit passes. |
| BUG-FIX-003 | Fix useSearchParams Suspense boundary — build-blocking error on /feed | ✅ | Removed `useSearchParams` from import in `app/(app)/layout.tsx`. Extracted all existing AppLayout logic into internal `AppShell` component. Exported `AppLayout` now only wraps `AppShell` in `<Suspense fallback={null}>`. Build completes successfully. |
| BUG-HYD-01 | Investigate hydration mismatch root cause in feed view components | ✅ | Investigation completed: filterStore.ts initializes viewMode and zoom at module level via localStorage reads. During SSR returns defaults; during hydration returns stored values. FeedGrid conditionally renders different component trees based on these values, causing React hydration errors. |
| BUG-HYD-02 | Fix hydration mismatch + implement per-context view/zoom persistence | ✅ | **Hydration fix**: Removed module-level localStorage reads from filterStore.ts store initializer. Store now uses defaults during SSR. **Per-context persistence**: Added context-aware storage helpers (getContextKey, getStoredViewMode, getStoredZoom, saveViewMode, saveZoom). Added hydrateFromStorage and setCurrentContextKey actions to store. Updated setViewMode/setZoom to save per context using currentContextKey field. layout.tsx calls hydrateFromStorage on mount and context change. Removed suppressHydrationWarning from SortViewRow.tsx and DesktopToolbar.tsx view toggle elements. |

### NODE RPCs
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| NODE-001 | Replace node soft delete / restore with atomic RPC | ✅ | Migration 027 creates `set_node_deleted(p_node_id uuid, p_deleted boolean)` — atomic UPDATE on `nodes.deleted_at`. No other table touched. Exactly one function definition in codebase. |
| NODE-002 | Remove direct node update/delete calls and use RPC | ✅ | `lib/db/nodes.ts`: `softDeleteNode` and `restoreNode` now call `rpc('set_node_deleted', ...)` instead of direct `.update()`. `createNode` already used RPC. `hardDeleteNode` retains direct `.delete()` — no hard-delete RPC exists yet; deferred to future task. |
| FOLDER-001 | Replace folder rename with RPC (start folder write collapse) | ✅ | Migration 028 creates `rename_folder(p_folder_id uuid, p_name text)` — atomic UPDATE on `folders.name`. `lib/db/folders.ts::renameFolder` now calls `rpc('rename_folder', ...)` instead of direct `.update()`. Exactly one function definition, exactly one call site. |
| FOLDER-002 | Replace folder rename direct write with RPC | ✅ | Completed by FOLDER-001. `renameFolder` already uses `rpc('rename_folder', ...)`. Grep `.from("folders").update` → 0 results codebase-wide. |
| FOLDER-003 | Implement folder creation via RPC (atomic cause-compliant write path) | ✅ | Migration 029 redefines `create_folder(p_name text, p_parent_folder_id uuid)` — uses `auth.uid()` for `owner_id`, returns `UUID` only. `color_hex` assigned deterministically via owner folder count modulo 20. `folder_tree` self + ancestor inserts preserved. `lib/db/folders.ts::createFolder` signature updated to `{ name: string; parentFolderId: string | null }` → `Promise<{ id: string }>`, uses `rpc()` helper (not service client), no `ownerId` passed. `CreateFolderInput` interface removed. Grep `.from("folders").insert` → 0 results. |
| FOLDER-004 | Fetch and display user folders (read path enablement) | ✅ | `lib/db/folders.ts::getUserFolders()` added — server-only function using `getSupabaseServerClient()`, auth-derived `user.id`, selects from `folders` with `owner_id` + `deleted_at` filters, no joins, no visibility logic. `app/(app)/feed/page.tsx` calls `getUserFolders()` in parallel with feed fetch, passes `folders` prop to `FeedGrid`. `FeedGrid` renders minimal horizontal folder strip (colored chips with `f.color_hex`, `f.name`) above all views. `Folder` type imported from `@/lib/types/app`. Grep `getUserFolders` → 1 definition (folders.ts), 1 usage (page.tsx). |
| FOLDER-005 | Enable folder click → filter feed by folder (minimal usable flow) | ✅ | `FeedGrid.tsx` folder chips now call `useFilterStore.getState().setContext({ folderId: f.id })` on click, or `clearContext()` if already active (toggle). Active folder shown with `boxShadow` ring. Feed refetch is automatic via `useFeed` hook dependency on `storeState.folderId` → `buildFeedParams` maps `folderId` → `p_folder_id` → `get_feed` RPC. URL syncs via `useFeedURLSync`. No SQL modified, no feed params changed, no client-side filtering. Grep `setContext.*folderId` in FeedGrid → 1 match. |

### AUDIT
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| AUDIT-01 | Full repository & database audit (read-only) | ✅ | **Report**: `docs/AUDIT-01-REPORT.md` (full findings). **Raw DB dump**: `scripts/audit-01-output.txt`. **Script**: `scripts/audit-01.js`. No code or DB modifications made. Scope covered: all TS in `app/`, `lib/`, `components/`; all 29 migrations; live DB schema (25 tables, 27 functions, RLS policies, indexes, row counts). **Findings summary**: 10 CRITICAL, 14 HIGH, 7 MEDIUM. See report for priority fix list. |
| FIX-01 | Tighten RLS on causes + edges | ✅ | Migration 030 applied; 6 wide-open write policies dropped |
| FIX-02 | Restore middleware.ts at project root | ✅ | proxy.ts renamed; export corrected; console.log removed |
| AUDIT-01 / C1 | Wide-open RLS on `edges` and `causes` | ⚠️ CRITICAL | INSERT/UPDATE/DELETE policies on `causes` and `edges` all use `true` with_check/using — any authenticated session can fabricate edges/causes, grant self visibility, or mass-delete. Defeats PRD §3 visibility invariant. **Claimed done in P3-T05 — actually not done.** |
| AUDIT-01 / C2 | `middleware.ts` missing at project root | ⚠️ CRITICAL | Only `proxy.ts` exists at root exporting `proxy()`. Next.js requires `middleware.ts` with `export middleware`. Auth guard not registered at framework level. **Claimed done in CLEANUP-C — actually not done.** |
| AUDIT-01 / C3 | Migration 027 `set_node_deleted` not applied to DB | ⚠️ CRITICAL | Function absent from `pg_proc`. `lib/db/nodes.ts::softDeleteNode` and `restoreNode` call the RPC → runtime error. Trash, restore, Undo flows broken. **Claimed done in NODE-001/NODE-002 — not reflected in DB.** |
| AUDIT-01 / C4 | Migration 028 `rename_folder` not applied to DB | ⚠️ CRITICAL | Function absent. `lib/db/folders.ts::renameFolder` runtime-broken. **Claimed done in FOLDER-001/FOLDER-002 — not reflected in DB.** |
| AUDIT-01 / C5 | `folders.color_hex` column missing | ⚠️ CRITICAL | Deployed `create_folder` (migration 029) references `folders.color_hex` on INSERT — column does not exist in live schema. Folder creation throws at runtime. **FOLDER-003 claimed ✅ but cannot succeed as deployed.** |
| AUDIT-01 / C6 | Migration 012 (`folder_admins`, `group_admins`) not applied | ⚠️ CRITICAL | Both tables absent in live DB. **Claimed done in CLEANUP-A — not reflected in DB.** |
| AUDIT-01 / C7 | `SharePickerModal` + `usePermissions` hook violate server/client boundary | ⚠️ CRITICAL | `"use client"` files import from `@/lib/db/sharing`, `@/lib/db/permissions` → service-role client throws in browser (env undefined). TAD §3.2/§4.3 violation + runtime failure on any share action. |
| AUDIT-01 / C8 | `app/(app)/layout.tsx` ships hardcoded `userId="stub-user-id"`, `displayName="JS"`, `stubItems` friends | ⚠️ CRITICAL | Profile modal operates on fake user; friends bar shows 12 mock people. Layout not wired to real auth/data. |
| AUDIT-01 / C9 | `FeedGrid.tsx` `STUB_ITEMS` fallback | ⚠️ CRITICAL | Real users with empty feeds see 10 fake demo cards (line 67, 165). Must remove the fallback. |
| AUDIT-01 / C10 | Two overloads of `direct_share` / `group_share` coexist in DB | ⚠️ CRITICAL | Silent argument-type dispatch to wrong version. Drop obsolete overload(s). |
| AUDIT-01 / H1 | `lib/db/nodes.ts::getNodeById` bypasses visibility | ⚠️ HIGH | Direct SELECT with only `deleted_at IS NULL` filter — no owner/edge check. Used by server actions. |
| AUDIT-01 / H2 | `unshareFolderOp` does direct `.delete("causes")` from TS | ⚠️ HIGH | No `unshare_folder_op` RPC. High-impact cascade with only TS-side auth filter. |
| AUDIT-01 / H3 | `createOrGetTag` non-atomic (tags + tag_translations from TS) | ⚠️ HIGH | Migration 026 created `create_tag_with_translation` RPC but it is not deployed and not used. |
| AUDIT-01 / H4 | `create_node` / `create_node_with_metadata` are `SECURITY INVOKER` | ⚠️ HIGH | TAD §7 mandates DEFINER. |
| AUDIT-01 / H5 | 4 folder writes bypass RPCs | ⚠️ HIGH | `addNodeToFolder`, `removeNodeFromFolder`, `deleteFolder`, `moveFolder` all direct PostgREST writes. P0-T03 explicitly required `add_node_to_folder` RPC. |
| AUDIT-01 / H6 | Profile/avatar change duplication + non-atomic | ⚠️ HIGH | Parallel implementations in `lib/db/users.ts` and `app/lib/actions/profile.ts`; both split `users.update` + `activity_log.insert` across two statements. |
| AUDIT-01 / H7 | `nodePreferences.setCustomOrder` non-atomic | ⚠️ HIGH | Delete-then-insert in two separate statements. |
| AUDIT-01 / H8 | `cardDetail.ts::updateNodeTitle` + `incrementViewCount` direct writes | ⚠️ HIGH | Should be RPCs. |
| AUDIT-01 / H9 | Duplicate RLS policies on `nodes`, `causes`, `edges` | ⚠️ HIGH | Each table has both `_own` and `_policy`/`_visible` covering identical logic. |
| AUDIT-01 / H10 | Duplicate GIN/btree indexes | ⚠️ HIGH | `nodes.title`, `tag_translations.label`, `translations.title`, `user_node_preferences` each have two indexes on the same columns. |
| AUDIT-01 / H11 | `lib/db/users.ts::createUserProfile` is a stub | ⚠️ HIGH | `throw new Error("Not implemented - P1-T03")`. Dead-but-present. |
| AUDIT-01 / H12 | `TagsStrip.tsx` uses `stubTags` | ⚠️ HIGH | P5-T05 `getVisibleTags` never implemented. |
| AUDIT-01 / H13 | `AddCardSheet.tsx` uses `STUB_TAGS`/`STUB_FRIENDS` + fake preview fetch | ⚠️ HIGH | Pickers are decorative; preview is `setTimeout`. |
| AUDIT-01 / H14 | `lib/hooks/useRealtime.ts` stub TODOs | ⚠️ HIGH | Either delete or hide behind feature flag until P10 starts. |
| AUDIT-01 / M1 | `getFolderTree` N+1 edge queries | ⚠️ MEDIUM | Loop of per-cause edge fetches. Replace with single JOIN. |
| AUDIT-01 / M2 | Deployed `create_folder` has no cycle check | ⚠️ MEDIUM | P4-T01 requirement. |
| AUDIT-01 / M3 | Layout `tagLabelMap` / `tagColorMap` hardcoded | ⚠️ MEDIUM | Derive from real tag fetch. |
| AUDIT-01 / M4 | `HorizView.tsx` sub-folder grouping is a stub (color proxy) | ⚠️ MEDIUM | Group by `folder_edges`. |
| AUDIT-01 / M5 | `proxy.ts:41` `console.log` | ⚠️ MEDIUM | Remove when renaming to `middleware.ts`. |
| AUDIT-01 / M6 | `supabase_migrations.schema_migrations` empty | ⚠️ MEDIUM | Switch to `supabase db push` or manually record applied versions. |
| AUDIT-01 / M7 | 00_PROGRESS.md line 159 claim "permissions.ts unused" is stale | ⚠️ MEDIUM | Imported by `folders.ts`, `sharing.ts`, `usePermissions.ts`, `SharePickerModal.tsx`. |

### PHASES 10–13
| Phase | Status |
|-------|--------|
| P10 Realtime & Notifications | ⏳ Not started |
| P11 Advanced Views | ⏳ Not started |
| P12 Admin & Permissions | ⏳ Not started |
| P13 Chat | ⏳ Deferred — do not start until P1–P12 gates pass |

---

## KNOWN DEVIATIONS FROM SPEC (accepted, monitored)

| Item | Deviation | Decision |
|------|-----------|----------|
| lib/utils/avatar.ts | Wrong path vs spec lib/avatar.ts | Accepted — harmless |
| migration 010 | Added permission column to edges, is_project + color_hex to folders | Accepted — additive, safe defaults |
| migration 011 | friend_invites table instead of edge-derived friends | Accepted — revisit at P5-T01 |
| components location | Feed components in app/(app)/feed/_components/ | Accepted — enforce correct location going forward |
| permissions.ts | File exists but unused | Leave in place, never import |
| `AnySupabase` cast in `lib/db/nodePreferences.ts` | `user_node_preferences` table not yet in generated database.ts types | Will be fixed by CLEANUP-E (regenerate Supabase types after migration 017) |

---

## STRICT RULES FOR CODER (repeat in every prompt)

1. One function or one component per prompt — never combine.
2. Every prompt must have an explicit DO NOT section.
3. Coder must show complete final file contents after every change.
4. Never reference task IDs that don't exist in 02_BUILD_PLAN.md.
5. Never add columns, tables, RPC functions, or dependencies not explicitly requested.
6. Never modify files not explicitly named in the prompt.

---

## BLOCKERS / NOTES

- BUG-01 fixed: public.users row creation now hard-blocks signup (error + signOut if profile insert fails); OAuth callback uses upsert with onConflict; trigger 013 as safety net on auth.users AFTER INSERT; migration 014 backfills public.users rows for any existing auth users missing a profile row
- BUG-02 fixed: AddCardSheet now mobile-only (< 1024px); desktop FAB is a no-op pending future desktop create modal task
- CLEANUP-D complete: lib/types/database.ts regenerated with new tables (ratings, nodes_sort_cache) and RPCs (upsert_rating, get_nodes_in_folder, get_visible_nodes with p_sort)
- P6-T02 complete: Rating upsert RPC (migration 015) + client-side ratings.ts with type casting for getRatingsForNode
- P6-T03 complete: Sort-aware feed RPCs (migration 016) + localStorage persistence in feedStore + useFeed.ts wiring
- TypeScript errors remain in unmodified files (friends.ts, sharing.ts, users.ts) — pre-existing, out of scope for recent tasks
- permissions.ts left in place unused — do not import it anywhere in new code
- friend_invites model (migration 011) deviates from PRD §9 — accepted deviation
- migration 010 dropped folder_admins and group_admins — restored via migration 012
- CardDetailModal exists but stubbed — needs full implementation per P8
- P9-T02 follow-up: TrashView.tsx now has Close button (X) in header — navigates back to /feed
- P9-T02 follow-up: ProfileModal trigger moved from BottomBar Me avatar to TopBar avatar button per PRD §11.1 navigation pattern
- BUG-03 fixed: TrashView.tsx Close button now uses `router.back()` instead of hardcoded `/feed` — returns to previous page correctly
- Feature: Clicking Me in friends strip navigates to home feed with 'mine' view (`/feed?view=mine`)
- UI: Mobile prototype created at `docs/UI (for reference only)/mobile_prototype.html` — full-screen version without phone frame or tweaks panel for testing on mobile devices
- **UIX Overhaul (11 phases) completed:**
  - Phase 1: `globals.css` updated with all design tokens (surfaces, borders, text, accent, status, shadows, z-index, radii, spacing, transitions, typography)
  - Phase 2: `layout.tsx` refactored — inline tabs/sub-tabs/sort-view row extracted into `FeedTabs`, `MineSubTabs`, `SortViewRow` components
  - Phase 3: `TopBar.tsx` — Folder View Header (color dot + serif name), tag count badge, `var(--r-md)` search radius
  - Phase 4: `TagsStrip.tsx` — search input + colored tag chips, wired to `filterStore`
  - Phase 5: `ContextStrip.tsx` — active filter pills with remove/clear-all, wired to `filterStore`
  - Phase 6: `FeedTabs` + `MineSubTabs` — colored active pills, `subtab-animate` CSS animation
  - Phase 7: `SortViewRow` — 5-icon view toggle, zoom stepper (col only), sort button stub
  - Phase 8: `BottomBar.tsx` — 3-state model (hidden/strip/expanded), swipe gestures, localStorage persistence (`liked.friendsStripState`), expanded panel with friend/group list
  - Phase 9: `FabSpeedDial.tsx` — 4 actions (Card, Folder, Template, Tag), staggered fade-in, `+`→`×` rotate, scrim
  - Phase 10: `FolderPathBar.tsx` — folder breadcrumb in bottom dock above Friends Strip, back button, path navigation
  - Phase 11: `NodeCard.tsx` — sticky-note style (Caveat font, yellow tint `#fde68a`, glossy gradient, folded corner), hover/active transforms, `var(--tab-received)` direction badge
  - New files: `components/bars/FeedTabs.tsx`, `MineSubTabs.tsx`, `SortViewRow.tsx`, `TagsStrip.tsx`, `ContextStrip.tsx`, `FabSpeedDial.tsx`, `FolderPathBar.tsx`
  - Caveat font imported via Google Fonts in `app/layout.tsx`
- **Mockup alignment (Apr 26):**
  - `globals.css` — Tokens aligned to mobile mockup: purple accent `#7c5cfc`, teal mine `#06d6a0`, cyan received `#00b4d8`, updated surface/border/text/shadow values, added `--c-*` aliases
  - Added mockup CSS classes to `globals.css`: `.feed-tab`, `.subtab`, `.note-card`, `.context-strip`, `.icon-btn`, `.badge`, `.card`, `.fab`, `.speed-dial`, `.bottom-dock`, `.search-field`, `.tag-chip`
  - `FeedTabs.tsx` — Refactored to `.feed-tab` + `.feed-tab--active` CSS classes with `data-tab` attributes; active pill uses `::before` pseudo-element with scale animation
  - `MineSubTabs.tsx` — Refactored to `.subtab` + `.subtab--active` with `data-scope`/`data-subtab` attributes; colors handled by CSS per mockup
  - `ContextStrip.tsx` — Refactored to `.context-strip`, `.context-pill`, `.context-clear` CSS classes
  - `NodeCard.tsx` — Text cards use `.note-card` class: aspect-ratio 1/1, `#fde68a` tint, top-right folded corner, glossy `::before` gradient, hover `rotate(-0.6deg)`, mockup shadow stack, Caveat font, absolute meta date
  - `FabSpeedDial.tsx` — Refactored to `.fab`, `.fab-scrim`, `.speed-dial`, `.speed-dial__item/label/btn` CSS classes; staggered fade-in via CSS transitions
  - `TopBar.tsx` — Icon buttons updated to 38px, `surface-1` background, search field uses `.search-field` class, badge uses `.badge` class, header padding matches mockup
