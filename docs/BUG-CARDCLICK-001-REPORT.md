# BUG-CARDCLICK-001 — Investigation: dead card-link clicks + hydration #418 for a@a.com

**Project:** LIKED
**Task ID:** BUG-CARDCLICK-001
**Task Title:** Investigate dead card-link clicks and hydration error #418 for a@a.com
**Date:** 2026-11-20
**Scope:** Investigation only. No code changed. Temporary Playwright repro scripts were created and deleted; no repo files modified except this report.
**Prior context:** PORTFOLIO-AUDIT-001 P1-1 — on production, every `a.card-link` click on `/feed` for `a@a.com` (`8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7`) stayed on `/feed` with `defaultPrevented=true`; React error #418 on `/feed` and `/notifications`; `laurent.martenot` unaffected.

---

## 1. Reproduction

Sessions were obtained without passwords via Supabase admin `generate_link` + `verify` (magiclink) for `a@a.com` and `laurent.martenot@gmail.com` — same credential class the audit used (password-grant), different mechanism. Tests ran against **both** `next dev` (localhost:3001, unminified errors, prod Supabase via `.env.local`) and **production** `https://liked-zeta.vercel.app` (post FIX-PROD-HYGIENE-001 deploy `edcb324`).

| Run | Account | Surface | Result |
|---|---|---|---|
| Local dev | a@a.com | `/feed` | **REPRODUCED** — real clicks on `a.card-link` leave URL on `/feed`; `⋯` ItemMenu still opens (React alive); zero pageerrors during click |
| Production | a@a.com | `/feed` | **REPRODUCED** — identical: menu opens, header links + search + card links never navigate |
| Production | e2e-test@liked.app | `/feed` | NOT reproduced — clicks navigate to `/card/[id]` normally, incl. with `liked.view=masonry`/`columns` presets |

Note on `defaultPrevented=true`: this is **expected** for every Next.js `<Link>` click — Link's own `onClick` always calls `preventDefault()` then `router.push()`. The anomaly is that the navigation never commits, not that default was prevented.

## 2. Evidence gathered

### 2.1 Navigation fails silently at commit

Instrumented click on `a.card-link` (local dev, a@a.com):

- `page.on("request")` shows the router **does** fire: `GET /card/<id>?_rsc=…` → `RESP 200`, plus a second `GET /card/<id>` document request → `RESP 200`.
- `page.url()` stays `/feed` after 5–6s. **Zero** `pageerror`/`console.error` during the click.
- Direct `page.goto("/card/c8c0694c-…")` → 200, real card page renders (no 404/error boundary).

So: RSC payload fetch succeeds, the client transition simply never commits the URL — consistent with a corrupted React tree aborting the transition silently.

### 2.2 React is partially alive

- `a.card-link .menu-btn` click → ItemMenu modal opens (`MENU_OPEN_COUNT 2`) — React `onClick` + state work inside cards.
- View-seg click test was inconclusive (selector matched the sort seg, not view seg — test artifact, not evidence).
- Search submit + header icon links also fail to navigate → breakage is router/navigation-wide, not card-specific.

### 2.3 Duplicate React keys — the data anomaly

Dev console on a@a.com's `/feed` (and `/notifications`-adjacent loads):

```
Encountered two children with the same key, `%s`. … f8599a24-f5a4-41cd-bffd-2bff37b14bbb   (×3)
```

DB lookup for `f8599a24-f5a4-41cd-bffd-2bff37b14bbb`: **not** a node/tag/folder/edge — it is a **user** (`public.users.display_name = "bb"`).

`get_friend_bar` RPC called as a@a.com returns **4 rows**:

```
5355c879-a734-40be-9699-1cb1b2572cff  laurent.martenot
f8599a24-f5a4-41cd-bffd-2bff37b14bbb  bb
f8599a24-f5a4-41cd-bffd-2bff37b14bbb  bb        ← duplicate user_id
null                                  null      ← spurious null row
```

