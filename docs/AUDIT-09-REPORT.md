# AUDIT-09 — Full Codebase Audit Report

**Date:** 2026-10-03
**Auditor:** Devin (automated)
**Scope:** Full codebase — `app/`, `lib/`, `components/`, `extension/`, `supabase/migrations/` (001–134), `scripts/`, `e2e/`, `.github/workflows/`, `proxy.ts`, `next.config.ts`
**Method:** Differential vs AUDIT-08 (2026-09-03) — verified the P0 RPC-gating fix still holds on the live DB, audited ~200 commits of post-AUDIT-08 work (UX batches, YouTube features, MVP2 folder/share/trash RPCs, organize/AI categorize), plus fresh sweeps for rule violations, dead code, and dependency CVEs.
**Build status:** `eslint` clean (0 errors), `tsc --noEmit` clean, `vitest` 95/95 pass. Live DB: all 134 migrations applied (no drift).

---

## Summary

| Severity | AUDIT-08 | AUDIT-09 (current) | Delta |
|----------|----------|--------------------|-------|
| P0 (Critical) | 0 (fixed by 092) | 0 | RPC gating verified intact |
| P1 (High) | 0 | **1** (deps) | next@16.3.0 in critical CVE range |
| P2 (Medium) | ~2 | **1** | client-side feed sort (logic leak + pagination bug) |
| P3 (Low) | ~3 | ~6 | dead code, stale types, proxy drift, helper grants |

**Headline finding:** `next@16.3.0` falls inside the vulnerable range (16.0.0–16.3.5) of three published RCE advisories — fix available via `npm audit fix`. Top code finding: `FeedHome` re-sorts `get_feed` results client-side — a FEED-VIOLATION class logic leak that is *also* a correctness bug under pagination.

**Verified intact since AUDIT-08:**
- P0 fix: every `SECURITY DEFINER` function granted to `authenticated` that takes `p_user_id`/`p_owner_id`/`p_sharer_id` now has the `auth.uid()` gate (21 verified on live DB incl. `get_feed`, `get_friend_bar`, `get_folder_tree`, `get_user_folders`).
- No XSS vectors (`dangerouslySetInnerHTML`, `eval`, `.innerHTML =` → 0 hits).
- Write path: all visibility writes go through RPCs — single exception is a content edit (`updateNodeText`, see P3-4).
- API routes all gate on `getUser()`/bearer auth; YouTube OAuth callback validates state cookie and restricts `next` to same-origin paths; tokens stored encrypted.
- Extension service worker uses exact-origin allowlist for session messages.
- No live callers of dropped RPCs (migrations 102/106/132) or dead tables; `components/` reduced to one file (`Toaster.tsx`) after the `(app)/_components` consolidation.
- Security headers present (CSP, X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy).
- No hardcoded secrets/JWTs in `scripts/` (LIKED-SEC-002 holding).

---

## P1 — Dependency vulnerabilities

### P1-1: `next@16.3.0` inside critical advisory range — `package-lock.json`

`npm audit` reports 17 vulnerabilities (1 critical, 11 high, 4 moderate, 1 low). Most are dev-tooling (vitest, tailwind/eslint transitive `braces`, `browserslist`, `js-yaml`), but the installed `next@16.3.0` is within `16.0.0 – 16.3.5`, flagged by:

- **GHSA-p293-qw3h-jr36** — Unauthenticated RCE on Windows-hosted servers (prod runs Vercel/Linux, so likely not exploitable here)
- **GHSA-2xp9-vwfh-vxw4** — Unauthenticated RCE in Image Optimization API when AVIF files are used
- **GHSA-vcvr-r3jv-pc5j** — RCE in `next/og` ImageResponse

The last two are host-agnostic; LIKED uses `next/image` with `remotePatterns` (`next.config.ts`), so Image Optimization is reachable.
**Fix:** `npm audit fix` (non-breaking bump within `^16.3.0`). Verify build (`npx next build --webpack`) + lint after.

