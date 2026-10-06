# AUDIT-09 — Full Codebase Audit (MVP 2.0 Surface)

**Date:** 2026-03-19
**Scope:** Entire repository — Next.js 16.3 app (`app/`), libs (`lib/`), Chrome extension (`extension/` + `dist/`), Edge Function (`supabase/functions/extract-node-metadata`), migrations `001`–`134` (130 files), scripts, tests, e2e.
**Baseline:** AUDIT-08 (post-096 RPC hardening). All code added since was reviewed: migrations `097`–`134`, YouTube import module, MVP 2.0 UI overhaul, organize flow, extension v0.1.

## Executive Summary

| Severity | Count | Headline |
|----------|-------|----------|
| P0 — Critical | 0 | — |
| P1 — High | 1 | Client-side feed sorting reintroduced (FEED LOCK violation + pagination bug) |
| P2 — Medium | 3 | Anon edge-fn SSRF; RPC grant widening (128); dead-code cluster (~12 files) |
| P3 — Low | 6 | Stale generated types; TOCTOU dup check; probe RPCs; cosmetic/misc |

**Build state: all green.** `tsc` 0 errors, ESLint clean, Vitest **95/95** (6 files), `next build` OK (32 routes generated).

**Invariants:** all enforced — visibility = edges-only via SQL helpers; writes atomic cause→edges in RPCs; delete is soft-delete + FK cascade; feed is *almost* SQL-only (one P1 regression below). Service-role key never leaves server code. All 16 API routes and all server actions authenticate. Migrations 097–134 consistently gate every SECURITY DEFINER RPC (internal `auth.uid()` or role-aware `p_user_id` binding) and revoke PUBLIC/anon EXECUTE.

---

## P1 — High

### 1. Client-side feed sorting violates FEED LOCK and breaks under pagination — ✅ FIXED (2026-03-19)

**File:** `app/(app)/feed/_components/FeedHome.tsx` (was lines 40–54, 124–135, 144)

```ts
const cardSort = useSyncExternalStore(
  subscribePrefs,
  () => (localStorage.getItem("liked.cardSort") === "alpha" ? "alpha" : "created"),
  () => "created"
);
const sortedNodes = cardSort === "alpha"
  ? [...nodes].sort((a, b) => (a.title ?? a.text_content ?? "").localeCompare(b.title ?? b.text_content ?? ""))
  : nodes;
```

- **FEED LOCK violation** (`04_FEED_SQL_SPEC.md` / `03_TECHNICAL_ARCHITECTURE.md`): "no sorting outside SQL — SQL is the ONLY source of ordering truth." The alpha toggle re-sorted `get_feed` results client-side.
- **Correctness bug:** the sort ran on the fetched subset only. With >1 page (`p_limit` paging), "alpha" ordering was wrong globally — a `get_feed`-ordered page cannot be re-sorted into correct full-order locally.
- Sort state persisted in `localStorage` (`liked.cardSort`), driven by a Created/Alpha seg control in the feed head. (`FolderRail` has its own `liked.folderSort` pref for folder rows — separate mechanism, not feed data.)

**Resolution:** `get_feed`'s `p_sort` supports only `newest|oldest|most_shared|highest_rated|custom` (101_feed_pipeline_order.sql:268-288) — no `alpha` — and modifying feed SQL is disallowed. The client-side sort was therefore removed entirely: `cardSort`/`subscribePrefs`/`sortedNodes` deleted, seg control removed, cards render `nodes` in `get_feed` order. Feed ordering is again SQL-authoritative and correct under pagination. Verify: grep `cardSort|sortedNodes|useSyncExternalStore` in file → 0; `tsc --noEmit` 0; eslint 0.

---

## P2 — Medium

### 2. Edge Function `extract-node-metadata`: anonymous unauthenticated fetch proxy, no rate limit

**File:** `supabase/functions/extract-node-metadata/index.ts:80-141` + `deploy` notes (run with `--no-verify-jwt`)

- Function is deployed without platform JWT verification; it verifies the JWT itself, but **`userId === null` is fully accepted** (line 86). Rate limit (`overRateLimit`, line 105) and `activity_log` (line 132) apply **only when `userId` is known** — anonymous callers are unthrottled.
- `handleUrl` fetches an arbitrary caller-supplied URL server-side (line 152, `fetchWithTimeout`) with **no scheme/host/port validation or private-IP blocklist** → open-proxy / SSRF primitive running inside Supabase infra, returning extracted metadata oracle to the caller.
- Mitigated: thumbnail storage upload requires `userId` (line 171) — anonymous callers cannot write the `thumbnails` bucket; fetch capped at 8 s / 500 KB; response is metadata only.
- **Fix:** require a verified user (`401` when `!userId`), or at minimum rate-limit anonymous calls by IP and reject private/link-local hosts and non-http(s) schemes.

