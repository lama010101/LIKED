# BUG-CARDCLICK-002 — What reverts the URL to /feed after card-link navigation for a@a.com

**Project:** LIKED · **Task ID:** BUG-CARDCLICK-002 · **Task Title:** Locate what reverts the URL to /feed after card-link navigation for a@a.com
**Date:** 2026-11-20 · **Scope:** Investigation only. Temporary Playwright instrumentation deleted after runs; `git status` shows only `lib/db/friends.ts` (uncommitted dedupe from FIX-FRIENDBAR-DEDUPE-001, left as-is) + this report.
**Environment:** local production build (`next build --webpack` + `next start` :3001) against prod Supabase; sessions via admin magiclink (a@a.com) / password grant (e2e-test@liked.app); viewport 390×844 unless noted.

## Root-cause statement

**The "push then revert" hypothesis is FALSIFIED.** No `history.pushState`/`replaceState`/`popstate` call occurs during a failed card click (E1: `HIST_LOG_COUNT 0`). Instead, the App Router navigation is **aborted client-side before the history-commit stage**: the click fires `GET /card/<id>?_rsc=…`, the response headers return 200, then the fetch is aborted (`net::ERR_ABORTED`) and the URL never changes. The dispatcher of that abort is **UNVERIFIED** — see Eliminated causes and Remaining suspects below.

## Experiment results

### E1 — history instrumentation (a@a.com, 390px)

`addInitScript` wrapped `history.pushState`/`replaceState` + `popstate` listener + `framenavigated`. Clicked first `a.card-link` (`/card/c8c0694c-…`).

| Observation | Result |
|---|---|
| `history.pushState` calls during click | **0** |
| `history.replaceState` calls | **0** |
| `popstate` events | **0** |
| `framenavigated` | only `/feed` (×2, page load + refresh) — never `/card/*` |
| `GET /card/c8c0694c…?_rsc=…` | fired, status 200 headers |
| Final URL | `/feed` |

**PROVEN:** nothing pushes `/card/<id>` then reverts to `/feed`; the navigation dies before any history write.

### E2 — start-page scope (a@a.com, 390px)

| Start page | Click target | Result |
|---|---|---|
| `/me` | header icon link | NAVIGATED → `/notifications` |
| `/friends` | friend rail link | NAVIGATED → `/feed?friend=5355c879…` (laurent) |
| `/notifications` | page link | NAVIGATED → `/feed` |
| `/feed` | `a.card-link` | **STAYED** `/feed` |
| `/feed` | header icon link (earlier run) | **STAYED** `/feed` |

**PROVEN:** navigation works *from* `/me`, `/friends`, `/notifications` — including *to* `/feed` (`/notifications → /feed` and `/friends → /feed?friend=` both committed). `/feed` is a fine navigation **target** but a failing **source** for this account. The defect is specific to transitions **out of** `/feed`, not to `/card/[id]` itself (direct `goto /card/c8c0694c` renders fine).

### E3 — router/history call inventory (static grep)

`grep -rn "router\.\(push\|replace\|refresh\|back\)\|history\.\(pushState\|replaceState\)\|window\.location" app/(app) lib components`

Calls that can fire without user action on `/feed`:

| file:line | Call | Fires when |
|---|---|---|
| `app/(app)/_components/AppShell.tsx:105` | `syncGoogleAvatar().then(r => r.ok && r.updated && router.refresh())` | once per AppShell mount, only if avatar updated |
| `app/(app)/_components/AppShell.tsx:137` | `onNewShare: () => router.refresh()` | realtime `edges` INSERT `direction='received'` only |
| `app/(app)/_components/AppShell.tsx:134-141` | `useRealtime` other callbacks | `setUnread` / no-ops — no router calls |
| `app/(app)/feed/_components/FeedHome.tsx:58,166` | `router.push('/feed?…')` | user clicks sort/group segs only |
| `app/(app)/feed/_components/FeedHome.tsx:206` | `router.refresh()` | card dropped on folder tile only |
| `lib/hooks/useRealtime.ts:59-129` | 5 postgres_changes subscriptions | event-driven only |

No `router.replace`, no `history.*`, no `location.*` write, and no filterStore→URL sync effect exists on `/feed` (`lib/store/filterStore.ts` is only hydrated via `initializeFilterStore` from server props; `serializeFilterStateToURL` has no caller on this page). **PROVEN (static):** no app-code path rewrites the URL on `/feed` outside user actions.

### E4 — persisted client state (a@a.com vs control)

`localStorage` dump after `/feed` load: **`{}` — completely empty** for a@a.com (fresh context; identical for control). No `liked.view`, `liked.layout`, `liked.folderSort`, `liked.rail*`, or filterStore keys exist → nothing persisted can re-impose URL state. **PROVEN:** client-persisted state is not the differentiator.

