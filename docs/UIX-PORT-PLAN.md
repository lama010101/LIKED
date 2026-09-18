# UIX-PORT-00 — PROTO V2 → Production Port Plan

Source design: `DOCS/UI/PROTO V2 - liked_desktop.html` (desktop + mobile surfaces).
Target: production Next.js app. **Presentation-layer port only.**

## Frozen (never touched, verified per task via `git diff`)

- `lib/db/feed.ts`, `lib/hooks/useFeed.ts`, `lib/utils/feedParams.ts`
- `lib/store/filterStore.ts` (semantics — UI may bind to existing actions, never change behavior)
- `get_feed` RPC and all other RPCs
- No client-side `.filter()`/`.sort()` on feed arrays — filtering/sorting stays server-side

## Phase-1 findings that shape the plan

- `group_members` RLS (`group_members_select_scoped`): owner sees all rows; member sees only own row via direct read. All prod DB access goes through `getSupabaseServiceClient()` (RLS bypass) — `getGroupBar` already lists member rows for all groups. Member listing for both roles therefore requires a **server action** (service client + explicit membership check). Additive only; no RLS/migration change.
- `create_group(p_owner_id, p_name, p_member_ids)` RPC exists; `createGroup()` already in `lib/db/sharing.ts:241`. Needs only a thin `createGroupAction` server action.
- `group_is_member(p_group_id, p_user_id)` exists for authz checks.
- `get_feed` live signature matches `buildFeedParams` exactly. **No `p_mine_filter`** — proto's "I created ▸ Private/Shared" children map to existing `mineSubTab` store state, which is a documented dead control (AUDIT-02 #6). Children bind to `setMineSubTab` (existing action); feed unchanged is a pre-existing gap, flagged not fabricated.
- `groups` table: `id, name, owner_id, deleted_at, created_at` — no color column → ring/icon colors derived deterministically from group id (presentation only).
- `mineSubTab` state is NOT URL-serialized and NOT sent to RPC.
- Long-press on cards already activates multi-select (P7-T03) — card action sheet on mobile therefore triggers from the ⋮ menu (sheet presentation), long-press selection preserved.
- Friend long-press currently opens a popover — replaced by proto-style action sheet (same actions + group membership display).
- E2E selector contract to preserve or update-in-task: `button[aria-label="Profile"]`, `dialog[aria-label="Profile"]`, link `Feed`/`Activity`, `Folders`/`Trash` (currently buttons — will become links; spec updated in same task), `button[aria-label="{mode} view"]`+`aria-pressed`, `Card menu`/`Folder menu` + `role=menuitem`, FAB `aria-label="Add"`, `.folder-tile` class, bell `button /notifications/i` + heading `Notifications`, `dialog[aria-label="Card detail"]`.

## Context ↔ proto mapping (all existing store actions)

| Proto control | Store action |
|---|---|
| Feed pill "Created & Received" | `clearContext()` + `setView('all')` |
| "I created" ▸ children | `setView('mine')` + `setMineSubTab('all'\|'not_shared'\|'shared')` |
| "I received" | `setView('received')` |
| Friend selected + "{name} & me" | `setContext({friendId})` + `setView('all')` |
| "I sent to {name}" | friendId + `setView('mine')` |
| "I received from {name}" | friendId + `setView('received')` |
| Group selected | `setContext({groupId})` |
| Folder tile / sidebar folder / crumb | `setContext({folderId})` + `pushFolder`/`setFolderStack` |
| "Everything" | `clearContext()` |

## Sub-tasks

