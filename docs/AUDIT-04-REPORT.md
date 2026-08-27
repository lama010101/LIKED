# LIKED — Full Audit Report (Audit 04)

**Date:** 2026-08-26
**Scope:** Security, code quality, performance, error handling, architecture compliance (LIKED rules), test coverage, feature completeness
**Method:** Seven parallel evidence-based sub-audits + manual verification of every CRITICAL claim against source code
**Build status:** `tsc --noEmit` clean · `next build` exit 0 · `eslint` 1 error + 4 warnings

---

## 0. Build / Lint / Type Health

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (exit 0, no output) |
| `npm run build` | PASS (exit 0, 22 routes generated) |
| `npx eslint .` | 1 error, 4 warnings |

**ESLint findings:**
| File | Line | Severity | Issue |
|------|------|----------|-------|
| `e2e/youtube-intelligent-import.spec.ts` | 30:7 | error | `youtubeFolderId` is never reassigned — use `const` (`prefer-const`) |
| `app/(app)/feed/_components/FeedGrid.tsx` | 509:9 | warning | `showFolderGrid` unused |
| `app/global-error.tsx` | 10:3 | warning | `error` arg unused |
| `components/selection/SelectionOverlay.tsx` | 28:10 | warning | `addNodeToFolderAction` imported but unused |
| `e2e/youtube-intelligent-import.spec.ts` | 30:7 | warning | `youtubeFolderId` unused |

---

## 1. Security

### 1.1 Secrets — PASS
- `SUPABASE_SERVICE_ROLE_KEY` only accessed in `lib/supabase/service.ts:12` (server-only) and `supabase/functions/extract-node-metadata/index.ts:362` (Deno env). No client component imports it.
- All `NEXT_PUBLIC_*` vars are non-sensitive (URLs, anon key, extension ID, app URL, webstore URL).
- `.gitignore:35` covers `.env*`.

### 1.2 Auth — CRITICAL issues confirmed

**CRITICAL #1 — `applyTagToNodeAction` has no auth check**
- `app/lib/actions/applyTagToNode.ts:5-16` — calls `addTagToNode(tagId, nodeId)` with no `getUser()` / `requireUserId()`.
- `lib/db/tags.ts:153` — `addTagToNode` uses `getSupabaseServiceClient()` (service role, bypasses RLS), so there is **no auth enforcement at any layer**. Any client can attach any tag to any node.
- **Fix:** Add `await requireUserId()` at the top of `applyTagToNodeAction` and pass the user ID through to `addTagToNode` for ownership verification.

**CRITICAL #2 — YouTube API routes use insecure `getSession()`**
- `lib/youtube/client.ts:30` — `await supabase.auth.getSession()`. Per Supabase docs, `getSession()` reads from cookies without server verification; `getUser()` is required for security.
- Affects: `app/api/youtube/likes/route.ts:8`, `app/api/youtube/likes/[videoId]/route.ts:14`, `app/api/youtube/subscriptions/route.ts:8`, `app/api/youtube/subscriptions/[subscriptionId]/route.ts:14`.
- Also: `app/api/youtube/status/route.ts:23`, `app/api/youtube/disconnect/route.ts:13`, `app/api/youtube/callback/route.ts:43` use `getSession()` to read `provider_token`.
- **Fix:** Replace `getSession()` with `getUser()` and read `provider_token` from the verified user object. (Note: `provider_token` is on the session, not the user — Supabase is deprecating this pattern; the migration needs care. At minimum, call `getUser()` first to verify identity, then `getSession()` only to fetch `provider_token`.)

**HIGH #3 — Server actions throw uncaught errors with untyped returns**
- `app/lib/actions/sharing.ts:20-44` — `directShareAction`, `shareFolderAction`, `groupShareAction` have no try/catch; `getActorId()` throws on auth failure and the error propagates uncaught to the client.
- `app/lib/actions/friends.ts:14-77` — `removeFriendAction`, `blockUserAction` (no try/catch, return `Promise<void>`); `sendFriendInviteAction:75` re-throws unknown errors.
- **Fix:** Wrap each in try/catch and return `{ ok: true } | { ok: false, error: string }`.

**LOW #4 — `getUserFoldersAction` lacks entry-point auth check (defense-in-depth)**
- `app/lib/actions/getFolders.ts:5-18` — no auth check in the action, but `getUserFolders()` (`lib/db/folders.ts:50-54`) calls `getUser()` and returns `[]` if unauthenticated. Functionally safe; flagged for defense-in-depth consistency with other actions.