Also high-severity: `sharp <0.35.4` (libheif vulns) — `npm audit fix` covers it.

## P2 — Feed rule violations

### P2-1: `FeedHome` client-side alpha sort — `app/(app)/feed/_components/FeedHome.tsx:52-54`

```ts
const sortedNodes = cardSort === "alpha"
  ? [...nodes].sort((a, b) => (a.title ?? a.text_content ?? "").localeCompare(b.title ?? b.text_content ?? ""))
  : nodes;
```

Three problems:
1. **LOGIC LEAK** — sorting outside SQL is explicitly forbidden (feed = `get_feed` black box; `p_sort` supports only `newest|oldest|most_shared|highest_rated|custom`). `useFeed.ts:11-18` documents this invariant — FeedHome violates it on the same data.
2. **Wrong order under pagination** — `loadMore` (`FeedHome.tsx:78-94`) appends `get_feed`'s `created_at`-cursored pages, so an alphabetically-earlier node on page 2 renders below page-1 nodes. Only the *loaded subset* is sorted.
3. **Wrong key** — sorts raw `title`/`text_content`; SQL resolves titles through `translations` (`resolved_title` stage in `get_feed`).

**Fix direction:** add `'alpha'` to `get_feed`'s `p_sort` (sort on `resolved_title`) and route the seg control through `?sort=alpha` like other feed params — or drop the alpha option. (Note: `FolderRail.tsx:93-97` client-sorts the folder list the same way; folders aren't paginated so it's complete-but-leaky — same fix class, lower severity.)

## P3 — Low-severity findings

### P3-1: Permission-helper RPCs granted to `authenticated` without need — live DB
`effective_folder_permission(p_folder_id, p_user_id)`, `effective_node_permission(p_node_id, p_user_id)`, `folder_is_visible(p_folder_id, p_user_id)` (migration 122) are `SECURITY DEFINER`, granted to `authenticated`, take a caller-supplied user id, and contain no `auth.uid()` gate — an authenticated caller can probe *any* user's permission on any folder/node (metadata leak only, no content). Unlike the 091 helpers (which RLS policies call, justifying their grant), **no RLS policy references these three** and **no app code calls them** (only stale `lib/types/database.ts` entries). 
**Fix:** `REVOKE EXECUTE … FROM authenticated` (or gate on `p_user_id IS NOT DISTINCT FROM auth.uid()`).

### P3-2: Dead hooks — `lib/hooks/` (~694 lines, zero callers)
`useFeed.ts` (249), `useFeedURLSync.ts` (127), `useSearchController.ts` (122), `useLongPress.ts` (109), `useDebouncedSearch.ts` (51), `useLocalStorage.ts` (36). The live feed path is `feed/page.tsx → getFeed → FeedHome`; `useFeed()` has no call sites (`grep useFeed(` → only its own definition). The dead `useSearchController` is the sole importer of `useFeedURLSync`/`useDebouncedSearch`. Delete or re-wire — migration-safety rule prefers unreachable code removed.

### P3-3: `lib/types/database.ts` stale vs DB
Generated types still declare dropped functions (`direct_share` l.1232, `get_social_timeline` l.1423 — dropped by migration 132) plus the helpers in P3-1. Regenerate types.

### P3-4: `updateNodeText` bypasses RPC layer — `lib/db/cardDetail.ts:169-173`
Direct `nodes.update` via service client with `owner_id` filter while its sibling `updateNodeTitle` uses the `update_node_title` RPC. Behaviorally safe (owner-scoped content edit, not a visibility write) but inconsistent convention — same guard belongs in an `update_node_text` RPC.

### P3-5: `moveNodeEverywhereAction` multi-RPC loop — `app/lib/actions/mvp2.ts:231-255`
"One move per source folder" = N transactions, not one — a mid-loop failure leaves the node in target + remaining source folders (partial write). Also reads `folder_edges` via session client (`l.235-238`); RLS (`folder_is_accessible`) can silently hide source folders it can't see. Consider an RPC that moves node → target in one transaction.

