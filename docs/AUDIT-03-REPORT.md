# LIKED — Full Audit Report (Audit 03)

**Date:** 2026-08-26  
**Scope:** Security, code quality, performance, error handling, features, test coverage  
**Test status:** 36/36 E2E tests pass

---

## 1. Security

### 1.1 Secrets — PASS
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`) is only accessed in `lib/supabase/service.ts` (server-only, never client-bundled)
- No `NEXT_PUBLIC_` vars expose secrets
- Edge Function reads `SUPABASE_SERVICE_ROLE_KEY` from Deno env (server-side only)
- `.env.local` is gitignored

### 1.2 Auth Bypass — PASS (1 minor)
- All API routes under `app/api/` verify auth via `getUser()` or `getSupabaseClientFromBearer()`
- `app/api/folders/[id]/route.ts` and `app/api/nodes/[id]/route.ts` verify ownership before delete (403 if not owner)
- Extension routes (`/api/import`, `/api/extension/*`) authenticate via bearer token + verify user.id
- **MINOR:** `app/lib/actions/createNode.ts:99` uses `getSession()` instead of `getUser()` for auth check. Supabase warns this is insecure because session data comes from cookies without server verification. Should use `getUser()`.

### 1.3 RLS — PASS
- All 24+ tables have `ENABLE ROW LEVEL SECURITY`
- 10 instances of `USING (true)` / `WITH CHECK (true)` found, but all are in legitimate contexts:
  - `061_admin_permissions.sql`: RPC functions that run as SECURITY DEFINER (bypass RLS intentionally)
  - `012_restore_admin_tables.sql`: `folder_admins` and `group_admins` SELECT policy for authenticated users (needed for admin lookup)
  - `009_rls_tighten.sql`: `activity_log` insert policy (audit table, writes only)
  - `058_realtime_notifications.sql`: Realtime publication

### 1.4 CORS — PASS
- Extension API routes use `extensionCorsHeaders()` which only reflects `chrome-extension://` origins
- No wildcard `Access-Control-Allow-Origin: *` anywhere
- `Access-Control-Allow-Credentials: false`

### 1.5 SQL Injection — PASS
- All RPC calls use parameterized arguments via Supabase client `.rpc()` method
- No raw SQL string concatenation with user input in app code
- Migrations use static SQL

### 1.6 XSS — PASS
- Zero `dangerouslySetInnerHTML` usage in the entire codebase

### 1.7 Missing Security Headers — MEDIUM
- `next.config.ts` has no `headers()` configuration
- No CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Strict-Transport-Security headers
- **Fix:** Add security headers in `next.config.ts`

---

## 2. Code Quality

### 2.1 console.error/log — LOW (43 instances)
- **Server-side (acceptable):** 24 instances in `app/lib/actions/*` and `lib/db/*` — these are server logs, not user-facing
- **Client-side (should use toast):** 19 instances in components and client hooks:
  - `FeedGrid.tsx` (1), `NodeCard.tsx` (1), `HorizView/ListView/MasonView/ColView` (4) — delete error logging
  - `BottomBarAvatar.tsx` (2), `ProfileModal.tsx` (1) — friend/block/signout errors
  - `AddCardSheet.tsx` (3) — tag/friend/folder load failures
  - `usePermissions.ts` (2) — permission check failures
  - `TagsStrip.tsx` (1) — tag load failure
  - `layout.tsx` (2) — folder/friend refresh failures
  - `error.tsx` (1) — error boundary (acceptable)

### 2.2 TODOs / Coming Soon — MEDIUM (8 instances)
| File | Line | Issue |
|---|---|---|
| `AddCardSheet.tsx` | 291 | `TODO P8-future: apply selectedFriends share ops here` — friend selection UI exists but share never executes |
| `FeedGrid.tsx` | 217 | `Coming soon` — context menu action stub |
| `FeedGrid.tsx` | 369 | `TODO: Folder filter chips do not exist yet` |
| `FeedGrid.tsx` | 381 | `Coming soon — use drag to share` |
| `FeedGrid.tsx` | 385 | `Coming soon — use drag to move` |
| `FeedGrid.tsx` | 389 | `Coming soon — use Tag Mode via FAB` |
| `layout.tsx` | 497 | `Coming soon` — FAB template/tag actions |
| `SelectionOverlay.tsx` | 136 | `coming soon` — 6 of 8 multi-select context actions are stubs |

**Working multi-select actions:** `moveToTrash`, `giveAdmin`  
**Stubbed multi-select actions:** `edit`, `moveToFolder`, `addToFolder`, `addToGroup`, `shareWith`, `removeTag`, `removeFromFolder`

### 2.3 Type Safety — LOW (9 eslint-disable)
- 7 `eslint-disable-next-line @typescript-eslint/no-explicit-any` — all in `lib/db/*` files for RPC return types (acceptable — Supabase RPC typing is limited)
- 1 `eslint-disable-next-line react-hooks/exhaustive-deps` in `useFeedURLSync.ts`
- 1 in extension popup (vanilla JS, acceptable)

### 2.4 Empty Catch Blocks — LOW (6 instances)
- `filterStore.ts` (4) — localStorage access (acceptable, graceful degradation)
- `useLocalStorage.ts` (2) — localStorage access (acceptable)

### 2.5 Group Feed View — MEDIUM
- `app/(app)/layout.tsx:523` — clicking a group in the bottom bar does nothing (`// Groups: future implementation`)

---

## 3. Performance

### 3.1 Database Indexes — PASS
- Key indexes exist: `nodes_owner_deleted_idx`, `nodes_url_owner_active_uniq`, `folders_owner_idx`, `folders_parent_idx`, `card_positions` composite indexes, `node_notes` trigram index
- Migration 075 added folder indexes recently

### 3.2 N+1 Queries — LOW
- `lib/db/folders.ts:90,108` — two separate queries for folder edge counts and thumbnails (could be joined, but non-fatal)
- Feed uses single `get_feed` RPC (no N+1)

### 3.3 No loading.tsx — MEDIUM
- Zero `loading.tsx` files in the app directory
- Users see blank page during server component fetches
- **Fix:** Add `app/(app)/feed/loading.tsx`, `app/(app)/trash/loading.tsx`, `app/(app)/youtube/loading.tsx`

---

## 4. Error Handling

### 4.1 Server Actions — PASS
- All server actions return typed results (`{ ok: true }` or `{ ok: false, error: string }`)
- Errors are caught and returned to client, not thrown
- `revalidatePath` called after successful mutations

### 4.2 API Routes — PASS
- All API routes have try/catch with proper HTTP status codes
- 401 for unauth, 403 for forbidden, 404 for not found, 500 for server errors

### 4.3 YouTube Token Expiry — MEDIUM
- Error messages say "try reconnecting your YouTube account" but there's no reconnect button in the connected state
- User has to disconnect and reconnect manually
- **Fix:** Add a "Reconnect" button when API returns 403

### 4.4 ECONNRESET in Dev Server — LOW
- Observed during E2E tests — Edge Function calls timing out on test URLs
- Not a production issue, but indicates Edge Function timeout handling could be improved

---

## 5. Test Coverage

### 5.1 Current Coverage — 36 E2E tests
| Area | Tests | Status |
|---|---|---|
| Login flow | 5 | PASS |
| Signup flow | 3 | PASS |
| Navigation (unauth) | 4 | PASS |
| Navigation (auth) | 1 | PASS |
| Feed (auth) | 7 | PASS |
| API (unauth) | 5 | PASS |
| Extension | 6 | PASS |
| Auth smoke | 3 | PASS |
| Node creation | 1 | PASS |
| Setup | 1 | PASS |

### 5.2 Missing Test Coverage
| Area | Risk | Recommendation |
|---|---|---|
| Sharing (direct/group/folder) | HIGH | Needs 2-user test setup |
| Trash/restore flow | MEDIUM | Trash page renders but no restore test |
| DnD operations | MEDIUM | 7 DnD paths untested via UI |
| Card detail sheet | MEDIUM | Opens but no rating/note test |
| Folder CRUD | MEDIUM | Create/delete untested via UI |
| Tag operations | LOW | Apply/remove tags untested |
| YouTube integration | LOW | Page renders but no connect/test flow |
| Extension import | MEDIUM | API tested but not full extension flow |
| Multi-select actions | LOW | Only trash + giveAdmin tested |
| Unit tests | HIGH | Zero unit tests for server actions, DB layer, or utils |

---

## 6. Prioritized Action Plan

### P0 — Should Fix Now
| # | Issue | Effort | Impact |
|---|---|---|---|
| 1 | `createNode.ts`: replace `getSession()` with `getUser()` | 5 min | Security: auth bypass risk |
| 2 | Add security headers in `next.config.ts` | 10 min | Security: XSS/clickjacking protection |
| 3 | Add `loading.tsx` for feed/trash/youtube | 15 min | UX: no more blank pages |

### P1 — Should Fix Soon
| # | Issue | Effort | Impact |
|---|---|---|---|
| 4 | Wire AddCardSheet friend sharing (TODO P8-future) | 30 min | Feature: sharing from create flow |
| 5 | Add YouTube reconnect button | 15 min | UX: token expiry recovery |
| 6 | Replace client-side console.error with toast | 30 min | UX: user-visible error feedback |
| 7 | Add E2E test for trash/restore flow | 20 min | Test coverage |
| 8 | Add E2E test for sharing flow | 30 min | Test coverage (needs 2 users) |

### P2 — Nice to Have
| # | Issue | Effort | Impact |
|---|---|---|---|
| 9 | Wire multi-select context menu stubs (share/move/tag) | 2h | Feature: batch operations |
| 10 | Implement group feed view | 1h | Feature: group navigation |
| 11 | Add E2E tests for DnD operations | 1h | Test coverage |
| 12 | Add unit tests for server actions | 2h | Test coverage |
| 13 | Folder filter chips (TODO in FeedGrid) | 1h | Feature: feed filtering |

### P3 — Tech Debt
| # | Issue | Effort | Impact |
|---|---|---|---|
| 14 | Type RPC return types properly (remove `as any`) | 1h | Type safety |
| 15 | Consolidate folder edge count + thumbnail queries | 30 min | Performance |
| 16 | Add CSP header (needs careful allowlist) | 1h | Security hardening |
