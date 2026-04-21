# LIKED — Build Progress Tracker

**Purpose:** Source of truth for execution state. Updated by Lolo after each task is confirmed complete by Cascade.
**Rule:** Claudi reads this file first in every session before issuing any prompt.

---

## ⚡ CURRENT STATUS

| Field | Value |
|-------|-------|
| **Last completed task** | P9-T05 (Filter State Control System) |
| **Next task to execute** | P9-T06 (or next per BUILD_PLAN) |
| **Current phase** | P9 — Search & Filters |
| **Phase gate passed** | ✅ P9-T05 |
| **Last updated** | 2026-04-21 (Cascade) |

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
| CLEANUP-C | middleware.ts at project root | ✅ | Was missing, now restored |
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