### 3. Migration 128 re-granted write RPCs to `authenticated` (defense-in-depth regression)

**Files:** `supabase/migrations/128_system_folder_routing.sql:132-137` vs `100_node_type_rpc_params.sql:75-77`

- Migration 100 deliberately locked `create_node_with_metadata` and `import_url` down to `service_role` only. Migration 128 re-granted both to `authenticated, service_role`.
- Both function bodies retain the role-aware gate (`auth.role()='service_role' OR (authenticated AND p_user_id IS NOT DISTINCT FROM auth.uid())`), so **no impersonation is possible** — but the intended lockdown was silently widened, and every app path (`createNodeAction`, `/api/import`, YouTube import) goes through the **service** client anyway.
- **Fix:** `REVOKE ... FROM authenticated` to restore 100's posture.

### 4. Dead-code cluster: pre-overhaul feed architecture left in the tree

No live importer exists for any of the following (verified by repo-wide grep, excluding `_archive/` and test files):

| File | Replaced by |
|------|-------------|
| `lib/hooks/useFeed.ts` | server page + `fetchFeedPageAction` |
| `lib/hooks/useFeedURLSync.ts` | server pages + URL searchParams |
| `lib/hooks/useSearchController.ts` | `searchParams.q` → `get_feed` |
| `lib/hooks/useDebouncedSearch.ts`, `useLocalStorage.ts` (still imported by FeedHome — **keep**) , `useLongPress.ts` | — |
| `lib/store/filterStore.ts`, `tagModeStore.ts`, `selectionStore.ts`, `uiStore.ts` | URL params / local component state |
| `lib/utils/feedParams.ts` (+ `feedParams.test.ts`, 37 tests for dead code) | `get_feed` params built inline |
| `lib/utils/tagColors.ts` | DB-driven `color_hex` |
| `lib/db/permissions.ts` (entire file) | permission checks inside SQL RPCs |
| `lib/db/folders.ts` — 8 of 9 exports (`listFolders`, `listTopFolders`, `getFolderById`, `listVisibleFolders`, `getFolderChildren`, `canViewFolder`, `getFolderPath`, `addNodeToFolder`) | `get_folders` / `get_folder_children` RPCs (123/131); only `getFoldersForNodes` still used |

Corrections: `useLocalStorage.ts` IS live (FeedHome sort + density toggles) — exclude it from the list. `_archive/` (949 KB) is excluded from `tsconfig` but its tests still run under Vitest.

**Risk:** dead modules keep compiling against stale RPC names and mislead future edits (e.g., `feedParams.ts` builds `get_feed` params for a signature that no longer exists). **Fix:** delete or move to `_archive`.

---

## P3 — Low

### 5. Stale generated types declare dropped RPCs
`lib/types/database.ts` still exports typings for functions dropped by `106`/`132`: `delete_folder`, `direct_share`, `get_folder_access_users`, `get_folder_memberships`, `get_social_timeline`, `group_share`, `group_unshare`, `revoke_group_admin`, `share_folder`, `unshare_folder_op`, `get_or_create_unsorted_folder`, `get_visible_nodes`, `search_nodes`, `get_nodes_in_folder`. No live callers (verified). Regenerate types.

### 6. TOCTOU duplicate pre-check in `createNode`
`lib/db/nodes.ts:104-120` queries `nodes` for an existing URL before calling `create_node_with_metadata` — redundant (the RPC raises `DUPLICATE_NODE` and unique index `071` enforces atomically), races with concurrent creates, and contradicts the write-rule "no duplicate check before write" for the create path. `importUrl` already handles the RPC error path correctly; `createNode` should too and drop the pre-query.

### 7. Read-helper probe surface (accepted pattern, persisting)
`122` grants `folder_is_visible`, `effective_folder_permission`, `effective_node_permission` to `authenticated` with caller-supplied `p_user_id` (needed internally by RLS/service calls). Any authed user can probe whether folder/node X would be visible/what permission user Y has — metadata leak only, same risk class as `091` helpers previously accepted.

### 8. Folder permission UI offers invalid options
`FolderView.tsx:36` includes `comment` and `reshare` in the folder share `PERMS`, but `lib/db/permissions.ts` documents them as invalid for folders (DB `folder_grants` CHECK accepts them). Cosmetic inconsistency between UI, DB, and doc contract.

