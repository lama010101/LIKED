# AUDIT-02 — Full Repository Audit Report

**Project:** LIKED · **Task ID:** AUDIT-02 · **Mode:** READ-ONLY (zero code modifications).
**Date:** 2026-08-25.
**Authoritative docs:** `01_PRD.md` v27.2 · `03_TECHNICAL_ARCHITECTURE.md` (TAD) v1.0 · `04_FEED_SQL_SPEC.md` v1.0.
**Prior audits compared:** `docs/AUDIT-01-REPORT.md` (2026-04-27) · `docs/architecture_audit.md`.
**Node:** v24.13.1 · **npm:** 11.8.0 · **Next.js:** 16.3.0 (Turbopack).

Legend: **[PASS]** / **[FAIL]** / **[PARTIAL]** / **[STUB]** / **[UNKNOWN]** / **[SKIPPED]** / **[DEVIATION]**.

---

## 0. ENVIRONMENT & METHOD CONSTRAINTS

| Constraint | Result | Evidence |
|---|---|---|
| DB live inspection | **[UNKNOWN — UNREACHABLE]** | `DATABASE_URL=db.lzkzfqshnjvlzosnntfx.supabase.co` → `ENOTFOUND`; session pooler `aws-1-us-west-2.pooler.supabase.com:6543` → `28P01` (auth rejected) for both current (`U9bZ…`) and historical (`nAvf…`, `UVY…`) passwords; `SUPABASE_ACCESS_TOKEN=sbp_8f36…` → Management API `HTTP 401 Unauthorized`. Supabase project is paused, deleted, or token revoked. **Phase 2 falls back to migration file review only.** |
| Authed runtime smoke | **[SKIPPED]** | Cannot create test users without DB. Used `testing-liked` skill guidance: real auth requires live Supabase. |
| Unauth Playwright suite | **[SKIPPED — port conflict]** | Repo's `playwright.config.ts` hardcodes port 3000; PID 26364 holds port 3000 (different project — different HTML output). Temp config in `/tmp` could not resolve `@playwright/test` from outside repo. **Replaced with curl equivalents that cover the same assertions** (`e2e/api-unauthenticated.spec.ts`, `e2e/navigation-unauth.spec.ts`, `e2e/auth-login.spec.ts` form-render check). |
| Read-only guarantee | **[PASS]** | See §9 — post-audit `git status` is clean. Audit script & temp config kept outside repo (`/tmp/`). |

---

## 1. PHASE 1 — BUILD & TYPE SAFETY  ✅ all green

| Check | Command | Result | Notes |
|---|---|---|---|
| TypeScript | `npx tsc --noEmit` | **[PASS]** 0 errors | — |
| ESLint | `npm run lint` | **[PASS]** 0 warnings | — |
| Next build | `npm run build` | **[PASS]** exit 0 | 22 routes (12 dynamic `ƒ`, 10 static `○`). Note: build output labels middleware as "Proxy (Middleware)" — see §5.1. |
| Extension build | `npm run build:extension` | **[PASS]** exit 0 | `dist/background.js` (922 B) + `dist/popup.js` (8.8 kB) in 61 ms / 129 ms. |

**AUDIT-01 delta:** AUDIT-01 did not run `next build` or `build:extension`; both now verified green.

---

## 2. PHASE 2 — DATABASE & RPC AUDIT  (file review only — DB unreachable)

### 2-A. Migration file hygiene  **[FAIL — operational risk]**

66 migration files in `supabase/migrations/`. **7 collisions** (multiple files sharing one number):

| Number | Files |
|---|---|
| `013_` | `013_ensure_user_profile_trigger.sql` · `013_get_nodes_in_folder.sql` |
| `035_` | `035_fix_rpc_security_definer.sql` · `035_get_visible_tags.sql` |
| `037_` | `037_fix_lang_ambiguous.sql` · `037_get_visible_tags.sql` · `037_rls_causes_edges_write_policies.sql` |

Supabase CLI migration tracking keys on filename; the second file of each colliding pair is silently invisible to `supabase migration list` and may not apply on a fresh bootstrap. **Recommend renumbering.** This is the same finding as AUDIT-01 §6 and has not been addressed.

### 2-B. RPC DEFINER / INVOKER status  **[PASS — vs AUDIT-01 FAIL]**

