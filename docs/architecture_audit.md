# Architecture Audit Report

## Compliance with Specs

### 1. Feed System

- **Canonical Feed Query**: SQL migration `022_get_feed.sql` defines `get_feed` function matching SQL SPEC §2 return shape. No other feed query functions exist (e.g., `get_visible_nodes`, `search_nodes`, `get_nodes_in_folder` were replaced per spec).
- **Pipeline Order**: Deviation detected — dedup (CTE stage 10) occurs before cursor pagination (stage 11). Spec §1 requires cursor → ordering → dedup → limit. Any deviation = CRITICAL FAILURE.
- **TypeScript Call Wrapper**: `lib/db/feed.ts` is the sole authority for feed RPC calls. ✅
- **RPC to SQL mapping**: `SORT_TO_RPC` in `lib/utils/feedParams.ts:43` maps `highest_rated` → `"rating"`, but SQL `get_feed` expects `"highest_rated"`. Cursor filter and ORDER BY fall through to default, breaking sort. = CRITICAL FAILURE.

### 2. Data Access Layer

- **RPC Functions**: All core write operations use Supabase RPC (`create_node_with_metadata`, `direct_share`, `group_share`, `create_folder`, `share_folder`, etc.) defined in migrations 010, 019, 020. ✅
- **Permission Checks**: `lib/db/permissions.ts` uses RPC `has_node_permission` and `has_folder_permission` (defined in migration 010). ✅
- **N+1 Query**: `getFolderTree` (`lib/db/folders.ts:245-270`) loops over shared causes and performs per-cause edge lookups inside the loop. = MAJOR RISK.

### 3. Type Safety

- **Validation**: Zod schemas in `app/lib/actions/dnd.ts` and `app/lib/actions/createNode.ts` enforce shapes. RPC payloads are not centrally validated beyond TypeScript types.
- **Return Types**: `getFeed` casts RPC result via `(data ?? []) as unknown as FeedNode[]` without runtime validation. Minor gap.

### 4. Client-Server Boundaries

- **No client DB writes**: No `supabaseBrowser.from(...).insert/update/delete` found in client components. ✅
- **Client reads**: `lib/hooks/useFeed.ts` calls `supabaseBrowser.rpc("get_feed", ...)` directly from client for read-only feed fetching. TAD §4.3 prohibits direct client DB writes; reads are not prohibited.
- **Server actions**: All files in `app/lib/actions/` include `"use server"` directive. ✅
- **Missing middleware**: TAD §2 references auth middleware, but `middleware.ts` does not exist in the project root.

### 5. Naming & Structure

- **File locations**: Match TAD §3 file tree. `lib/db/feed.ts` is the single feed query file. `lib/dnd/DndProvider.tsx` is the drag-drop layer. ✅
- **Folder table name**: `folders` table; `is_project` column added in migration 010 (not in initial schema 001). ✅
- **Custom sort table name**: Migration 017 names table `user_node_preferences`. SQL SPEC §4 references `user_node_sort_positions`. Schema is functionally identical (user_id, scope_key, node_id, position). Naming divergence noted.

## Potential Bugs

### CRITICAL FAILURES

1. **`highest_rated` sort broken**
   - `lib/utils/feedParams.ts:43` maps `highest_rated` → `"rating"`.
   - `get_feed` SQL expects `"highest_rated"`.
   - When selected, cursor comparison falls to `ELSE TRUE`, and ORDER BY has no matching `WHEN`, so sort degrades to `node_id ASC` only.

2. **Feed SQL pipeline order deviation**
   - Migration 022 implements: visibility+block → context → view → filters → search → meta → tags → **dedup** → **cursor+ordering+limit**.
   - SQL SPEC §1 §2 requires: ... → cursor → ordering → **dedup** → limit.
   - Dedup occurs before cursor pagination, not after ordering as spec states.

### MAJOR RISKS

4. **`createNode` duplicate check race condition**
   - `lib/db/nodes.ts:22-42` checks for existing URL, then calls `create_node_with_metadata` RPC.
   - Check and insert are not in the same transaction. Concurrent createNode calls with same URL can both pass the check and insert duplicates.
   - Fix: Move uniqueness check inside `create_node_with_metadata` RPC, or add a unique constraint on `(url, owner_id)` with `IS NULL` for deleted_at.

5. **`getFolderTree` N+1 query**
   - `lib/db/folders.ts:245-270` iterates `sharedCauses` and queries `edges` table once per cause inside the loop.
   - Should be rewritten as a single JOIN query.

6. **`unshareFolderOp` direct delete + weak permission check**
   - `lib/db/sharing.ts:230-250` performs `supabase.from("causes").delete()` directly (no RPC), bypassing the RPC atomicity pattern.
   - Docstring says "Verify requestingUserId is folder owner or has 'admin' permission", but code only checks `created_by = requestingUserId`.
   - A non-owner, non-admin who created a share cause could unshare, but owner/admin cannot necessarily unshare if they didn't create the cause.

### MINOR / INFO

7. **`mineSubTab` non-functional**
   - `lib/store/filterStore.ts` stores `mineSubTab` ('all' | 'not_shared' | 'shared').
   - `lib/utils/feedParams.ts` never passes it to `get_feed` RPC params.
   - UI control exists but has no backend effect.

8. **`FeedGrid` shows stub data instead of empty state**
   - `app/(app)/feed/_components/FeedGrid.tsx` uses `STUB_ITEMS` fallback for col/mason/list/horiz views when `displayNodes.length === 0`.
   - Free view correctly shows empty state. Other views show fake placeholder cards.

9. **Permission parameter not exposed in TS wrappers**
   - `direct_share`, `group_share`, and `share_folder` RPCs accept `p_permission` (migration 010), but `lib/db/sharing.ts` wrappers never pass it, always defaulting to `'view'`.
   - Product supports granular permissions, but UI/server-actions cannot set them.

10. **Custom sort table name divergence**
    - Migration 017: `user_node_preferences`.
    - SQL SPEC §4: `user_node_sort_positions`.
    - Schema and indexes are functionally equivalent; purely a naming inconsistency.

11. **Missing `middleware.ts`**
    - TAD §2 references auth middleware, but no `middleware.ts` exists in the project root.
    - Auth may be handled differently (e.g., page-level checks), but spec expects middleware layer.

## Recommendations

1. Fix `SORT_TO_RPC` mapping: change `highest_rated: "rating"` to `highest_rated: "highest_rated"` in `lib/utils/feedParams.ts:43`.
2. Move dedup CTE after cursor pagination in `022_get_feed.sql`, or update SQL SPEC §1 to match the actual proven pipeline order.
3. Move duplicate-URL check inside `create_node_with_metadata` RPC, or add a unique partial index on `(url, owner_id)` where `deleted_at IS NULL`.
4. Rewrite `getFolderTree` shared-cause edge check as a single JOIN instead of a loop.
5. Replace `unshareFolderOp` direct delete with an atomic RPC that validates folder owner/admin permissions.
6. Either wire `mineSubTab` into `get_feed` RPC parameters, or remove it from the filter store until the backend supports it.
7. Remove `STUB_ITEMS` fallback from `FeedGrid` production views; show proper empty states.
8. Expose `p_permission` parameter through `lib/db/sharing.ts` wrappers so the UI can set non-default share permissions.
9. Create `middleware.ts` for auth redirection per TAD §2, or update TAD to reflect the actual auth strategy used.