### E5 — realtime blocked (two passes)

| Pass | Method | Result |
|---|---|---|
| E5a | `ctx.route` abort on `ws*`/`websocket` URLs | inconclusive — Playwright `route` does not intercept WS handshakes |
| E5b | `page.routeWebSocket(/realtime|supabase/, ws => ws.close())` — **4× WS_BLOCKED confirmed** | click still **STAYED** `/feed` |

**PROVEN:** Supabase Realtime is not the cause (matches PORTFOLIO-AUDIT-001, which saw the failure while Realtime was CSP-blocked).

### E6 — RSC response capture (a@a.com, 390px)

| Request | Status | Body |
|---|---|---|
| `GET /card/c8c0694c…?_rsc=ew8HLb5AqLZXcgaJ` (the click) | 200 headers → **`net::ERR_ABORTED`** | body unavailable (aborted) |
| earlier `/card/*?_rsc=HtJZ…`/`02U0…` (prefetches) | 200 | mostly aborted; one completed at **417 bytes** — flight stub ending `"b":"fl6LvycCtyXSWu_pdme3O"` (buildId) |
| `requestfailed` events | — | every `/card/*?_rsc` for this account ends ERR_ABORTED; header/rail prefetches (`/me`, `/notifications`, `/organize`, `/friends`, `/folders/*`, `/feed?friend=*`) also show ERR_ABORTED batches — normal prefetch churn |

**PROVEN:** the navigation fetch is aborted client-side; the 200 was headers-only. The `_rsc` state-tree hash differed across batches (`HtJZ…`, `02U0…`, `ew8H…`) without any URL change — the router's internal state is being mutated between requests (circumstantial).

## Eliminated causes (all PROVEN negative)

- URL revert via `history.pushState`/`replaceState`/`popstate` — zero calls (E1)
- Realtime websocket events — blocked, still fails (E5b)
- Persisted client state (localStorage/filterStore) — empty (E4)
- Duplicate React keys — fixed by uncommitted `lib/db/friends.ts` dedupe; warnings gone, clicks still fail (FIX-FRIENDBAR-DEDUPE-001)
- `ItemMenu`/portal handlers — `stopPropagation` only on `.menu-btn`/modal backdrop, cannot affect plain card clicks (`ItemMenu.tsx:31`, `Modal.tsx:29,39`)
- Selection mode / long-press / dnd-kit — none exist; cards use native `draggable` + `onDragStart` only (`CardItem.tsx:70-75`); no `useSensor`/`DndContext` anywhere
- Server-side render of `/card/[id]` — direct load 200 for the same node

## Remaining suspects (UNVERIFIED)

1. **A competing App Router action dispatched at click time** — `ERR_ABORTED` on the nav fetch is the signature of a superseded/cancelled transition. No app-code caller was found statically, but the abort could come from Next.js internals (e.g., a pending refresh/prefetch invalidation, or the router's action queue stuck from an earlier unresolved navigation during `/feed` load).
2. **Transition suspension/discard keyed to a@a.com's data** — her `/feed` props (10 `received` nodes with sender fields, pending invite row, unread notifications) differ from control; if the flight payload or a shared client component suspends during the transition, React silently keeps the old UI. Direct load works, so this would have to be transition-specific.
3. **`useCardView` latent hydration hazard** (`ViewSwitch.tsx:14-15` reads `localStorage` in `useState` initializer) — ruled out empirically here (empty localStorage → `list` both sides) but remains a real #418-class risk for users with stored prefs.

**Other accounts:** scope UNVERIFIED — the trigger is account-data-correlated (a@a.com fails, laurent + e2e-test pass on identical client state), but the specific data field was not isolated.

## Next-best evidence (not collected — would need instrumentation beyond read-only scope)

- React/Next router action trace: patch or debug-build hook on the app-router dispatcher to log every dispatched action (navigate/refresh/restore) with timestamps — would name the aborting action directly.
- `performance` resource timing + `response.body` stream read on the `_rsc` fetch to see whether the flight stream stalls vs. is cancelled.
- Diff of the `/card/[id]?_rsc` flight payload between a@a.com and control (requires completing the fetch — currently aborted before body).

*One-sentence fix direction per remaining suspect: (1) if a stray `router.refresh()`/prefetch invalidation is confirmed, gate it; (2) if transition suspension is confirmed, find the suspending component in `/card/[id]`'s flight tree; (3) convert `useCardView` to `useSyncExternalStore` like `MeView`. — none implemented; investigation only.*

---

*End of report — BUG-CARDCLICK-002*