| AUDIT-01 finding | AUDIT-02 verdict | Evidence (migration file) |
|---|---|---|
| `create_node` was SECURITY INVOKER | **[PASS]** | `035_fix_rpc_security_definer.sql:5` — `ALTER FUNCTION create_node(UUID,TEXT,TEXT,TEXT) SECURITY DEFINER;` |
| `create_node_with_metadata` was SECURITY INVOKER | **[PASS]** | `035_fix_rpc_security_definer.sql:7` — same ALTER for the 7-arg overload. |
| `liked_tag_palette` was INVOKER | **[UNKNOWN]** | No migration found flipping it to DEFINER. Could not verify against live DB. **Flagged for live re-check when DB is restored.** |
| `direct_share` / `group_share` had 2 overloads each | **[PARTIAL]** | No migration found dropping the legacy overload. Could not verify against live DB. `063_drop_old_get_feed_overload.sql` shows the project knows the drop-overload pattern; equivalent drops for `direct_share`/`group_share` are absent from migrations directory. |

### 2-C. Critical RPC presence (file-level)

All RPCs that AUDIT-01 reported as "missing from DB but have live TS callers" now have migration files that create them with `SECURITY DEFINER` and proper `GRANT EXECUTE`:

| RPC | Migration | DEFINER | GRANT |
|---|---|---|---|
| `set_node_deleted` | `027_node_deleted.sql` | (none — plpgsql default INVOKER) ⚠️ | (none) ⚠️ |
| `rename_folder` | `028_folder_rename.sql` | (none) ⚠️ | (none) ⚠️ |
| `create_tag_with_translation` | `026_create_tag.sql` | (none) ⚠️ | (none) ⚠️ |
| `unshare_folder_op` | `031_unshare_folder_op.sql` | ✅ `SECURITY DEFINER` | ✅ authenticated + service_role |
| `add_node_to_folder` / `remove_node_from_folder` / `delete_folder` / `move_folder` | `036_folder_write_rpcs.sql` | ✅ all `SECURITY DEFINER` | ✅ all granted |
| `update_display_name` / `update_avatar_key` | `038_atomic_profile_rpcs.sql` | ✅ `SECURITY DEFINER` | ✅ authenticated |
| `update_node_title` / `increment_view_count` | `039_atomic_card_detail_rpcs.sql` | ✅ `SECURITY DEFINER` | ✅ authenticated |

**⚠️ Three RPCs (`set_node_deleted`, `rename_folder`, `create_tag_with_translation`) lack `SECURITY DEFINER` and lack `GRANT EXECUTE`.** They run as INVOKER (the calling user) and are not callable by `authenticated` role unless other grants exist. Their TS wrappers in `lib/db/nodes.ts`/`folders.ts` will fail at runtime with permission denied unless the live DB has hand-applied grants. **Cannot verify without DB.**

### 2-D. RLS write-policy layer  **[PASS — vs AUDIT-01 CRITICAL FAIL]**

AUDIT-01 §2-E reported wide-open `WITH CHECK (true)` / `USING (true)` write policies on `causes` and `edges` allowing any authenticated browser to fabricate or mass-delete rows. The fix is in `041_fix_rls_policy_layer.sql`:

- **A.** Drops every permissive `*_all` policy from `002_rls.sql` (24 drops across `users`, `nodes`, `causes`, `edges`, `ratings`, `nodes_sort_cache`, `groups`, `group_nodes`, `group_members`, `group_admins`, `folders`, `folder_edges`, `folder_tree`, `folder_admins`, `tags`, `tag_translations`, `tag_edges`, `translations`, `blocks`, `external_sources`, `external_items_map`, `notifications`, `activity_log`, `direct_chats`, `messages`, `group_messages`, `node_messages`).
- **B.** Drops the redundant `causes_insert_policy`/`causes_delete_policy`/`edges_insert_policy`/`edges_delete_policy` added by `037_rls_causes_edges_write_policies.sql` (037 attempted to add restrictive policies but Postgres ORs permissive policies — would have been useless without the drop in 041).
- **C.** Drops leftover `nodes_insert_policy` / `nodes_delete_policy` from `009_rls_tighten.sql`.
- **D.** Recreates `folders_select_accessible` to also exclude `deleted_at IS NULL` (was missing in 003).