`FriendsRail.tsx:28` filters the null row (`f.user_id &&`) but **not** the duplicate: `FriendsRail.tsx:32` renders `<Link key={f.user_id} href={/feed?friend=${f.user_id}}>` — two children with identical `key` and identical `href` inside `.shell-rail`, a subtree of `AppShell` that wraps every `(app)` page.

`get_feed` for a@a.com returns 33 nodes, all unique `node_id` (10 `received`, 23 `own`) — feed rows are clean. `public.users` row for a@a.com is unremarkable (`display_name "a"`, `avatar_key null`, `language_code "en"`). `edges` has no duplicate `node_id+direction`.

### 2.4 Hydration error #418

- Observed by the audit on prod `/feed` + `/notifications` for a@a.com (minified #418).
- **Not reproduced** in my 2 prod runs or the dev run for a@a.com — intermittent/timing-dependent. Dev surfaced the duplicate-key warnings instead; prod build surfaces #418 under the same corrupted-tree conditions.
- `useCardView` (`ViewSwitch.tsx:14-15`) was tested as a candidate (`useState(() => localStorage.getItem("liked.view"))` — the same bug class fixed in `MeView` per `UX-ME-SEG-HYDRATION-001`) — setting `liked.view=masonry|columns` on e2e-test produced **no** hydration error and clicks still worked → ruled out as this bug's cause (remains a latent hydration hazard, see §4).

## 3. Root cause

**`get_friend_bar` returns duplicate friend rows for a@a.com → `FriendsRail` renders duplicate React keys → React fiber corruption inside `AppShell` → Next.js client-side navigations from `/feed` never commit (URL stays, no error), while local component state (ItemMenu) keeps working.**

Evidence chain:

1. `lib/db/friends.ts:38` — `getFriendBar` → `supabase.rpc("get_friend_bar", { p_user_id })` — **no dedupe**; returns raw rows.
2. Live RPC output for a@a.com: `bb` (`f8599a24-…`) twice + one null row (null filtered downstream).
3. `app/(app)/_components/FriendsRail.tsx:32` — `key={f.user_id}` → duplicate keys (dev console ×3, exact id match).
4. Reproduced dead navigation for a@a.com on prod + dev; e2e-test (unique friends) unaffected; laurent unaffected per audit.
5. #418 on prod is the same corrupted-tree class surfacing under prod hydration timing (intermittent — not every load).

**Residual uncertainty (honest scope):** the precise fiber-level step by which duplicate keys inside `.shell-rail` aborts the App Router transition commit was not observed directly (would need React DevTools fiber inspection or an unminified prod build with the error boundary trace). The data anomaly → duplicate keys → account-specific breakage chain is fully evidenced; the last hop (keys → nav abort) is inferred from the perfect account correlation + React's documented "unsupported behavior" for duplicate keys, not from a stack trace. Alternative unproven candidates were eliminated: feed rows unique, profile normal, CSP fixed, `useCardView` ruled out empirically, no JS errors during clicks.

**Other accounts:** any account whose `get_friend_bar` returns the same `user_id` twice (or spurious null/duplicate invite resolutions) is exposed to the same failure. Currently confirmed only for a@a.com — her friend list contains a duplicated "bb" friendship, most likely from duplicate `friend_invites`/accepted-friendship rows (migration `113_backfill_pending_friend_invites.sql` is a suspect upstream writer; not verified which write path produced the dup).

## 4. One-sentence fix hints (no fix implemented — investigation only)

- `get_friend_bar` should `DISTINCT`/dedupe on `user_id` (or the friend write path should enforce one accepted friendship per pair) — the duplicate rows are the true root.
- `FriendsRail.tsx:32` could key on a unique row identifier as defense-in-depth, but that treats the symptom.
- `useCardView` (`ViewSwitch.tsx:14-15`) still reads `localStorage` in a `useState` initializer — the exact pattern `UX-ME-SEG-HYDRATION-001` fixed elsewhere; latent #418 risk for any user with non-`list` view pref (did not cause this bug).
- The spurious `null` friend row from `get_friend_bar` is benign today (filtered at `FriendsRail.tsx:28`) but indicates the RPC emits junk rows worth auditing.

---

*End of report — BUG-CARDCLICK-001*