### 9. `fetchFeedPageAction` lacks an explicit auth check
`app/lib/actions/feed.ts:15-20` delegates entirely to `get_feed`'s internal `P0003` gate — works, but every other action checks `auth.getUser()` first; anonymous calls currently produce an RPC error rather than a clean 401-style result.

### 10. Hygiene leftovers
- ~90 one-off `apply/verify/debug` scripts under `scripts/` plus `schema-dump.txt`, `.tmp-overflow-test.mjs` (ignored), `app/api/feed/route.ts` (auth'd but **unused** — feed page calls the server action directly).
- `proxy.ts` edge-guard whitelist (`/feed`, `/trash`, `/youtube`, `/social`) is stale vs. the route table — `/social` no longer exists; `/friends`, `/me`, `/notifications`, `/organize`, `/folders`, `/card` are guarded only by their own `getSessionUser()`+redirect (verified present — defense in depth exists, but the fast-path list is inaccurate).

---

## Invariant Verification

| Invariant | Result | Evidence |
|-----------|--------|----------|
| Feed = SQL only | ⚠ P1 finding | Sole caller `lib/db/feed.ts:53` → `get_feed`; but `FeedHome.tsx:52` re-sorts client-side |
| Visibility = edges | ✅ | `get_visible_node_by_id`, `_node_visible`, `effective_*_permission` — all edge/blocking based; card-detail gates on it (`lib/db/cardDetail.ts:35-52`) |
| Writes atomic cause→edges | ✅ | `create_node_with_metadata`, `import_url`, `create_folder` — single RPCs; service client |
| Delete = soft + cascade | ✅ | `set_node_deleted`, `trash_folder`, `delete_group` mark `deleted_at`; FKs `ON DELETE CASCADE` (111/121) |
| Service key server-only | ✅ | `lib/supabase/service.ts` + edge fn + `youtubeImport`/thumbnails only; no client import |
| RPC authz (097–134) | ✅ | Every SECURITY DEFINER gated (`auth.uid()` internal or role-aware `p_user_id`); PUBLIC/anon revoked — spot-checked 100/101/105/107/108/109/110/112/118/122/123/124/125/126/127/128/129/130/131/133/134 |
| No dropped-RPC callers | ✅ | All refs are comments/types only (prevents repeat of the 132→133 breakage) |
| API routes auth | ✅ | 16 routes: cookie `auth.getUser()` or Bearer `authenticateBearer` (`lib/supabase/bearer.ts`); CORS scoped to `chrome-extension://` |
| Server actions auth | ✅ | All via `requireUserId()`/`getSessionAuthUser()`/`auth.getUser()` or RPC-internal `auth.uid()` |
| No XSS | ✅ | No `dangerouslySetInnerHTML`/`eval`/`innerHTML` in live code; `target=_blank` all carry `rel=noopener`; YouTube embed ID is attr-escaped by JSX |
| Extension | ✅ | Minimal perms (`activeTab`,`storage`); non-extractable IndexedDB AES key; prod URL baked into `dist/`; all API responses validated; Bearer flow solid |
| YouTube module | ✅ | AES-256-GCM token vault (`lib/youtube/token-crypto.ts`), state-cookie CSRF + open-redirect guards in `connect`/`callback`, secrets server-only, atomic `import_url` write |
| Secrets in repo | ✅ | Regex sweep clean; e2e creds are a documented dedicated test account; `check-invariants-001.mjs` contains detection regexes, not keys |

## Verification

```
npx tsc --noEmit              → 0 errors
npm run lint                  → clean
npm test                      → 95/95 pass (6 files)
npm run build                 → OK, 32 routes
repo grep: dropped RPC names  → comments/types only
repo grep: service-key refs   → server + edge fn only
```

**Not verified by execution:** e2e suite (requires running app + seeded Supabase); live DB state (audit is code-level; `scripts/check-invariants-001.mjs` available for DB-side re-check).

## Recommended Order

1. P1: move alpha card-sort into `get_feed` (or drop the toggle) — restores FEED LOCK and correct pagination.
2. P2.2: gate edge function on verified `userId` (401 otherwise) + host allowlist for the URL fetch.
3. P2.3: `REVOKE ... FROM authenticated` on the two write RPCs (restore 100's posture).
4. P2.4: delete dead-code cluster; regen `lib/types/database.ts`.
5. P3 batch: drop `createNode` pre-check; add auth check to `fetchFeedPageAction`; refresh `proxy.ts` whitelist; remove `app/api/feed/route.ts` + script sprawl.