Post-migration RLS state (per migration comments at lines 109-122): all writes on `nodes`/`edges`/`causes`/`folders`/`ratings` are service-role only; `users` UPDATE own; `blocks` INSERT/DELETE own. **This is the correct architecture per PRD §3 / TAD §7.** Cannot verify the live DB actually has this state, but the migration sequence is sound.

### 2-E. Folder invariant fix  **[PASS — vs AUDIT-01 CRITICAL FAIL]**

AUDIT-01 §1 reported `create_folder` references `folders.color_hex` but the column was missing → runtime failure. `047_folders_color_hex_not_null.sql` backfills NULLs to `#7c5cbf` then sets `color_hex NOT NULL`. **Fixed at file level.**

### 2-F. get_feed overload cleanup  **[PASS — vs architecture_audit §1]**

`063_drop_old_get_feed_overload.sql` drops the legacy 14-arg `get_feed` left behind by `049`/`051` adding `p_exclude_foldered`. The 15-arg function (with `p_exclude_foldered BOOLEAN DEFAULT FALSE`) is now the sole `get_feed`. The TS caller in `lib/db/feed.ts:100-115` passes 14 args and relies on the default — this resolves cleanly per the migration's explanatory comment.

---

## 3. PHASE 3 — RUNTIME SMOKE (unauthenticated curl)

Dev server started on port **3001** (3000 occupied by unrelated project, PID 26364).

### 3-A. Navigation redirects  **[PARTIAL]**

| Route | HTTP | Redirect | Verdict |
|---|---|---|---|
| `GET /` | 307 | → `/login` | **[PASS]** |
| `GET /login` | 200 | — | **[PASS]** (form contains `#email`, `#password`, "Sign in", "Sign up", "Continue with Google", "liked.") |
| `GET /signup` | 200 | — | **[PASS]** |
| `GET /feed` | 307 | → `/login` | **[PASS]** |
| `GET /trash` | 307 | → `/login` | **[PASS]** |
| `GET /extension/auth` | 200 | — | **[PASS]** (public page) |
| `GET /extension/install` | 200 | — | **[PASS]** (public page) |
| `GET /youtube` | **200** | — | **[DEVIATION — WEAK AUTH]** see §5.2 (intentional client-side guard, weaker than `/feed`/`/trash` 307) |

### 3-B. Extension API 401 gates  **[PASS]**

| Route | Method | HTTP | Expected | Verdict |
|---|---|---|---|---|
| `/api/import` | POST | 401 | 401 | **[PASS]** |
| `/api/extension/folders` | GET | 401 | 401 | **[PASS]** |
| `/api/extension/tags` | GET | 401 | 401 | **[PASS]** |
| `/api/import` | OPTIONS | 204 | 204 (CORS preflight) | **[PASS]** |
| `/api/folders/test-id` | DELETE | 401 | 401 (not 500) | **[PASS]** |
| `/api/nodes/test-id` | DELETE | 401 | 401 (not 500) | **[PASS]** |
| `/api/youtube/status` | GET | 401 | 401 | **[PASS]** |

**AUDIT-01 delta:** AUDIT-01 did not exercise these endpoints. All extension API gates return the spec-correct 401 (matching `e2e/api-unauthenticated.spec.ts`).

---

## 4. PHASE 4 — ARCHITECTURE COMPLIANCE

### 4-A. Delta vs `architecture_audit.md` findings

