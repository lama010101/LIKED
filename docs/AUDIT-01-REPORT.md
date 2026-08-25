# AUDIT-01 — Full Repository & Database Audit Report

> **STALE — historical record only, not current status.** Written 2026-04-27
> against an earlier Next.js version and DB state. As of 2026-08-25, the
> code-level findings below have been re-verified against the current
> codebase and are resolved (`getNodeById` visibility, `SharePickerModal`
> / `usePermissions` client-side imports, `unshareFolderOp`,
> `createOrGetTag`, `setCustomOrder`, folder write RPCs). The `proxy.ts`
> "middleware.ts missing" finding (#2) is invalid — Next.js later renamed
> that convention from `middleware.ts` to `proxy.ts`, so `proxy.ts` is
> correct. The `scripts/audit-01-output.txt` and `scripts/audit-01.js`
> referenced below no longer exist (`scripts/` was deleted — see git log).
> The DB-side findings (RLS policies, missing RPCs, duplicate indexes)
> were not independently re-verified against the live database — this
> session had no access to the LIKED Supabase project.

**Project:** LIKED · **Task ID:** AUDIT-01 · **Mode:** READ-ONLY (no modifications).
**Date:** 2026-04-27 · **DB inspected:** `lzkzfqshnjvlzosnntfx` (session pooler, port 6543).
**Authoritative docs:** `01_PRD.md` v27.2 · `02_BUILD_PLAN.md` v1.0 · `03_TECHNICAL_ARCHITECTURE.md` v1.0 · `04_FEED_SQL_SPEC.md` v1.0.
**Raw DB dump:** `scripts/audit-01-output.txt` (790 lines). **Audit script:** `scripts/audit-01.js`.

Legend: **[PASS]** / **[FAIL]** / **[PARTIAL]** / **[STUB]** / **[UNKNOWN]**.

---

## 1. PROGRESS FILE AUDIT — `00_PROGRESS.md` vs reality

| Claim | Verdict | Evidence |
|---|---|---|
| CLEANUP-C `middleware.ts` at project root ✅ | **[FAIL — CRITICAL]** | No `middleware.ts`. Only `proxy.ts` exporting `proxy()`. Next.js requires `middleware.ts` with `export middleware`. **Auth guard not registered at framework level.** |
| P1-T02 all 23 tables exist | **[PARTIAL]** | 25 tables present, but `folder_admins`, `group_admins` MISSING despite CLEANUP-A/migration 012 ✅. |
| P1-T02 no UNIQUE(node_id,user_id) on edges | **[PASS]** | Only PK on `id` + FKs. Index `edges_node_user_idx` non-unique. |
| P1-T02 RLS enabled everywhere | **[PASS]** | `relrowsecurity=true` on all 25 public tables. |
| P1-T03 Auth integration ✅ | **[PARTIAL]** | `lib/db/users.ts::createUserProfile` is a **[STUB]** (`throw new Error("Not implemented - P1-T03")`, line 21). Compensated by `app/(auth)/callback/route.ts` upsert + `ensure_user_profile` trigger. |
| P3-T01 direct share ✅ | **[PASS]** with caveat | `direct_share` and `group_share` each have **two overloads** in DB — silent dispatch risk. |
| P3-T05 RLS tightening ✅ | **[FAIL — CRITICAL]** | `causes_insert_policy` with_check=**true**; `causes_delete_policy` USING=**true**; same for `edges_insert/update/delete_policy`. Any authenticated browser can fabricate edges/causes or mass-delete them. PRD §3 visibility invariant unenforceable. |
| P4-T01 Folder CRUD ⚠️ | **[FAIL — CRITICAL]** | Deployed `create_folder` references `folders.color_hex`; column does not exist. Runtime failure on any call. |
| CLEANUP-A `folder_admins`+`group_admins` ✅ | **[FAIL]** | Tables absent in live DB. Migration 012 not applied. |
| NODE-001 / NODE-002 `set_node_deleted` RPC ✅ | **[FAIL — CRITICAL]** | Migration 027 file exists; function absent from DB. `lib/db/nodes.ts::softDeleteNode`/`restoreNode` call it → runtime error. Trash/restore/Undo all broken. |
| FOLDER-001 `rename_folder` RPC ✅ | **[FAIL — CRITICAL]** | Migration 028 file exists; function absent. `lib/db/folders.ts::renameFolder` broken at runtime. |
| P5-T05 Tags Strip / `getVisibleTags` ✅ | **[STUB]** | `components/bars/TagsStrip.tsx:13` uses hardcoded `stubTags` array. `getVisibleTags` never implemented. |
| UIX Overhaul — all 11 phases ✅ | **[PARTIAL]** | UI present but `app/(app)/layout.tsx` ships hardcoded `userId="stub-user-id"`, `displayName="JS"`, and 12-item `stubItems` friends list. `FeedGrid.tsx:67` falls back to 10 fake demo cards (`STUB_ITEMS`) when feed empty. |
| P9-T06-FIX canonical `get_feed` ✅ | **[PASS]** | `get_feed` is the only feed path; no stale `get_visible_nodes`/`search_nodes` usage in feed. |
| P3-T03 friends / P3 seed / P6 ratings / P9 search / MIGRATION-FIX ambiguity | **[PASS]** | Functions deployed and wired. |

---

## 2. DATABASE SCHEMA AUDIT

### 2-A. Tables (25 in `public`)
Present: `activity_log, blocks, causes, direct_chats, edges, external_items_map, external_sources, folder_edges, folder_tree, folders, friend_invites, group_members, group_messages, group_nodes, groups, messages, node_messages, nodes, nodes_sort_cache, notifications, ratings, tag_edges, tag_translations, tags, translations, user_node_preferences, users`.
**MISSING:** `folder_admins`, `group_admins`.

Row counts: `users=14, nodes=21, causes=4, edges=6, ratings=0, folders=10, folder_edges=0, folder_tree=15, tags=12, tag_translations=12, tag_edges=40, group_members=22, friend_invites=0, user_node_preferences=0, blocks=0, notifications=0, activity_log=0, translations=0`.

### 2-B. Critical invariants
| Invariant | Result |
|---|---|
| `edges.cause_id IS NOT NULL` | **[PASS]** |
| `edges.cause_id` FK CASCADE on cause delete | **[PASS]** |
| NO UNIQUE(node_id,user_id) on `edges` | **[PASS]** |
| `nodes.deleted_at` nullable timestamptz | **[PASS]** |
| `nodes_sort_cache` has `node_id, avg_rating, view_count, share_count, updated_at` | **[PASS]** |
| `causes` has `id, cause_type, created_by, created_at, metadata` | **[PASS]** |
| `ratings.score numeric(3,1)` | **[PASS]** |
| `ratings` UNIQUE(node_id,user_id) | **[PASS]** |
| `folders.color_hex` exists | **[FAIL]** column missing; `create_folder` function body references it. |
| `folders.is_project` (migration 010) | **[PASS]** |
| `edges.permission` deviation column | **[DEVIATION]** accepted per 00_PROGRESS. CHECK (`view|comment|contribute|edit|reshare|admin`). |

### 2-C. Indexes
Spec requires `edges_node_user_idx`, `edges_cause_idx`, `tag_translations_lookup_idx` — all **[PASS]**.
**Duplicate indexes** (same columns, same method):
- `nodes.idx_nodes_title_gin` vs `nodes.nodes_title_trgm_idx`
- `tag_translations.idx_tag_translations_label_gin` vs `tag_translations.tag_translations_label_trgm_idx`
- `translations.idx_translations_title_gin` vs `translations.translations_title_trgm_idx`
- `user_node_preferences.unsp_user_context_pos_idx` vs `user_node_preferences.user_node_preferences_lookup_idx`

### 2-D. Functions (DB)
Present (app): `change_folder_permission`, `change_node_permission`, `create_folder` (DEFINER), `create_group` (DEFINER), `create_node` (INVOKER), `create_node_with_metadata` (INVOKER), `direct_share` (×2 DEFINER), `ensure_user_profile`, `get_feed`, `get_feed_custom_sort`, `get_folder_permission`, `get_friend_bar`, `get_node_permission`, `get_nodes_in_folder`, `get_visible_node_by_id`, `get_visible_nodes`, `group_share` (×2 DEFINER), `group_unshare`, `has_folder_permission`, `has_node_permission`, `liked_tag_palette` (INVOKER), `rls_auto_enable`, `search_nodes`, `share_folder`, `unshare`, `upsert_rating`.

| Issue | Status |
|---|---|
| `direct_share` and `group_share` have two overloads each | **[FAIL]** silent dispatch risk. |
| `create_node`, `create_node_with_metadata`, `liked_tag_palette` are `SECURITY INVOKER` | **[FAIL]** TAD §7 mandates DEFINER. |
| Missing: `set_node_deleted`, `rename_folder`, `create_tag_with_translation`, `add_node_to_folder` | **[FAIL — CRITICAL]** first two have live TS callers. |

### 2-E. RLS policies — critical findings

Visibility on `nodes`: policies `nodes_select_policy` and `nodes_select_visible` (duplicate, semantically identical) correctly mirror PRD §5. **[PASS semantics]** / **[FAIL hygiene: duplicated]**.

**Wide-open write policies (CRITICAL):**
- `causes_insert_policy WITH CHECK (true)` — anyone can insert any cause.
- `causes_delete_policy USING (true)` — anyone can delete any cause → cascades edges.
- `causes_update_policy USING (true) WITH CHECK (true)`.
- `edges_insert_policy WITH CHECK (true)` — self-grant visibility.
- `edges_delete_policy USING (true)` — mass revoke.
- `edges_update_policy USING (true) WITH CHECK (true)` — mutate direction/permission/user_id.

**Other duplicates:** `causes_select_own`+`causes_select_policy`, `edges_select_own`+`edges_select_policy`, `nodes_update_policy`+`nodes_update`.

### 2-F. Migration tracking
`supabase_migrations.schema_migrations` = 0 rows. Migrations applied via ad-hoc `scripts/apply-migration-*.js`; no DB-side migration history.

---

## 3. TYPESCRIPT CODE AUDIT

### 3-A. `lib/db/`
| File · symbol | Status | Notes |
|---|---|---|
| `nodes.ts::createNode` | **[PASS]** | RPC path; INVOKER. |
| `nodes.ts::softDeleteNode`, `restoreNode` | **[FAIL]** | Call missing `set_node_deleted`. |
| `nodes.ts::hardDeleteNode` | **[PASS w/deviation]** | Direct `.delete()` acknowledged in NODE-002. |
| `nodes.ts::getTrashedNodes`, `getTrashedCount` | **[PASS]** | Owner-scoped read. |
| `nodes.ts::getNodeById` | **[FAIL — visibility leak]** | Direct SELECT with no owner/edge check (line 148). |
| `visibility.ts::getVisibleNodes`, `getVisibleNodeById` | **[PASS]** | RPC. |
| `feed.ts::getFeed` | **[PASS]** | Canonical RPC. |
| `causes.ts` | **[MISSING]** | File doesn't exist (cause writes live in Postgres funcs — architecturally fine). |
| `edges.ts` | **[MISSING]** | Same. |
| `tags.ts` — `createOrGetTag` | **[PARTIAL]** | Multi-table TS inserts (tags + tag_translations), non-atomic, race-mitigated. Should be RPC. |
| `tags.ts` — `addTagToNode`, `removeTagFromNode`, `getTagsForNode`, `getAllTags` | **[PASS]** | Single-table / read. |
| `ratings.ts::upsertRating` | **[PASS]** | RPC. |
| `ratings.ts::getRatingsForNode` | **[PASS]** | Read. |
| `folders.ts::createFolder` | **[PARTIAL]** | RPC exists but body broken (color_hex). |
| `folders.ts::renameFolder` | **[FAIL]** | RPC missing in DB. |
| `folders.ts::deleteFolder` | **[FAIL write authority]** | Direct `.update({deleted_at})`. |
| `folders.ts::moveFolder` | **[FAIL write authority]** | Direct `.update()`. |
| `folders.ts::addNodeToFolder` | **[FAIL write authority]** | Direct `.insert("folder_edges")`. P0-T03 mandated RPC `add_node_to_folder`, never created. |
| `folders.ts::removeNodeFromFolder` | **[FAIL write authority]** | Direct `.delete`. |
| `folders.ts::getFolderTree` | **[PARTIAL]** | N+1 edge queries in loop (lines 175–192). |
| `folders.ts::getUserFolders` | **[PASS]** | Read. |
| `permissions.ts` (all) | **[PASS]** | Fully implemented; DEVIATION from 00_PROGRESS note which says "unused" — actually imported by folders.ts, sharing.ts, usePermissions, SharePickerModal. |
| `friends.ts` — all 4 | **[PASS w/deviation]** | Single-table TS writes on `friend_invites`; allowed temporarily per TAD §8. |
| `groups.ts` | **[MISSING]** | No module; `createGroup` lives in `sharing.ts`; no `addGroupMember`/`getGroupMembers`. |
| `sharing.ts::directShare, groupShare, groupUnshare, shareFolder, unshare, createGroup` | **[PASS]** | All RPC. |
| `sharing.ts::unshareFolderOp` | **[FAIL write authority]** | Direct `.delete("causes")` (line 302). |
| `sharing.ts::getShareCausesForNode` | **[PASS]** | Read. |
| `users.ts::createUserProfile` | **[STUB]** | `throw new Error("Not implemented - P1-T03")`. |
| `users.ts::updateDisplayName`, `updateAvatar` | **[PARTIAL]** | Multi-table non-atomic (`users.update` + `activity_log.insert`). |
| `cardDetail.ts::updateNodeTitle` | **[FAIL write authority]** | Direct `.update("nodes")`. |
| `cardDetail.ts::incrementViewCount` | **[FAIL write authority]** | Direct insert/update on `nodes_sort_cache`. |
| `cardDetail.ts::getCardDetail` | **[PASS]** | Reads, gated by `getVisibleNodeById`. |
| `nodePreferences.ts::setCustomOrder` | **[PARTIAL]** | Delete-then-insert, non-atomic. |
| `search.ts::searchNodes` | **[PASS]** | RPC. |
| `folder-feed.ts` | **[PASS]** | RPC. |
| `rpc.ts` helper | **[PASS]** | Uses anon-cookie server client. |

### 3-B. `lib/supabase/`
- `client.ts` **[PASS]** browser singleton.
- `server.ts` **[PASS]** cookie-bound SSR. Alias `createServerSupabaseClient = getSupabaseServerClient` is sync-named but async — cosmetic.
- `service.ts` **[PASS]** service-role key server-only; throws clearly if unset.

### 3-C. Pages
- `app/(app)/feed/page.tsx` **[PASS]** real `getFeed` + `getUserFolders` SSR.
- `app/(app)/trash/page.tsx` **[PARTIAL]** real data; actions broken via missing `set_node_deleted`.
- `app/(app)/layout.tsx` **[STUB]** hardcoded stubItems, `userId="stub-user-id"`, `displayName="JS"` — lines 50–62, 78–96, 183, 201–203, 330, 360–362.
- `app/page.tsx` **[PASS]** redirect to `/feed`.
- `app/(auth)/login, signup, callback` **[PASS]**.

### 3-D. Components (23 .tsx)
| File | Status |
|---|---|
| `bars/TopBar, BottomBar, DesktopSidebar, ContextStrip` | **[PARTIAL]** receive stubs from layout. |
| `bars/BreadcrumbNav, DesktopToolbar, FabSpeedDial, FeedTabs, FolderPathBar, MineSubTabs, SortViewRow, BottomBarAvatar` | **[PASS]** |
| `bars/TagsStrip` | **[STUB]** hardcoded `stubTags` (line 13). |
| `sheets/AddCardSheet` | **[PARTIAL]** real `createNodeAction`; `STUB_TAGS`/`STUB_FRIENDS` for picker (lines 12, 16); stub URL preview (line 84). |
| `sheets/AddFolderSheet` | **[PASS]** wired; blocked by broken `create_folder`. |
| `modals/CardDetailSheet` | **[PASS]** |
| `modals/ProfileModal` | **[PARTIAL]** receives stub userId. |
| `modals/SharePickerModal` | **[FAIL — architecture]** `"use client"` imports from `@/lib/db/*` → throws at runtime (service-role env undefined in browser). |
| `selection/MultiSelectContextMenu, SelectionOverlay` | **[PARTIAL]** most actions are "coming soon" toasts. |
| `selection/UndoToast` | **[PASS]** wired; depends on broken RPC. |
| `selection/SelectionCloseButton` | **[PASS]** |
| `ui/PermissionSelector` | **[PASS]** |

`lib/hooks/usePermissions.ts` — client hook importing `lib/db/permissions.ts` **[FAIL — architecture]** same root cause as SharePickerModal.
`lib/hooks/useRealtime.ts` — **[STUB]** TODOs at lines 20, 39, 50 (P10 not started).

---

## 4. RPC COMPLIANCE — direct PostgREST writes outside `.rpc()`

23 violations across 8 files:

| File:line | Op · Table | Verdict |
|---|---|---|
| `app/(auth)/callback/route.ts:54` | upsert `users` | **[OK]** single-table. |
| `app/lib/actions/profile.ts:92, 105, 175, 189` | update `users` + insert `activity_log` (×2 paths) | **[FAIL]** multi-table non-atomic. |
| `lib/db/users.ts:71, 81, 109, 119` | same pattern (duplicate surface) | **[FAIL]** |
| `lib/db/friends.ts:68, 91, 111` | insert/update/delete `friend_invites` | **[OK temporarily]** |
| `lib/db/sharing.ts:303` | delete `causes` (unshareFolderOp) | **[FAIL]** |
| `lib/db/tags.ts:117, 127, 146` | insert `tags` / insert `tag_translations` / delete `tags` (orphan cleanup) | **[FAIL]** multi-table flow. |
| `lib/db/tags.ts:177, 198` | insert/delete `tag_edges` | **[OK]** single-table. |
| `lib/db/nodes.ts:258` | delete `nodes` (hard delete) | **[OK per NODE-002]** |
| `lib/db/nodePreferences.ts:34, 53` | delete+insert `user_node_preferences` | **[FAIL]** |
| `lib/db/folders.ts:130, 254, 286, 314` | update folders / insert/delete folder_edges / update folders | **[FAIL]** 4 violations. |
| `lib/db/cardDetail.ts:165, 188, 194` | update nodes / insert/update nodes_sort_cache | **[FAIL]** |
| `supabase/functions/extract-node-metadata/index.ts:339` | insert activity_log | **[OK]** Edge Function. |

---

## 5. ATOMIC TRANSACTION AUDIT

| Write path | Verdict |
|---|---|
| `createNode` (nodes+nodes_sort_cache+tags) | **[PASS]** atomic; **[FAIL]** INVOKER not DEFINER. |
| `upsertRating` (ratings+nodes_sort_cache) | **[PASS]** |
| Direct/Group/Folder share (causes+edges) | **[PASS]** (but two overloads live). |
| Folder unshare by op_id | **[FAIL]** TS direct delete; no RPC. |
| Tag create (tags+tag_translations) | **[FAIL]** non-atomic. |
| `setCustomOrder` | **[FAIL]** non-atomic. |
| Profile / avatar change (users+activity_log) | **[FAIL]** non-atomic (×2 duplicate paths). |
| Folder rename / soft-delete node | **[FAIL]** target RPCs missing. |

---

## 6. VISIBILITY INVARIANT AUDIT

PRD §3/§5 — visibility = owner OR active edge.

- `get_feed`, `get_visible_nodes`, `get_visible_node_by_id` RPCs + `nodes_select_*` RLS policies **[PASS]** semantically mirror §5.
- `lib/db/nodes.ts::getNodeById` **[FAIL]** bypasses visibility (direct SELECT by id, `deleted_at IS NULL` only).
- Owner-based queries: only Mine tab (via `get_feed p_view='mine'`) and `getTrashedNodes` (owner-only by design). **[PASS]**
- Wide-open `edges`/`causes` write RLS (section 2-E) **defeats the invariant from the write side**, regardless of read queries being correct.

---

## 7. STUB / HARDCODED-DATA / TODO AUDIT

### Hardcoded mock data in production paths
- `app/(app)/layout.tsx:50` `stubItems` (12 fake friends/groups) feeds BottomBar, DesktopSidebar, ContextStrip.
- `app/(app)/layout.tsx:78` `tagLabelMap` / `tagColorMap` hardcoded.
- `app/(app)/layout.tsx:201, 360` `userId="stub-user-id"`; `:183, 203, 361` `displayName="JS"`.
- `app/(app)/feed/_components/FeedGrid.tsx:67` `STUB_ITEMS` (10 fake cards) — real users with empty feeds see these.
- `components/sheets/AddCardSheet.tsx:12, 16, 84` `STUB_TAGS`, `STUB_FRIENDS`, stub URL-preview via `setTimeout`.
- `components/bars/TagsStrip.tsx:13` `stubTags`.
- `components/sidebar/DesktopSidebar.tsx:109`, `components/bars/BottomBar.tsx:105` stub search inputs.
- `components/selection/SelectionOverlay.tsx:87`, `app/(app)/layout.tsx:304`, `components/selection/MultiSelectContextMenu.tsx` — "coming soon" toasts for template/tag FAB actions and most context-menu actions.
- `app/(app)/feed/_components/views/HorizView.tsx:141, 151` "stub: group by folderColor as proxy".

### TODO / NOT_IMPLEMENTED
- `lib/db/users.ts:15–21` `createUserProfile` stub.
- `lib/hooks/useRealtime.ts:20, 39, 50` three TODOs (P10).
- `components/sheets/AddCardSheet.tsx:143` `TODO P8-future: apply selectedTag + selectedFriends`.

### `console.log` in production paths
- `proxy.ts:41` (file is dead-code as noted, but would run if middleware registered).
- No `console.log` found in `app/`, `lib/`, `components/`.

### Unconditional empty returns
None found that are pure stubs.

---

## 8. MIGRATION FILES AUDIT

| File | Summary | Applied? |
|---|---|---|
| 001 initial_schema | All base tables + indexes | Yes (minus later drops). |
| 002 rls | Enable RLS permissively | Yes. |
| 003 rls_policies | Tighten nodes/edges/causes SELECT | Yes. |
| 004 rpc_create_node | `create_node` | Yes (INVOKER). |
| 005 get_visible_nodes | `get_visible_nodes` | Yes. |
| 006 rpc_direct_share | `direct_share` v1 | Yes (one overload). |
| 007 rpc_unshare | `unshare` | Yes. |
| 008 rpc_group_share | `group_share` v1, `group_unshare` | Yes (one overload). |
| 009 rls_tighten | Adds `nodes_select_visible` | Yes. |
| 010 unified_permissions | Drops folder/group_admins; adds `edges.permission`, `folders.is_project`, perm helpers, new overloads of share RPCs, `folders.color_hex`(?) | **Partial** — `color_hex` ALTER missing; tables correctly dropped. |
| 011 friend_invites | `friend_invites` | Yes. |
| 012 restore_admin_tables | Recreate folder_admins/group_admins | **No**. |
| 013_ensure_user_profile_trigger | trigger | Yes. |
| 013_get_nodes_in_folder | RPC | Yes. |
| 014 backfill_missing_user_profiles | Data fix | Yes (presumed). |
| 015 upsert_rating | RPC | Yes. |
| 016 sort_functions | Sort-aware variants | Yes. |
| 017 user_node_preferences | Table + RLS | Yes. |
| 018 thumbnails_storage_bucket | Bucket | Unknown (storage schema). |
| 019 create_node_with_metadata | RPC + `liked_tag_palette` | Yes. |
| 020 feed_view_mine_filter | Extends `get_visible_nodes` | Yes. |
| 021 search_nodes | pg_trgm + `search_nodes` | Yes. |
| 022 get_feed | Master RPC | Yes. |
| 023 fix_direction_ambiguity | Fix | Yes. |
| 024 fix_share_count_ambiguity | Fix | Yes. |
| 025 create_user_profile | RPC | Unknown (name not visible in listing). |
| 026 create_tag | `create_tag_with_translation` | **No**. |
| 027 node_deleted | `set_node_deleted` | **No** — critical. |
| 028 folder_rename | `rename_folder` | **No** — critical. |
| 029 create_folder_auth | Redefine `create_folder` DEFINER + `auth.uid()` | Yes (but references missing column). |

**Unapplied migrations with live TS callers:** 027 (`set_node_deleted`), 028 (`rename_folder`). **Plus** 012 (admin tables), 026 (tag RPC — not yet a caller but needed to make tag-create atomic).

---

## 9. PHASE GATE CONDITIONS (P0–P7)

### P0 Foundation Hardening
- Folder color deterministic — **[FAIL]** (column missing + function would error).
- Folder writes have defined authority — **[FAIL]** (add/remove/move/delete use TS direct writes).
- No randomness in persistence — **[PASS]**.
- No mixed responsibility — **[FAIL]**.

### P1 Foundation
- App runs — **[UNKNOWN]**.
- Login+signup — **[UNKNOWN]**, pages exist.
- 23 tables with correct schema — **[FAIL]** (`folder_admins`, `group_admins`, `folders.color_hex` missing).
- Seed data — **[PASS]**.
- No external avatar URLs — **[UNKNOWN]** (no automated check).
- RLS enabled — **[PASS]**.

### P2 Core Feed
- Visibility correct via RPC — **[PASS]**.
- Node creation persists — **[PASS]**.
- Only one visibility mechanism — **[FAIL]** (`getNodeById` bypass).

### P3 Sharing
- Direct share atomic — **[PASS]**.
- Recipient sees shared node — **[PASS]** semantically.
- Unshare deterministic — **[PASS]** direct; **[FAIL]** folder (TS delete).
- Group share/unshare — **[PASS]**.
- Friend derivation (deviation to friend_invites) — **[ACCEPTED]**.
- RLS prevents unauthorized access — **[FAIL — CRITICAL]** (wide-open edges/causes writes).

### P4 Folders
- Folder creation/nesting/cycles — **[FAIL]** (create broken; no cycle check in deployed RPC).
- Folder share op_id — **[PASS]**.
- Folder unshare by op_id — **[PARTIAL]** (TS-side, no RPC).
- Breadcrumb — **[UNKNOWN]**.
- `addNodeToFolder` has no edge/cause effect — **[PASS]**; write authority — **[FAIL]**.
- Nested folder subtree feed — **[PASS]**.

### P5 UI Shell
- Full bars/FAB/modals/5 views — **[PARTIAL]** on stub data.
- FAB sole creation entry — **[PASS]**.
- Profile modal rate limits — **[PARTIAL]** operates on stub userId.
- No Bottom Nav Bar — **[PASS]**.
- Tags Strip visible-only scope — **[FAIL]** stub array.

### P6 Tags & Ratings
- Tag CRUD/filter — **[PASS]** (non-atomic create).
- Tag colors consistent — **[PASS]**.
- Rating UPSERT+cache in one tx — **[PASS]** RPC.
- Sort dropdown — **[PASS]**.
- No `tags.name` column — **[PASS]**.

### P7 Advanced Interactions
- All drag targets — **[PARTIAL]** (trash drop broken via missing RPC).
- Auto-create folder/group with cancel — **[PARTIAL]** (createFolder broken).
- Long-press wobble — **[PASS]**.
- Trash restore preserves edges — **[FAIL]** (RPC missing).
- Permanent delete behind confirmation — **[PASS]**.

---

## 10. PRIORITY FIX LIST

### CRITICAL
1. **Wide-open RLS on `edges` and `causes`** — INSERT/UPDATE/DELETE policies use `true`. Any authenticated user can grant themselves visibility to any node, mutate directions/permissions, or mass-delete causes (cascading edges). Breaks PRD §3. Restrict to service-role only (or `auth.uid()` matching `created_by`/`sender_id`).
2. **`middleware.ts` missing at project root** (only `proxy.ts` with wrong export name). Auth guard not registered by Next.js. Rename file and export.
3. **Migration 027 (`set_node_deleted`) not applied** — `softDeleteNode`/`restoreNode` are runtime-broken. Apply migration.
4. **Migration 028 (`rename_folder`) not applied** — `renameFolder` runtime-broken. Apply migration.
5. **`folders.color_hex` column missing** — deployed `create_folder` references it; folder creation will throw at runtime. Add the column (`ALTER TABLE folders ADD COLUMN color_hex TEXT NOT NULL DEFAULT '#D85A30'`) and/or redeploy 029 after adding the column.
6. **Migration 012 not applied** — `folder_admins`/`group_admins` tables absent despite CLEANUP-A marked ✅. Apply migration.
7. **`SharePickerModal.tsx` + `lib/hooks/usePermissions.ts`** (client-side) import from `@/lib/db/*` → service-role client throws in browser at runtime. Move to Server Actions / API routes.
8. **`app/(app)/layout.tsx` ships `userId="stub-user-id"`, `displayName="JS"`, `stubItems`** — Profile modal operates on a fake user; friends bar shows mock data. Wire real `user` and `getFriendBar()` SSR.
9. **`FeedGrid.tsx` `STUB_ITEMS` fallback** (line 67) — real users with empty feeds see 10 fake demo cards. Remove fallback; use real empty-state branch already in code.
10. **Two overloads of `direct_share`/`group_share` in DB** — silent dispatch. Drop the obsolete overload; keep only unified-permissions version.

### HIGH
11. **`getNodeById` (`lib/db/nodes.ts:148`) bypasses visibility.** Route through `getVisibleNodeById` or add owner+edge check.
12. **`unshareFolderOp` direct `.delete("causes")`** — create `unshare_folder_op` RPC.
13. **`createOrGetTag` non-atomic** — apply migration 026 and switch to `create_tag_with_translation` RPC.
14. **`create_node` / `create_node_with_metadata` are INVOKER** — redefine as `SECURITY DEFINER` per TAD §7.
15. **Folder writes** (`addNodeToFolder`, `removeNodeFromFolder`, `deleteFolder`, `moveFolder`) — create RPCs (P0-T03 explicitly required `add_node_to_folder`).
16. **Profile/avatar change duplication** — two identical implementations in `lib/db/users.ts` and `app/lib/actions/profile.ts`; both non-atomic. Consolidate into single RPC.
17. **`setCustomOrder`** — wrap delete+insert in one RPC.
18. **`cardDetail.ts::updateNodeTitle` / `incrementViewCount`** — wrap in RPCs.
19. **Duplicate RLS policies** on `nodes`, `causes`, `edges` — drop the `_policy` duplicates (keep `_own`/`_visible`).
20. **Duplicate GIN/btree indexes** on `nodes.title`, `tag_translations.label`, `translations.title`, `user_node_preferences` — drop one of each pair.
21. **`lib/db/users.ts::createUserProfile`** — remove stub or implement (currently dead via trigger path).
22. **`TagsStrip.tsx` uses `stubTags`** — implement `getVisibleTags` (P5-T05).
23. **`AddCardSheet.tsx`** — replace `STUB_TAGS`/`STUB_FRIENDS` with real `getAllTags`/`getFriendBar`; replace stub preview with real Edge-Function call.
24. **`lib/hooks/useRealtime.ts`** — either delete the stub file until P10 starts or hide it behind a feature flag.

### MEDIUM
25. **`getFolderTree`** N+1 edge queries (`lib/db/folders.ts:175–192`) — replace with a single JOIN.
26. **`create_folder` deployed body has no cycle check** (P4-T01 requirement) — add before INSERT.
27. **`app/(app)/layout.tsx` `tagLabelMap`/`tagColorMap`** — derive from real tag fetch.
28. **`HorizView.tsx` folder/sub-folder grouping stub** — group by actual sub-folder via `folder_edges`.
29. **`proxy.ts:41` `console.log`** — remove when renaming to `middleware.ts`.
30. **Migration `supabase_migrations.schema_migrations` empty** — switch to `supabase db push` or manually record applied versions for future migration ordering.
31. **00_PROGRESS.md line 159 claim "permissions.ts unused"** is stale (imported by 4 files). Reconcile.

---

*End of AUDIT-01 report. No fixes applied. Report delivered read-only per task spec.*