| ID | Scope | Files | Deps | Verify |
|----|-------|-------|------|--------|
| **UIX-01** | Proto theme foundation: flip `--accent` to `#ff3b30` + accent-derived tokens, complete light palette to proto values, add all new `.v2-*` proto CSS classes (sidebar, header, stories, folders section, feed pill/dropdown, sub-tabs, video cards, sheets, drill-down, friend manager), reposition `.fab` to bottom:24px (mobile centered). Flip default theme `dark→light` in layout. DO NOT: touch any component behavior, feed code, or existing class bodies beyond accent/fab. | `app/globals.css`, `app/(app)/layout.tsx` (1 line: theme default) | — | `tsc`+`lint`+`build` clean |
| **UIX-02** | Additive backend: `getGroupMembers(userId, groupId)` db fn (service client, caller must be member) + `getGroupMembersAction`/`createGroupAction` server actions. DO NOT: wire any UI, touch frozen files, change RLS/RPCs. | `lib/db/groups.ts` (new), `app/lib/actions/groups.ts` (new) | — | `tsc`+`lint`+`build` clean |
| **UIX-03** | `StoriesBar` — proto story rail (Me/friends/groups rings + Manage + New group buttons). Preserves: friend drag source, friend+group drop targets (existing dnd types), friend long-press → callback to FriendActionSheet, pending dimming, member-count badge, active-ring state. DO NOT: mount it, touch BottomBar yet. | `components/bars/StoriesBar.tsx` (new) | UIX-01 | `tsc`+`lint`+`build` |
| **UIX-04** | `Sidebar` — proto collapsible sidebar (logo+collapse btn, nav Home/Feed, folders tree w/ Everything + recursive children + per-folder dnd drop, tags section → tag filters, Library links Activity→/social, Trash→/trash, YouTube→/youtube, group-context member list via UIX-02, 72px collapsed rail). DO NOT: mount it. | `components/sidebar/Sidebar.tsx` (new) | UIX-01, UIX-02 | `tsc`+`lint`+`build` |
| **UIX-05** | `AppHeader` — proto header for both breakpoints (desktop: search pill via `useSearchController`, bell+count, avatar; mobile: logo, search pill, bell, avatar, tags + trash icon buttons). Keeps aria-labels `Profile`, `Notifications`, `Tags`, `Trash`. DO NOT: mount it. | `components/bars/AppHeader.tsx` (new) | UIX-01 | `tsc`+`lint`+`build` |
| **UIX-06** | `FeedControlsBar` — feed pill dropdown (context+view per mapping table incl. expandable "I created" children) + restyled 5-view switcher (`{mode} view` aria-labels + aria-pressed kept) + cols stepper (zoom) + real sort menu wired to `setSort`. Fetches friend/group names via existing `getFriendBarAction`/`getGroupBarAction`. DO NOT: mount it, touch filterStore semantics. | `components/bars/FeedControlsBar.tsx` (new) | UIX-01 | `tsc`+`lint`+`build` |
| **UIX-07** | `VideoCard` proto anatomy (16:9 thumb/gradient, title, source/sender line, stats row: ★avg_rating ↗share_count 👁view_count, direction dot, tags, CardMenu). Extend `FeedItem` with real fields + `toFeedItems` mapping (pure pass-through). Restyle `ColView`, `ListView`, `MasonView`, `HorizView` to render it. DO NOT: fabricate fields, add client filtering. | `feed/_components/VideoCard.tsx` (new), `lib/types/feed.ts`, `toFeedItems.ts`, `views/ColView.tsx`, `views/ListView.tsx`, `views/MasonView.tsx`, `views/HorizView.tsx` | UIX-01 | `tsc`+`lint`+`build` |
| **UIX-08** | Restyle `NodeCard` to the same proto anatomy (covers SortableNodeGrid fallback + FreeGrid + FolderView). DO NOT: change dnd/selection/long-press semantics. | `feed/_components/NodeCard.tsx` | UIX-07 | `tsc`+`lint`+`build` |
| **UIX-09** | `FolderSection` — proto folders section: header (Folders · N + New Folder + mobile chevron), folder-card grid (2×2 collage/icon/count/menu, keeps `.folder-tile` class + dnd drop), "Everything" card, group-context member cards (UIX-02), sub-folder tabs (children of active folder), mobile drill-down w/ breadcrumb levels. Integrated into FeedGrid replacing inline `folderGrid`. | `feed/_components/FolderSection.tsx` (new), `feed/_components/FeedGrid.tsx` | UIX-01, UIX-02, UIX-07 | `tsc`+`lint`+`build` |
| **UIX-10** | Mobile card action sheet + folder tree picker. `CardActionSheet` (bottom sheet, menu items identical to CardMenu + Copy to) opens from ⋮ menu on mobile; `FolderTreePicker` (full-screen modal, expandable tree, move=radio→`dndMoveNodeToFolder`, copy=checkboxes→`dndAddNodeToFolder`). DO NOT: change desktop menu behavior or dnd actions. | `components/sheets/CardActionSheet.tsx` (new), `components/sheets/FolderTreePicker.tsx` (new), `FeedGrid.tsx` (wire sheet), `VideoCard.tsx`/`NodeCard.tsx` (mobile ⋮→sheet callback) | UIX-07, UIX-09 | `tsc`+`lint`+`build` |
| **UIX-11** | `FriendManagerModal` (Friends tab: invite via `sendFriendInviteAction`, remove, block; Groups tab: list from `getGroupBar` + create via `createGroupAction` w/ member checkboxes) + `FriendActionSheet` (name, In:-groups via `getGroupMembersAction`, Remove friend, Block — no add-to-group). DO NOT: mount yet. | `components/modals/FriendManagerModal.tsx` (new), `components/sheets/FriendActionSheet.tsx` (new) | UIX-01, UIX-02 | `tsc`+`lint`+`build` |
| **UIX-12** | Layout restructure: mount `Sidebar` (desktop) + `AppHeader` + `StoriesBar` + `FriendManagerModal` + `FriendActionSheet`; ungate `AddFolderSheet` for desktop; remove mounts of TopBar/DesktopToolbar/FeedTabs/MineSubTabs/SortViewRow/FolderPathBar/BottomBar; keep ContextStrip, TagsStrip (mobile), NotificationPanel, ProfileModal, AddCardSheet, FabSpeedDial, SelectionOverlay, DndProvider, useRealtime, all data loading. DO NOT: delete old component files yet, touch filterStore. | `app/(app)/layout.tsx` | UIX-03→UIX-06, UIX-09→UIX-11 | `tsc`+`lint`+`build` |
| **UIX-13** | Deletion + test updates in one task: delete `TopBar.tsx`, `BottomBar.tsx`, `BottomBarAvatar.tsx`, `FeedTabs.tsx`, `MineSubTabs.tsx`, `SortViewRow.tsx`, `FolderPathBar.tsx`, `DesktopToolbar.tsx`; update e2e selectors that changed role (`Folders`/`Trash` buttons→links in `feed-authenticated.spec.ts`, `folders-authenticated.spec.ts`, `trash-authenticated.spec.ts`); grep-verify zero remaining imports. | deletions + `e2e/*.spec.ts` | UIX-12 | `tsc`+`lint`+`build` + grep 0 refs |
| **UIX-14** | Final verification: `npx vitest run`, `npx playwright test`, `git diff` on frozen files (must be empty), summary table + checklist. DO NOT: any code change beyond test fixes required by UIX-13 fallout. | — | all | full suite output |