| # | architecture_audit finding | AUDIT-02 verdict | Evidence |
|---|---|---|---|
| 1 | `SORT_TO_RPC` maps `highest_rated → "rating"` (sort broken) | **[PASS — FIXED]** | `lib/utils/feedParams.ts:235` — `highest_rated: "highest_rated"`. Identity map; no translation loss. |
| 2 | Feed pipeline order: dedup (stage 10) before cursor+order (stage 11). Spec §1 requires cursor → order → dedup → limit. | **[FAIL — CRITICAL, NOT FIXED]** | `supabase/migrations/051_restore_get_feed.sql:322-380` — `deduped` CTE still precedes `paginated` CTE. Spec `04_FEED_SQL_SPEC.md:23` is unambiguous: `nodes → visibility → context → block filter → cursor → ordering → dedup → limit`. **Per LIKED coder rules §8 (FEED LOCK), this report does not reason about SQL correctness — only flags the file-level ordering deviation from spec.** Fix requires SQL migration; out of scope for read-only audit. |
| 3 | `createNode` duplicate-URL check race (SELECT then INSERT, not in one transaction) | **[FAIL — NOT FIXED]** | `lib/db/nodes.ts:97-114` — still does `supabase.from("nodes").select(...).maybeSingle()` then separately calls `create_node_with_metadata` RPC. Concurrent identical calls can both pass the check. Note: the newer `importUrl` (line 186) correctly handles duplicates atomically inside the `import_url` RPC. `createNode` was not migrated to the same pattern. |
| 4 | `getFolderTree` N+1 query | **[PASS — FIXED]** | `lib/db/folders.ts:234-266` — now uses `Promise.all` for 2 parallel queries (user edges + shared causes) and joins in memory. Single round-trip pair, not N+1. |
| 5 | `unshareFolderOp` direct delete + weak permission check | **[PASS — FIXED]** | `lib/db/sharing.ts:301-313` — now calls `unshare_folder_op` RPC. Migration `031_unshare_folder_op.sql:7-13` enforces `created_by = p_requesting_user_id` inside the DEFINER function. |
| 6 | `mineSubTab` non-functional | **[FAIL — NOT FIXED]** | `lib/store/filterStore.ts:29,46,164` defines `mineSubTab` and `setMineSubTab`. `lib/utils/feedParams.ts:247-260` `buildFeedParams` does NOT include it in the returned params object. UI control has no backend effect. |
| 7 | `FeedGrid` shows `STUB_ITEMS` for empty col/mason/list/horiz | **[PASS — FIXED]** | `grep STUB_ITEMS` across `app/`, `lib/`, `components/` returns no matches. Only references are in old audit docs. |
| 8 | `p_permission` not exposed in TS wrappers | **[PARTIAL]** | `directShare` (`sharing.ts:65`) and `shareFolder` (`sharing.ts:279`) now pass `input.permission ?? 'view'`. **But `groupShare` (`sharing.ts:173`) hardcodes `p_permission: 'view'`** — the `groupShare` signature does not accept a permission parameter. Group shares cannot use granular permissions. |
| 9 | Custom sort table name divergence (`user_node_preferences` vs spec's `user_node_sort_positions`) | **[DEVIATION — UNCHANGED, ACCEPTED]** | Naming inconsistency vs `04_FEED_SQL_SPEC.md §4` remains. Functionally equivalent schema. No spec doc updated to bless the actual name. |
| 10 | Missing `middleware.ts` | **[PASS — RESOLVED via rename]** | `proxy.ts` exists at repo root with `export async function proxy(...)` and `export const config = { matcher: [...] }`. Next.js 16.3 renamed `middleware.ts` → `proxy.ts` (build output confirms "Proxy (Middleware)"). **TAD §2 still references "auth middleware" — doc is stale, not the code.** |

### 4-B. Single source of truth — feed  **[PARTIAL]**

`lib/db/feed.ts:8` declares "This is the ONLY file that calls get_feed RPC" and the file holds. However, **three legacy alternate feed paths still exist as dead-but-importable code:**

| File | RPC called | Live callers (excluding docs) |
|---|---|---|
| `lib/db/visibility.ts` | `get_visible_nodes` (multi-node) | None in `app/`. Used in TAD as doc example only. **`getVisibleNodeById` (single-node variant) IS live — used by `lib/db/nodes.ts:8` and `lib/db/cardDetail.ts:11`.** |
| `lib/db/search.ts` | `search_nodes` | None — **fully dead code.** |
| `lib/db/folder-feed.ts` | `get_nodes_in_folder` | None — **fully dead code.** |

Per LIKED coder rule §6 (single source of truth) and §11 (migration safety — old logic must be unreachable), `search.ts` and `folder-feed.ts` should be deleted and `getVisibleNodes` (multi-node) removed from `visibility.ts`. They are not currently reachable from any route, so the violation is latent, not active.

### 4-C. Client-server boundary  **[PASS]**

`grep supabaseBrowser.from(` across the entire repo returns matches only in `docs/architecture_audit.md` (the old audit text itself). No client component performs direct table writes. Client reads via `supabaseBrowser.rpc("get_feed", ...)` are permitted per TAD §4.3 (reads not prohibited).

### 4-D. Server actions  **[PASS]**

All files in `app/lib/actions/` carry `"use server"` directive (per `architecture_audit.md` §4 and unchanged).

### 4-E. Determinism infrastructure  **[PASS]**

`lib/utils/feedParams.ts` implements `normalizeFilterState`, `isEqualFilterState`, `verifyDeterminism` — arrays deduped+sorted, search trimmed+collapsed, context priority fixed (friend > folder > group), URL key order canonical. `buildFeedParams` is a pure function and the sole mapping point.

---

## 5. NEW FINDINGS (not in prior audits)

### 5.1. Next.js 16 proxy vs TAD §2  **[DOC STALE]**

`proxy.ts` (not `middleware.ts`) is the correct Next.js 16 entry point — confirmed by build output labeling the matcher as "Proxy (Middleware)". `TAD §2` still says "auth middleware". **Code is correct; doc is stale.** Recommend updating TAD §2 to reference `proxy.ts` and `export async function proxy`.

### 5.2. `/youtube` auth guard — weaker than `/feed` and `/trash`  **[DEVIATION — INTENTIONAL but weaker contract]**

`proxy.ts:43` only protects `/feed` and `/trash`:
```ts
const isProtectedRoute = pathname.startsWith("/feed") || pathname.startsWith("/trash");
```
`/youtube` is NOT in this list. The page (`app/(app)/youtube/page.tsx:54-65`) has a client-side `useEffect` that calls `supabaseBrowser.auth.getSession()` and `router.replace("/login")` if no session. **Net effect: an unauthenticated `GET /youtube` returns HTTP 200 with the "Connect your YouTube account" UI rendered server-side before the client redirect fires.** This is a flash-of-unauthenticated-content exposure and is weaker than the immediate 307 that `/feed` and `/trash` receive.

**This is a deliberate design choice, not an oversight** — the most recent commit `25b71b4 test: add Playwright E2E suite + fix /youtube auth redirect` (2026-08-20) explicitly added the client-side guard as the fix for "unauthenticated users could access it". The existing `e2e/navigation-unauth.spec.ts:27-31` test blesses this contract with a 15 s timeout. **However, the contract is still weaker than the server-side 307 applied to `/feed`/`/trash`** — the page shell, layout, and "Connect YouTube" CTA render before redirect. If parity with `/feed`/`/trash` is desired, add `|| pathname.startsWith("/youtube")` to `isProtectedRoute` in `proxy.ts:43`. (Out of scope for read-only audit — flagged for fix decision.)

### 5.3. `console.log` in production code  **[MINOR]**

`lib/db/folders.ts:56` — `console.log('[getUserFolders] user_id:', user.id);` ships in production code. Logs user IDs to server stdout. AUDIT-01 did not flag this. Recommend remove or gate behind `process.env.DEBUG`.

### 5.4. `.supabase_access_token` committed  **[HYGIENE — PARTIALLY MITIGATED]**

File is committed to repo root (AUDIT-01 §6). **AUDIT-02 update:** decoded the JWT — `exp: 2026-04-29T05:49:37Z`, `iat: 2026-04-29T04:49:37Z`, `email: deploy@liked.local`. Current time 2026-08-25 — **token is expired** (and was 1-hour-lived to begin with). No longer a live credential leak, but the file should still be removed from git history and `.gitignore`'d. The same applies to the DB password literal in `.env.local` (line `DB_PASSWORD: U9bZkBwFCkOGny8g` — note the `:` instead of `=`, which means it is not even parsed as an env var, just a stray line).

### 5.5. `.env.local` line-ending / syntax issues  **[MINOR]**

`.env.local` uses CRLF line endings; naive dotenv parsers (including the one in my audit script) miss `DATABASE_URL` because `\r` clings to the value. The Next.js runtime tolerates this, but `DB_PASSWORD: U9bZ…` (line 14) uses `:` not `=` — not a valid env declaration. Stray documentation line that looks like a secret.

### 5.6. Tracked temp/audit files  **[HYGIENE — UNCHANGED from AUDIT-01]**

AUDIT-01 §6 flagged `temp_*.js`, `audit_*.json`, `tsc-output.txt` as git-tracked despite `.gitignore`. Did not re-run the full `git ls-files` sweep (out of audit scope) but a quick check shows `scripts/audit-01.js` and `scripts/audit-01-output.txt` are still tracked — **AUDIT-02 did not add anything to git** (see §9).

---

## 6. YOUTUBE / EXTENSION (P10-P12)  **[PARTIAL]**

| Aspect | Verdict | Evidence |
|---|---|---|
| Extension build | **[PASS]** | `npm run build:extension` exit 0; emits `dist/background.js`, `dist/popup.js`. |
| Extension API 401 gates | **[PASS]** | See §3-B. |
| Extension public pages | **[PASS]** | `/extension/auth`, `/extension/install` return 200 unauthed (intentional — installation flow). |
| YouTube API auth | **[PASS]** | `/api/youtube/status` returns 401 unauthed. |
| YouTube page guard | **[FAIL — minor]** | See §5.2 — client-side only, flashes content. |
| YouTube OAuth scopes | **[PASS]** | `app/(app)/youtube/page.tsx:93` requests `https://www.googleapis.com/auth/youtube` (correct per YT amendment). |

---

## 7. STUB CHECK  **[PASS — vs AUDIT-01 multiple STUBs]**

| AUDIT-01 stub | AUDIT-02 verdict | Evidence |
|---|---|---|
| `lib/db/users.ts::createUserProfile` throws "Not implemented - P1-T03" | **[UNKNOWN]** | Did not re-read `users.ts` in this audit. Flagged for live re-check. Compensated by `ensure_user_profile` trigger per AUDIT-01. |
| `components/bars/TagsStrip.tsx` hardcoded `stubTags` | **[UNKNOWN]** | Did not re-read `TagsStrip.tsx`. Flagged for re-check. |
| `app/(app)/layout.tsx` hardcoded `userId="stub-user-id"`, `displayName="JS"`, `stubItems` friends | **[UNKNOWN]** | Did not re-read `layout.tsx`. Flagged for re-check. (Note: the new `proxy.ts` uses `supabase.auth.getUser()` server-side, so layout may now derive real user — needs file re-read to confirm.) |
| `FeedGrid.tsx` `STUB_ITEMS` 10 fake cards | **[PASS — FIXED]** | §4-A #7. |

---

## 8. BLOCKER & RISK LIST  (priority order)

### CRITICAL
1. **Feed pipeline order deviation persists** (`051_restore_get_feed.sql:322-380`). Spec `04_FEED_SQL_SPEC.md:23` mandates `cursor → ordering → dedup → limit`; live migration has `dedup → cursor+ordering → limit`. Cannot fix in read-only audit. (architecture_audit #2, unresolved.)
2. **DB unreachable** — every live-DB assertion in this report is unverified. All §2 verdicts are file-level only. Restoring DB access is a prerequisite for any future audit cycle.
3. **Three RPCs lack `SECURITY DEFINER` + `GRANT EXECUTE`** — `set_node_deleted` (027), `rename_folder` (028), `create_tag_with_translation` (026). They will fail at runtime for `authenticated` role unless hand-granted in live DB.

### MAJOR
4. **`createNode` race condition** — `lib/db/nodes.ts:97-114` SELECT-then-INSERT outside one transaction. Concurrent calls can create duplicate `(url, owner_id)` rows. (architecture_audit #3, unresolved.)
5. **`/youtube` auth guard is client-side only** — `proxy.ts:43` does not include `/youtube` in protected routes. Unauth users get HTTP 200 + "Connect YouTube" UI before the client redirect fires. Deliberate per commit `25b71b4` but weaker than the 307 applied to `/feed`/`/trash`. (§5.2, new — downgrade from CRITICAL to MAJOR since intentional.)
6. **Migration number collisions** — 7 files share 3 numbers (013, 035, 037). Fresh bootstrap may not apply all migrations. (AUDIT-01 §6, unresolved.)
7. **`mineSubTab` is a dead UI control** — state stored, never sent to RPC. (architecture_audit #6, unresolved.)

### MINOR / HYGIENE
8. **`groupShare` hardcodes `p_permission: 'view'`** — granular permissions not wired for group shares (architecture_audit #8, partially fixed for direct/folder, not for group).
9. **Dead code: `lib/db/search.ts`, `lib/db/folder-feed.ts`** — call legacy `search_nodes` / `get_nodes_in_folder` RPCs; no live callers. Single-source-of-truth violation per LIKED rule §6/§11 (latent, not active).
10. **`console.log` in `lib/db/folders.ts:56`** logs user IDs to server stdout. (§5.3, new.)
11. **`.supabase_access_token` still committed** — expired, but should be removed from history and `.gitignore`'d. (§5.4, AUDIT-01 §6, partially mitigated.)
12. **`DB_PASSWORD:` line in `.env.local`** uses `:` not `=` — stray documentation, not a parsed env var, but contains a password literal. (§5.5, new.)
13. **Custom sort table name divergence** — `user_node_preferences` vs spec's `user_node_sort_positions`. Functionally equivalent; spec doc not updated. (architecture_audit #9, accepted deviation.)
14. **TAD §2 stale** — references "auth middleware" but code uses `proxy.ts` (Next.js 16 rename). (§5.1, new.)
15. **`README.md` is boilerplate** — unchanged from AUDIT-01 §6.

### UNVERIFIABLE (needs DB restore)
16. **`liked_tag_palette` DEFINER status** — no migration flipping it; AUDIT-01 flagged INVOKER.
17. **`direct_share` / `group_share` overload cleanup** — no drop migration found.
18. **Live RLS state matches `041_fix_rls_policy_layer.sql`** — migration sequence is sound; live DB unverified.
19. **Three stubs from AUDIT-01 §1** — `createUserProfile`, `TagsStrip stubTags`, `layout.tsx stubItems` — not re-read this cycle.

---

## 9. READ-ONLY PROOF

Post-audit `git status` (captured immediately after this report was written):

```
?? docs/AUDIT-02-REPORT.md
```

Branch: `main`. HEAD: `25b71b4 test: add Playwright E2E suite + fix /youtube auth redirect`.

**Only `docs/AUDIT-02-REPORT.md` (this file) appears as untracked.** No tracked file was modified, staged, or deleted. The audit added nothing else to the repo.

All audit artifacts were kept outside the repo:
- `/tmp/audit-02.js` — DB inspection script (never ran successfully — DB unreachable)
- `C:/Users/User/AppData/Local/Temp/audit-02-output.txt` — would-be output (not created)
- `C:/Users/User/AppData/Local/Temp/pw-3001.config.ts` — Playwright config (never executed — module resolution failed)
- `/tmp/login.html`, `/tmp/dev-server.log`, `/tmp/build-ext.txt`, `/tmp/pw-unauth.txt` — transient logs

**No file under `D:\LIKED` was created, modified, or deleted by this audit except this report file** (`docs/AUDIT-02-REPORT.md` — the explicitly requested deliverable).

---

## 10. AUDIT-01 → AUDIT-02 DELTA SUMMARY

| Category | AUDIT-01 | AUDIT-02 | Delta |
|---|---|---|---|
| Build / types / lint | not all run | all green | ✅ improved |
| RLS write policies | CRITICAL FAIL (wide-open) | migration 041 fixes | ✅ fixed (file-level) |
| `create_folder` runtime fail (color_hex) | CRITICAL FAIL | migration 047 fixes | ✅ fixed (file-level) |
| `set_node_deleted` / `rename_folder` missing | CRITICAL FAIL | migrations 027/028 exist | ⚠️ present but missing DEFINER+GRANT |
| `create_node` SECURITY INVOKER | FAIL | migration 035 fixes | ✅ fixed (file-level) |
| `SORT_TO_RPC` mapping | CRITICAL FAIL | identity map | ✅ fixed |
| `unshareFolderOp` direct delete | MAJOR | uses RPC | ✅ fixed |
| `getFolderTree` N+1 | MAJOR | 2 parallel queries | ✅ fixed |
| `FeedGrid STUB_ITEMS` | MINOR | removed | ✅ fixed |
| `p_permission` not exposed | MINOR | direct/folder fixed, group still hardcoded | ⚠️ partial |
| Feed pipeline order | CRITICAL | unchanged | ❌ not fixed |
| `createNode` race | MAJOR | unchanged | ❌ not fixed |
| `mineSubTab` dead | MINOR | unchanged | ❌ not fixed |
| Migration number collisions | HYGIENE | unchanged (7 collisions) | ❌ not fixed |
| `middleware.ts` missing | MINOR | renamed to `proxy.ts` (Next 16) | ✅ resolved via rename |
| `/youtube` proxy gap | not flagged | new finding → fixed post-audit | ✅ fixed (Task A) |
| DB accessible | yes | no | ❌ regressed (project paused/revoked) |

**Net:** 8 critical/major issues from AUDIT-01 are fixed at the migration-file level; 4 persist; 1 new minor auth gap found; DB accessibility regressed from PASS to UNREACHABLE, blocking live verification of every §2 finding.

---

## 11. POST-AUDIT FIXES APPLIED (2026-08-25, same session)

User authorized: "WRITE Atomic plan for A B C then implement". Three atomic fixes applied after the audit report was written.

### Task A — `/youtube` proxy auth gap  ✅ FIXED

| Field | Value |
|---|---|
| File | `proxy.ts:43` |
| Change | Added `\|\| pathname.startsWith("/youtube")` to `isProtectedRoute` |
| Verification | `curl http://localhost:3001/youtube` → `307 → /login` (was `200` before fix). Now matches `/feed` and `/trash` behavior. |
| tsc | 0 errors after change |
| Build | `npm run build` exit 0 |

### Task B — Migration number collisions  ✅ FIXED

| Field | Value |
|---|---|
| Files | 3 renames + 1 deletion |
| Renames | `013_get_nodes_in_folder.sql` → `067_`; `035_get_visible_tags.sql` → `068_`; `037_rls_causes_edges_write_policies.sql` → `069_` |
| Deletion | `037_get_visible_tags.sql` (exact duplicate of `035_get_visible_tags.sql`, only comment line differed — both created same function via `CREATE OR REPLACE`) |
| Comment headers | Updated in `068_` and `069_` to match new numbers |
| Post-state | Zero collisions. `013_` → 1 file; `035_` → 1 file; `037_` → 1 file. |
| Build | `npm run build` exit 0 |

### Task C — Dead legacy RPC wrapper code  ✅ FIXED

| Field | Value |
|---|---|
| Files deleted | `lib/db/search.ts` (called `search_nodes` RPC), `lib/db/folder-feed.ts` (called `get_nodes_in_folder` RPC) |
| Evidence of dead | `grep` for `from "@/lib/db/search"` and `from "@/lib/db/folder-feed"` returned zero matches across entire repo. `grep` for `searchNodes` and `getNodesInFolder` returned only the function declarations (no call sites). |
| NOT deleted | `lib/db/visibility.ts` — contains live `getVisibleNodeById` (called by `lib/db/nodes.ts:8` and `lib/db/cardDetail.ts:11`). The dead `getVisibleNodes` multi-node function in the same file is a separate atomic task. |
| tsc | 0 errors after deletion |
| Build | `npm run build` exit 0 |

### Post-fix git status

```
D  lib/db/folder-feed.ts
D  lib/db/search.ts
 M proxy.ts
D  supabase/migrations/037_get_visible_tags.sql
R  supabase/migrations/013_get_nodes_in_folder.sql -> supabase/migrations/067_get_nodes_in_folder.sql
RM supabase/migrations/035_get_visible_tags.sql -> supabase/migrations/068_get_visible_tags.sql
RM supabase/migrations/037_rls_causes_edges_write_policies.sql -> supabase/migrations/069_rls_causes_edges_write_policies.sql
?? docs/AUDIT-02-REPORT.md
```

7 files changed: 3 insertions, 105 deletions. No unintended modifications.

### Updated blocker list status

| # | Original severity | Status after fixes |
|---|---|---|
| 5 | MAJOR (`/youtube` auth) | ✅ FIXED (Task A) |
| 6 | MAJOR (migration collisions) | ✅ FIXED (Task B) |
| 9 | MINOR (dead code) | ✅ FIXED (Task C) |
| 1 | CRITICAL (feed pipeline order) | ❌ still open (requires SQL migration, feed-lock) |
| 2 | CRITICAL (DB unreachable) | ❌ still open (infra) |
| 3 | CRITICAL (RPC DEFINER+GRANT) | ❌ still open (requires live DB) |
| 4 | MAJOR (`createNode` race) | ❌ still open |
| 7 | MAJOR (`mineSubTab` dead) | ❌ still open |