### P3-6: Proxy protected-route list stale — `proxy.ts:42`
`isProtectedRoute` = `/feed|/trash|/youtube|/social` only; `/social` doesn't exist as a route, and `/me`, `/folders`, `/card`, `/friends`, `/organize`, `/notifications` are missing. Not a vulnerability — `(app)/layout.tsx:8-9` enforces `getSessionUser()` → `/login` for the whole group — but the edge redirect is dead code for most authed routes. Trim or update the list.

### P3-7: CSP `script-src 'unsafe-eval'` — `next.config.ts`
Present in the production CSP; only dev tooling needs it. Drop `'unsafe-eval'` for prod if the app still boots.

### P3-8 (info): `_archive/` still executes in the test suite
`_archive/components/modals/CardDetailSheet/detectEmbed.test.ts` runs in `vitest` (23 tests). Archived code kept under test is deliberate pinning or drift — worth a decision either way. `scripts/` holds ~115 one-off migration/verify scripts — no secrets found, but consider a `scripts/archive/` sweep.

---

## Fixes applied (2026-10-03, all verified)

| Finding | Fix | Verification |
|---------|-----|--------------|
| P1-1 next CVE | `npm audit fix` → next 16.3.8 | advisory range cleared; 17→9 vulns (remaining are dev-only vitest/tailwind transitive, need breaking upgrades — not taken) |
| P2-1 feed sort | Migration **135** `get_feed` `p_sort='alpha'` (resolved_title ASC + keyset title cursor); `FeedHome` seg now routes `?sort=` through the server | prod: `get_feed(...,'alpha',...)` returns alphabetical order |
| P2-1 folder sort | Migration **136** `get_folders p_sort` (drop+recreate); `FolderRail` renders SQL order; `AppShell` passes `liked.folderSort` pref → `getFoldersAction({sort})` | prod: 'created' → created_at DESC within system/non-system groups |
| P3-1 helper grants | Migration **137** REVOKE authenticated EXECUTE on the 3 helpers | `proacl` = service_role only; internal SECDEF callers unaffected |
| P3-2 dead hooks | deleted 6 files (~694 lines) | `tsc` clean, zero importers |
| P3-3 stale types | `scripts/generate-types.ts` rerun | `direct_share`/`get_social_timeline` gone; new RPCs typed |
| P3-4 direct write | Migration **138** `update_node_text` RPC; `cardDetail.ts` calls it | gate probe → 'Caller does not match user_id' |
| P3-5 move loop | Migration **139** `move_node_everywhere` (one transaction, same per-source rights check) | grant = authenticated only |
| P3-6 proxy list | covers `/feed /trash /youtube /me /folders /card /friends /organize /notifications` | — |
| P3-7 CSP | dropped `script-src 'unsafe-eval'` | build passes |
| P3-8 _archive tests | vitest `exclude` adds `_archive/**` | 72/72 tests |

Post-fix checks: `eslint` 0, `tsc --noEmit` 0, `vitest` 72/72, `next build --webpack` exit 0. Migrations 135–139 applied to prod and recorded in `schema_migrations`; new-function grants include explicit `REVOKE … FROM PUBLIC, anon` to match the established grant surface.

## Verification appendix

- `npm run lint` → exit 0. `npx tsc --noEmit` → exit 0. `npx vitest run` → 95/95 (6 files).
- Live DB probe: `pg_proc` sweep — 0 `SECURITY DEFINER` functions with a user-id param and no `auth.uid()` in body beyond the 6 listed (3 P3-1 helpers + 3 internal helpers correctly revoked: `_node_visible`, `_resolve_auto_folder`, `set_custom_order` are `service_role`-only).
- `pg_policies` — `folder_edges` SELECT scoped by `folder_is_accessible`; permission helpers absent from all policies.
- `supabase_migrations.schema_migrations` max = 134 = repo tip.
- Grep sweeps: no `eval`/`innerHTML`/`dangerouslySetInnerHTML`, no hardcoded JWT/keys in `scripts/`, no callers of dropped RPCs.