## Status log

| Task | Status | Verification |
|------|--------|--------------|
| UIX-01 | ✅ done (bf90dde) | tsc+lint+build clean; frozen diff empty |
| UIX-02 | ✅ done (07cb82d) | tsc+lint+build clean; additive-only |
| UIX-03 | ✅ done (5552a62) | tsc+lint+build clean |
| UIX-04 | ✅ done (cbb5b6d) | tsc+lint+build clean |
| UIX-05 | ✅ done (f55ce66) | tsc+lint+build clean |
| UIX-06 | ✅ done (50f14de) | tsc+lint+build clean |
| UIX-07 | ✅ done (b963e74) | tsc+lint+build clean; frozen diff empty |
| UIX-08 | ✅ done (0caf788) | tsc+lint+build clean |
| UIX-09 | ✅ done (a02e6a4) | tsc+lint+build clean |
| UIX-10 | ✅ done (1ca08c7) | tsc+lint+build clean |
| UIX-11 | ✅ done (b1e81c5) | tsc+lint+build clean |
| UIX-12 | ✅ done (4a3d6cb) | tsc+lint+build clean; frozen diff empty |
| UIX-13 | ✅ done (3ddd3e6) | tsc+lint+build clean; 0 remaining refs |
| UIX-14 | ✅ done (75a14cd) | vitest 79/79; playwright 94 pass / 3 pre-existing fails (unrelated) |