### 1.3 Ownership checks — PASS
- `app/api/folders/[id]/route.ts:20-33` — fetches `owner_id`, returns 403 if `folder.owner_id !== user.id`.
- `app/api/nodes/[id]/route.ts:20-33` — same pattern, returns 403 if not owner.

### 1.4 RLS — PASS (after verification)

The security sub-audit flagged migration `002_rls.sql:42-125` as CRITICAL for permissive `USING (true)` policies (`nodes_all`, `edges_all`, `tag_edges_all`, `group_nodes_all`, `folder_edges_all`). **Manual verification shows this is a FALSE POSITIVE:** migration `041_fix_rls_policy_layer.sql:10-66` explicitly drops every `_all` policy from 002. Current RLS state (per 041's post-migration comment block, lines 109-122):
- `nodes`, `edges`, `causes`, `folders`, `ratings` — SELECT restricted to owner/edge access; INSERT/UPDATE/DELETE service-role only.
- Remaining `USING (true)` policies are all `TO service_role` (legitimate for SECURITY DEFINER RPCs) or `TO authenticated` on admin lookup tables (`012_restore_admin_tables.sql:18-19` — intentional for admin transparency).

### 1.5 CORS — CRITICAL

**CRITICAL #5 — Edge Function wildcard CORS**
- `supabase/functions/extract-node-metadata/index.ts:60` — `"Access-Control-Allow-Origin": "*"`.
- This function is invoked from the Next.js server (not the browser), so the wildcard is lower-risk than it appears — but it is still callable from any origin if the URL is known. Restrict to the app's origin(s) or require an authenticated call.
- **Fix:** Reflect the `Origin` header against an allowlist (`NEXT_PUBLIC_APP_URL`, localhost variants for dev).

**PASS** — Extension routes use `extensionCorsHeaders()` (`lib/supabase/bearer.ts:58-67`) which only reflects `chrome-extension://` origins. No wildcard `*` anywhere in the Next.js app.

### 1.6 Security headers — MEDIUM (CSP missing)
- `next.config.ts:5-18` — X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, HSTS, Permissions-Policy all present.
- **Missing:** Content-Security-Policy. Required for defense-in-depth XSS mitigation (especially since the app embeds YouTube/Spotify/Suno iframes).
- **Fix:** Add a CSP header with `frame-src https://www.youtube.com https://open.spotify.com https://studio.suno.com 'self'`, `img-src 'self' data: https://*.supabase.co https://i.ytimg.com https://yt3.ggpht.com`, `script-src 'self' 'unsafe-inline'` (Next.js 16 Turbopack needs inline for hydration; tighten to nonces later).

### 1.7 SQL injection — PASS
- All DB access uses Supabase query builder or `.rpc()` with parameter objects. No raw SQL string concatenation with user input found in `app/**` or `lib/**`.

### 1.8 XSS — PASS
- Zero `dangerouslySetInnerHTML` usage across the entire codebase.

---

## 2. Architecture Compliance (LIKED Rules)

### 2.1 Feed = SQL only — PASS
- `lib/db/feed.ts:101-117` — single `supabase.rpc("get_feed", {...})` call, result returned as-is.
- `lib/hooks/useFeed.ts:158-163` — appends pages for infinite scroll (pagination only, no filter/sort/dedup).
- `app/(app)/feed/page.tsx:28` — calls `getFeed()` wrapper, no post-processing.
- No `.filter()`, `.sort()`, `Set`/`Map` dedup, or `.slice()` applied to feed data anywhere in the call chain.

### 2.2 Visibility = edges only — PASS
- `lib/db/visibility.ts:11` documents: "CRITICAL: This is the ONLY mechanism for determining visibility."
- `lib/db/visibility.ts:45-48` — single source: `get_visible_node_by_id` RPC. No secondary visibility computation in TypeScript.

### 2.3 Writes = cause → edges — PASS (with one CRITICAL exception)

**CRITICAL #6 — `addTagToNode` checks duplicates before writing**
- `lib/db/tags.ts:155-165` — SELECT-then-INSERT pattern:
  ```typescript
  const { data: existing } = await supabase.from("tag_edges").select("id")
    .eq("tag_id", tagId).eq("node_id", nodeId).maybeSingle();
  if (existing) return;  // ← duplicate-check-before-write
  ```
- Violates the LIKED write-system rule: "no duplicate-check-before-write". This is also non-atomic (race condition between SELECT and INSERT).
- **Note:** Tags are organizational only (PRD §6.6, no cause/edge required), so the cause→edges rule does not apply here — but the duplicate-check rule does.
- **Fix:** Replace with a single idempotent RPC using `INSERT ... ON CONFLICT (tag_id, node_id, folder_id) DO NOTHING` (mirror the pattern in `add_node_to_folder` RPC, `migration 036_folder_write_rpcs.sql:17-19`).

**PASS** — All other write paths verified atomic with cause + edges in a single transaction:
- `direct_share` (`lib/db/sharing.ts:58-77` → migration 006)
- `group_share` (`lib/db/sharing.ts:162-185` → migration 008)
- `share_folder` (`lib/db/sharing.ts:272-291` → migration 058)
- `unshare` (`lib/db/sharing.ts:92-113` → migration 007, FK cascade)
- `create_node_with_metadata` (`lib/db/nodes.ts:132-144` → migration 019)
- `import_url` (`lib/db/nodes.ts:192-203` → migration 066)
- `upsert_rating` (`lib/db/ratings.ts:48-52` → migration 015)
- `set_node_deleted` / hard delete via FK cascade (`lib/db/nodes.ts:257-260, 325-328`)

### 2.4 No logic outside DB — MEDIUM (presentation-layer grouping)

**MEDIUM #7 — HorizView filters feed data by direction**
- `app/(app)/feed/_components/views/HorizView.tsx:324-337` — `.filter((i) => i.dir === "mine")`, `.filter((i) => i.dir === "received")`, etc.
- **Context:** This is presentation-layer grouping for the horizontal view layout (PRD §11.2 D grouping), applied AFTER `get_feed` has already applied all visibility/context filters. It is not visibility filtering.
- **Fix:** Either document this as intentional presentation-layer behavior in the file, or move the grouping into `get_feed` as a `p_group_mode` parameter. Strict-rule compliance favors the latter.

### 2.5 Single source of truth / client-derived truth — PASS
- All 5 zustand stores hold only UI state:
  - `feedStore` — custom sort orders (drag-reorder UI state)
  - `filterStore` — view/sort/filter preferences
  - `uiStore` — modals, bars, drag state
  - `selectionStore` — multi-select state
  - `toastStore` — toast queue
- No store caches feed/nodes/folders as truth. No memory-only logic.

### 2.6 Deletion = cascade only — PASS
- Hard delete: single `DELETE FROM nodes` (`lib/db/nodes.ts:325-328`); FK `ON DELETE CASCADE` (`migration 001_initial_schema.sql:59`) handles dependents.
- Soft delete: `set_node_deleted` RPC sets `deleted_at`, preserves causes/edges for restore.
- Unshare: `DELETE FROM causes` (`migration 007`); edges cascade via FK.

---

## 3. Code Quality

### 3.1 console statements — LOW
- 24 server-side instances in `app/lib/actions/**`, `lib/db/**`, `app/api/**` — acceptable (server logs).
- 2 client-side instances in `lib/hooks/usePermissions.ts:49,108` — should use toast for user-visible feedback.

### 3.2 TODOs / Coming soon / stubs — MEDIUM (10 instances)
| File | Line | Issue |
|------|------|-------|
| `app/(app)/layout.tsx` | 497 | FAB template/tag actions show "Coming soon" |
| `app/(app)/feed/_components/FeedGrid.tsx` | 218 | Context menu action stub |
| `app/(app)/feed/_components/FeedGrid.tsx` | 370-372 | `TODO P9-T01: Folder filter chips do not exist yet` |
| `app/(app)/feed/_components/FeedGrid.tsx` | 382, 386, 390 | Share/Move/Tag menu actions show "Coming soon" |
| `components/selection/SelectionOverlay.tsx` | 245 | Picker actions (edit/moveToFolder/addToFolder) "coming soon" |
| `components/selection/SelectionOverlay.tsx` | 198-215 | `removeFromFolder` shows success toast without calling server action |
| `components/selection/SelectionOverlay.tsx` | 72-77 | Folder/group trashing "not yet wired" |
| `app/(app)/feed/_components/views/HorizView.tsx` | 295-306 | Sub-folder grouping uses `folderColor` as proxy |
| `components/bars/BottomBar.tsx` | 160 | Search stub |
| `components/sidebar/DesktopSidebar.tsx` | 109 | Search stub |

### 3.3 Type safety — MEDIUM (6 `eslint-disable` for `any`)
- 6 instances of `type AnySupabase = any` in `lib/db/{folders,nodes,sharing,rpc,tags,nodePreferences}.ts` — used for RPC return types where Supabase's generated types don't cover the RPC.
- `lib/db/nodePreferences.ts:16-17` documents: "user_node_preferences table was added in migration 017 but lib/types/database.ts has not been regenerated yet. CLEANUP-E will regenerate types."
- 1 `react-hooks/exhaustive-deps` disable in `lib/hooks/useFeedURLSync.ts:71-72` (intentional URL sync).
- No `as any`, `@ts-ignore`, or `@ts-expect-error` anywhere.

### 3.4 Empty catch blocks — PASS
- All empty catch blocks are documented non-fatal best-effort operations (localStorage graceful degradation, language fallback to 'en', friend invite backfill, etc.).

### 3.5 Dead code / stray files — LOW
- **Stray file:** `D:\LIKED\nul` (Windows null device artifact from a redirected command) — safe to delete.
- **Obsolete scripts:** `scripts/` contains ~60 one-off scripts:
  - `deploy-edge-function-v2.js` through `v19.js` + `final.js` (19 versions of the same deploy script)
  - `apply-migration-012.js` through `051.js` (individual migration appliers)
  - `audit-01.js`, `bug-inv-06-*.js`, `check-*.js`, `investigate-*.js`, `test-*.js`, `verify-*.js` (debug scripts)
- **Recommendation:** Move to `scripts/archive/` or delete; keep only `apply-migrations.js`, `generate-types.ts`, `reset-and-seed.js`.

### 3.6 Group feed view — PASS (corrected from AUDIT-03)
- AUDIT-03 reported group click as a no-op stub. **Current code is fully implemented:** `app/(app)/layout.tsx:523-535` — clicking a group sets `groupId` in filterStore and navigates to `/feed?group={id}`. Clicking the active group again clears it.

---

## 4. Performance

### 4.1 Database indexes — PASS (one MEDIUM gap)
- `nodes`: `nodes_owner_deleted_idx`, `nodes_created_at_idx`, `nodes_title_trgm_idx` (GIN), `nodes_url_owner_active_uniq`.
- `edges`: `edges_node_user_idx`, `edges_cause_idx`, `edges_permission_idx`, `edges_user_direction_idx`, `edges_sender_direction_idx`, `edges_node_user_direction_idx`.
- `folders`: `folders_owner_idx`, `folders_parent_idx`, `folders_deleted_at_idx` (migration 075), `folders_is_project_idx`.
- `tag_edges`: `tag_edges_node_tag_idx`.
- `card_positions`: `idx_card_positions_user_folder`, `idx_card_positions_user_node`.
- `node_notes`: `node_notes_node_user_key` (unique), `node_notes_user_idx`, `node_notes_content_trgm_idx` (GIN).

**MEDIUM #8 — `ratings` table missing indexes**
- `migration 001_initial_schema.sql:72-80` — only has `UNIQUE(node_id, user_id)` constraint (which creates an index on `(node_id, user_id)`).
- Missing: dedicated `ratings_user_id_idx` for "ratings by user" queries. The unique constraint covers `node_id`-leading queries.
- **Fix:** `CREATE INDEX IF NOT EXISTS ratings_user_id_idx ON ratings(user_id);`

### 4.2 N+1 queries — PASS
- `lib/db/folders.ts:49-137` — `getUserFolders()` uses batched queries (single query for all folders, single IN-clause query for edge counts, single IN-clause query for thumbnails), then in-memory aggregation.
- `lib/db/cardDetail.ts:113-118` — `Promise.all` for parallel tags/ratings/sortCache/sharedWith.
- `lib/db/feed.ts:101-117` — single `get_feed` RPC, no per-card queries.

### 4.3 loading.tsx — PASS (corrected from AUDIT-03)
- AUDIT-03 reported zero `loading.tsx` files. **Current code has them:** `app/(app)/feed/loading.tsx`, `app/(app)/trash/loading.tsx`, `app/(app)/youtube/loading.tsx` all exist.
- Auth/extension routes (`/login`, `/signup`, `/extension/*`) don't have `loading.tsx` — low priority since they're small static pages.

### 4.4 Image optimization — PASS
- All 6 image-using files import `next/image`. Zero `<img>` tags in the codebase.

### 4.5 Revalidation — MEDIUM
- Actions WITH `revalidatePath`: `youtubeImport`, `createNode`, `dnd`, `cardDetail`, `createFolder`, `selection`, `trash`.
- Actions MISSING `revalidatePath`: `sharing.ts` (directShare, shareFolder, groupShare), `profile.ts` (updateDisplayName, uploadAvatar, updateLanguage), `friends.ts` (removeFriend, blockUser, sendFriendInvite), `applyTagToNode.ts`, `addNodeToFolder.ts`, `cardPositions.ts`, `notifications.ts` (markRead, markAllRead).
- `trash.ts:permanentlyDeleteFromTrash` revalidates `/trash` but misses `/feed`.
- **Fix:** Add `revalidatePath("/feed")` to all mutation actions that affect feed-visible state.

### 4.6 Large files — MEDIUM
| File | Lines | Note |
|------|-------|------|
| `components/modals/CardDetailSheet.tsx` | 1,367 | Embed detection, media, rating, tags, friend ratings — split candidate |
| `components/sheets/AddCardSheet.tsx` | 1,002 | URL parsing, preview, tag/folder/friend selection, save — split candidate |
| `app/(app)/youtube/page.tsx` | 839 | Connect, likes, subscriptions, import — split into `_components/` |
| `app/(app)/feed/_components/FeedGrid.tsx` | 637 | View switching, pagination, filter logic |
| `app/(app)/layout.tsx` | 603 | App shell, state, multiple useEffects |
| `components/modals/ProfileModal.tsx` | 592 | Profile edit + avatar upload |
| `components/bars/TopBar.tsx` | 570 | Mobile top bar, notifications, trash, profile |
| `components/bars/BottomBar.tsx` | 552 | Friend/group/folder navigation |

Not a correctness issue, but maintainability risk. Split the two 1000+ line files first.

---

## 5. Error Handling

### 5.1 Server actions — HIGH (uncaught throws + missing revalidation)
See §1.2 CRITICAL #3 and §4.5. Additionally:
- `app/lib/actions/friends.ts:75` — `sendFriendInviteAction` re-throws unknown errors instead of returning `{ ok: false, error }`.
- `app/lib/actions/trash.ts:69-83` — `permanentlyDeleteFromTrash` missing `revalidatePath("/feed")`.

### 5.2 API routes — HIGH (YouTube routes missing try/catch)
- `app/api/youtube/likes/route.ts:4-23`, `app/api/youtube/likes/[videoId]/route.ts:4-26`, `app/api/youtube/subscriptions/route.ts:4-23`, `app/api/youtube/subscriptions/[subscriptionId]/route.ts:4-26` — entire handlers have NO try/catch. Any throw becomes a 500 with no error body.
- **Fix:** Wrap each handler in try/catch returning `NextResponse.json({ error: "Internal server error" }, { status: 500 })`.
- All other API routes (`/api/import`, `/api/extension/*`, `/api/folders/[id]`, `/api/nodes/[id]`, `/api/users/create`, `/api/auth/signout`) have proper try/catch and status codes.

### 5.3 YouTube token expiry — PASS (corrected from AUDIT-03)
- AUDIT-03 reported no reconnect button. **Current code has it:** `app/(app)/youtube/page.tsx:472-485` and `571-584` render a "Reconnect YouTube" button when the error message contains "reconnect". `lib/youtube/client.ts:107,153,198,238` return reconnect hints on 403.

### 5.4 Edge Function — PASS
- `supabase/functions/extract-node-metadata/index.ts:415-419` — top-level catch returns `buildDefaults(...)` on any error, never throws.
- `fetchWithTimeout:111-126` returns null on any failure. `downloadAndUploadThumbnail:314-316` returns null on any failure. Rate limit fails open (`:329`). Every invocation logged (`:396-401, 421-428`).

### 5.5 Optimistic UI rollback — PASS
- `app/(app)/youtube/page.tsx:201-215, 218-232` — `handleUnlike`/`handleUnsubscribe` only update state on `res.ok`.
- `app/(app)/trash/_components/TrashView.tsx:71-77, 85-92` — `handleRestore`/`handlePermanentDelete` only filter on `result.ok`.
- `components/modals/CardDetailSheet.tsx:329-333` — `handleRemoveTag` only updates on `result.ok`.

### 5.6 Unhandled promise rejections — MEDIUM
- `app/(app)/layout.tsx:136-156, 254, 298` — `.then()` chains without `.catch()` for session/friend/group/tag/notification/trash loading.
- `components/modals/CardDetailSheet.tsx:231-240, 348-352, 373-380` — `fetchCardDetail().then()` without `.catch()`.
- `components/modals/NotificationPanel.tsx:25-31` — `getNotificationsAction().then()` without `.catch()`.
- **Fix:** Add `.catch()` handlers that set a sensible fallback state (empty array / null / error flag).

### 5.7 Empty catch blocks — PASS
- All empty catch blocks are documented non-fatal best-effort operations (language fallback, friend invite backfill, Google token revoke continuation, etc.).

---

## 6. Test Coverage

### 6.1 E2E inventory — 13 spec files, 68 tests
| File | Tests | Coverage |
|------|-------|----------|
| `e2e/api-unauthenticated.spec.ts` | 5 | Extension API 401 unauth |
| `e2e/auth-create-node.spec.ts` | 1 | URL node creation via AddCardSheet |
| `e2e/auth-login.spec.ts` | 5 | Login flow |
| `e2e/auth-signup.spec.ts` | 3 | Signup page |
| `e2e/auth-smoke.spec.ts` | 3 | Authenticated smoke (feed/trash/youtube render) |
| `e2e/extension-api.spec.ts` | 14 | Extension API authenticated |
| `e2e/extension-auth.spec.ts` | 2 | Extension auth relay |
| `e2e/extension-install.spec.ts` | 4 | Extension install page |
| `e2e/feed-authenticated.spec.ts` | 7 | Feed page, sidebar, profile modal, theme, language, sign out |
| `e2e/navigation-auth.spec.ts` | 1 | Authenticated nav |
| `e2e/navigation-unauth.spec.ts` | 4 | Unauth redirects |
| `e2e/youtube-api.spec.ts` | 13 | YouTube API routes |
| `e2e/youtube-intelligent-import.spec.ts` | 6 | Intelligent import via `/api/import` |

### 6.2 Test helpers — PASS
- `e2e/helpers/auth.ts:1-28` — `TEST_EMAIL`, `TEST_PASSWORD`, `STORAGE_STATE` (env-configurable).
- `e2e/helpers/setup.ts:1-16` — global setup logs in once, saves storage state for reuse.

### 6.3 Playwright config — PASS
- `playwright.config.ts:44` — baseURL `http://localhost:3001` (env-configurable via `BASE_URL`).
- `:37` — CI: 2 retries, local: 0.
- `:50-88` — `setup` project + `unauth` (11 specs) + `authed` (2 specs) with storage state reuse.
- `:92-101` — auto-starts dev server locally, skips when `BASE_URL` set.

### 6.4 Missing E2E coverage — HIGH
| Area | Status | Risk |
|------|--------|------|
| Sharing (direct/group/folder) | NO TESTS | HIGH |
| Trash/restore flow | NO TESTS (only page render) | MEDIUM |
| DnD operations (10 paths) | NO TESTS | MEDIUM |
| Card detail sheet (rate/edit/tag) | NO TESTS | MEDIUM |
| Folder CRUD | NO TESTS | MEDIUM |
| Tag operations (UI) | NO TESTS | LOW |
| YouTube full OAuth flow | PARTIAL (API only) | LOW |
| Extension full flow | NO TESTS (API only) | MEDIUM |
| Multi-select actions | NO TESTS | LOW |
| Profile modal actions (invite/block/signout) | PARTIAL (visibility only) | LOW |

### 6.5 Unit tests — HIGH (none exist)
- No `jest.config.*`, no `vitest.config.*`, no `*.test.ts` outside `e2e/`.
- Zero unit tests for server actions, DB layer, or utils.
- **Fix:** Add Vitest + React Testing Library; prioritize server actions and DB layer.

### 6.6 CI — HIGH (none configured)
- No `.github/workflows/` directory. `playwright.config.ts:36-39` references `process.env.CI` but no CI system is wired.
- **Fix:** Add `.github/workflows/e2e.yml` running Playwright on every PR.

---

## 7. Feature Completeness

### 7.1 Multi-select context menu — PARTIAL
| Action | Status | File:Line |
|--------|--------|-----------|
| `moveToTrash` | WIRED (nodes only) | `SelectionOverlay.tsx:69-92` |
| `giveAdmin` | WIRED | `SelectionOverlay.tsx:95-139` |
| `shareWith` | WIRED | `SelectionOverlay.tsx:142-170` |
| `addToGroup` | WIRED | `SelectionOverlay.tsx:173-196` |
| `removeTag` | WIRED | `SelectionOverlay.tsx:218-242` |
| `removeFromFolder` | STUB (toast without action) | `SelectionOverlay.tsx:198-215` |
| `edit` | STUB (picker coming soon) | `SelectionOverlay.tsx:245` |
| `moveToFolder` | STUB (picker coming soon) | `SelectionOverlay.tsx:245` |
| `addToFolder` | STUB (picker coming soon) | `SelectionOverlay.tsx:245` |
| Folder/group trash | NOT WIRED | `SelectionOverlay.tsx:72-77` |

### 7.2 AddCardSheet friend sharing — PASS (corrected from AUDIT-03)
- AUDIT-03 reported `TODO P8-future` for friend sharing. **Current code is fully implemented:** `components/sheets/AddCardSheet.tsx:293-307` calls `directShareAction` for each selected friend via `Promise.allSettled`, with failure counting and toast feedback. No TODO marker remains.

### 7.3 Group feed view — PASS
- `app/(app)/layout.tsx:523-535` — fully implemented (see §3.6).

### 7.4 Folder filter chips — NOT IMPLEMENTED
- `app/(app)/feed/_components/FeedGrid.tsx:370-372` — `TODO P9-T01: Folder filter chips do not exist yet.` `toggleFolderFilter` exists in filterStore but has no UI.

### 7.5 DnD targets — PASS (all 10 wired)
- `lib/dnd/DndProvider.tsx:30-138` — card→trash, card→friend, card→folder, card→group, card→tag, card→card (auto-create folder), friend→friend (auto-create group), friend→folder / folder→friend (share), tag→node (detach). All wired to server actions in `app/lib/actions/dnd.ts`.

### 7.6 YouTube integration — PASS (fully implemented)
- `app/(app)/youtube/page.tsx` — connect (OAuth), disconnect, fetch likes, fetch subscriptions, unlike, unsubscribe, intelligent import with auto-tags/channel/category and auto-folder. All wired.

### 7.7 Chrome extension — PASS (fully implemented)
- `extension/src/popup/popup.ts` — auth relay, quick save, advanced save (title/description/note), folder selection, tag selection, new tag creation.
- `app/api/import/route.ts:135-151` — intelligent import via Edge Function; `:172-195` duplicate detection.

### 7.8 Settings / preferences page — MISSING
- No `settings/` or `preferences/` route under `app/(app)/`. Theme toggle and language selector live in the profile modal (`feed-authenticated.spec.ts:98-123` covers visibility only).

---

## 8. Prioritized Action Plan

### P0 — Fix Now (security / architecture violations)
| # | Issue | File:Line | Effort | Impact |
|---|-------|-----------|--------|--------|
| 1 | `applyTagToNodeAction` missing auth + `addTagToNode` uses service client | `app/lib/actions/applyTagToNode.ts:5-16`, `lib/db/tags.ts:153` | 15 min | CRITICAL: any client can tag any node |
| 2 | YouTube API routes use `getSession()` | `lib/youtube/client.ts:30` + 7 routes | 30 min | CRITICAL: auth bypass risk |
| 3 | Edge Function wildcard CORS | `supabase/functions/extract-node-metadata/index.ts:60` | 10 min | CRITICAL: callable from any origin |
| 4 | `addTagToNode` duplicate-check-before-write (non-atomic, rule violation) | `lib/db/tags.ts:155-165` | 20 min | CRITICAL: race + architecture violation |
| 5 | `sharing.ts` + `friends.ts` actions throw uncaught, untyped | `app/lib/actions/sharing.ts:20-44`, `app/lib/actions/friends.ts:14-77` | 30 min | HIGH: unhandled errors reach client |
| 6 | YouTube API routes missing try/catch | `app/api/youtube/likes/route.ts`, `subscriptions/route.ts` (+ `[id]` variants) | 20 min | HIGH: throws become opaque 500s |

### P1 — Fix Soon
| # | Issue | File:Line | Effort | Impact |
|---|-------|-----------|--------|--------|
| 7 | Add CSP header | `next.config.ts:5-18` | 30 min | MEDIUM: XSS defense-in-depth |
| 8 | Add `revalidatePath("/feed")` to sharing/friends/applyTag/addNodeToFolder/cardPositions/notifications actions | various | 20 min | MEDIUM: stale UI after mutations |
| 9 | `permanentlyDeleteFromTrash` missing `revalidatePath("/feed")` | `app/lib/actions/trash.ts:75` | 2 min | MEDIUM |
| 10 | Add `.catch()` to unhandled promises in layout/CardDetailSheet/NotificationPanel | `app/(app)/layout.tsx:136,254,298`, `CardDetailSheet.tsx:231,348,373`, `NotificationPanel.tsx:25` | 20 min | MEDIUM: unhandled rejections |
| 11 | Add `ratings_user_id_idx` index | new migration | 5 min | MEDIUM: query perf |
| 12 | Replace 2 client-side `console.error` with toast in `usePermissions.ts` | `lib/hooks/usePermissions.ts:49,108` | 10 min | LOW: UX |
| 13 | Fix eslint `prefer-const` error in `youtube-intelligent-import.spec.ts:30` | — | 1 min | LOW: clean lint |
| 14 | Delete stray `nul` file + archive obsolete `scripts/` | — | 10 min | LOW: hygiene |

### P2 — Should Do
| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 15 | Add E2E tests: sharing, trash/restore, DnD, card detail, folder CRUD | 4h | HIGH: coverage |
| 16 | Add CI workflow (`.github/workflows/e2e.yml`) | 1h | HIGH: regression safety |
| 17 | Add Vitest + unit tests for server actions and DB layer | 4h | HIGH: coverage |
| 18 | Wire multi-select picker actions (edit/moveToFolder/addToFolder) | 2h | MEDIUM: feature |
| 19 | Wire `removeFromFolder` to server action (currently fake success) | 15 min | MEDIUM: correctness |
| 20 | Implement folder/group trashing via multi-select | 1h | MEDIUM: feature |
| 21 | Implement folder filter chips (TODO P9-T01) | 1h | MEDIUM: feature |
| 22 | Implement search (currently visual stubs in BottomBar/DesktopSidebar) | 2h | MEDIUM: feature |
| 23 | Add settings/preferences page | 2h | MEDIUM: feature |
| 24 | Document or move HorizView direction-grouping into SQL | 30 min | MEDIUM: architecture |
| 25 | Split `CardDetailSheet.tsx` (1367 lines) and `AddCardSheet.tsx` (1002 lines) | 3h | MEDIUM: maintainability |

### P3 — Tech Debt
| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 26 | Regenerate `lib/types/database.ts` and remove `type AnySupabase = any` (6 files) | 1h | LOW: type safety |
| 27 | Rename `getSessionUserId` → `getUserId` for clarity | 10 min | LOW: readability |
| 28 | Document/restrict permissive `folder_admins`/`group_admins` SELECT policy | 15 min | LOW: hardening |
| 29 | Split remaining 500-600 line files (layout, TopBar, BottomBar, ProfileModal, FeedGrid) | 4h | LOW: maintainability |

---

## 9. Corrections vs AUDIT-03

| AUDIT-03 finding | AUDIT-04 status | Reason |
|------------------|-----------------|--------|
| `createNode.ts:99` uses `getSession()` | **Resolved** | Current code uses `getUser()` at `createNode.ts:98-101` |
| Missing security headers | **Resolved** | `next.config.ts:5-18` now has X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy (CSP still missing) |
| No `loading.tsx` files | **Resolved** | `feed/loading.tsx`, `trash/loading.tsx`, `youtube/loading.tsx` all exist |
| YouTube no reconnect button | **Resolved** | `youtube/page.tsx:472-485, 571-584` render "Reconnect YouTube" button on 403 |
| AddCardSheet friend sharing is `TODO P8-future` | **Resolved** | `AddCardSheet.tsx:293-307` now calls `directShareAction` via `Promise.allSettled` |
| Group feed view is a no-op stub | **Resolved** | `layout.tsx:523-535` now navigates to `/feed?group={id}` |
| Multi-select: only `moveToTrash` + `giveAdmin` wired | **Partially resolved** | `shareWith`, `addToGroup`, `removeTag` now wired; `edit`/`moveToFolder`/`addToFolder`/`removeFromFolder` still stubs |

---

## 10. Summary

| Area | Status | Critical | High | Medium | Low |
|------|--------|----------|------|--------|-----|
| Security | Needs P0 fixes | 3 | 1 | 1 | 1 |
| Architecture | Mostly compliant | 1 | 0 | 1 | 0 |
| Code quality | Good | 0 | 0 | 2 | 3 |
| Performance | Good | 0 | 0 | 2 | 1 |
| Error handling | Needs P0/P1 fixes | 0 | 2 | 2 | 0 |
| Test coverage | Weak | 0 | 3 | 0 | 0 |
| Features | Mostly complete | 0 | 0 | 4 | 1 |
| Build/lint/types | Healthy | 0 | 0 | 0 | 1 |

**Top 6 P0 items (do first):**
1. Auth + service-client bypass in `applyTagToNodeAction` / `addTagToNode`
2. `getSession()` → `getUser()` in YouTube routes
3. Edge Function wildcard CORS
4. `addTagToNode` duplicate-check violation (atomicity + rule)
5. Uncaught throws in `sharing.ts` / `friends.ts` actions
6. Missing try/catch in YouTube API routes
