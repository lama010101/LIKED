---
name: testing-liked
description: End-to-end smoke testing guidance for the LIKED Next.js app — incl. prod cookie-auth, CDP attach to the managed Chrome, and scroll-chain audit methodology.
---

# LIKED End-to-End Smoke Testing

## Overview

LIKED is a Next.js 16 + Supabase app. Authenticated smoke tests need a Supabase project with the LIKED schema (`public.users`, `public.get_feed` RPC, etc.) and a valid publishable key.

## Devin Secrets Needed

- `NEXT_PUBLIC_SUPABASE_URL_DEV`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (for admin setup if needed)
- `SUPABASE_DB_CONNECTION_DEV` (for seeding)

## Prod auth without Google OAuth (verified on liked-zeta.vercel.app)

Google-OAuth is the only UI login, but password-grant works for seeded test accounts (e.g. `devin-test-*@example.com`, `e2e-test@liked.app`):

1. `curl -X POST '<SUPABASE_URL>/auth/v1/token?grant_type=password' -H 'apikey: <PUBLISHABLE_KEY>' -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'`
2. Cookie `sb-<project-ref>-auth-token` = `base64-` + base64url(raw session JSON). If value >3180 chars, split into `name.0`, `name.1`, … chunks (@supabase/ssr chunk format; a ~2.2KB session fits in ONE cookie).
3. Set via CDP `Network.setCookie` (url=app origin, path=/, sameSite=Lax), then navigate — `/feed` renders `.shell` when authed.

## Attaching CDP to the managed Chrome (localhost:29229)

No node/playwright needed — python works:

- `pip install websocket-client`
- Connect to the page target's `webSocketDebuggerUrl` from `http://localhost:29229/json/list` **with `suppress_origin=True`** — Chrome 403s websocket handshakes that carry a non-allowlisted `Origin` header; omitting it entirely passes.
- Then use `Page.navigate`, `Runtime.evaluate`, `Network.setCookie/deleteCookies` for the whole test loop.

## Scroll-chain auditing (FIX-SCROLL-001 regression class)

`.shell{height:100dvh;overflow:hidden}` → scrolling must happen inside `.shell-content{overflow-y:auto}` and `.rail{overflow-y:auto}`. Every flex COLUMN in `.shell > .shell-main > .shell-body > .shell-inner > .shell-content` needs `min-height:0` (or `overflow:hidden`, which zeroes the flex item's automatic minimum).

**Failure signature** (detect via Runtime.evaluate):
- A scrollable element reports `clientHeight == scrollHeight` AND `getBoundingClientRect().bottom > innerHeight+2` — the box itself grew past the viewport and is clipped by an `overflow:hidden` ancestor, so no scrollbar can ever engage.
- `getComputedStyle(el).minHeight === 'auto'` on a flex-column child is the tell (flex items refuse to shrink below min-content height).
- Verify: `el.scrollTop += 240` on `.shell-content`/`document.scrollingElement` changes nothing, AND a real wheel gesture doesn't move the page.

**Confirm root cause in-session** (no code change): `document.querySelector('.shell-main').style.minHeight='0'` — if the chain instantly shrinks to viewport and scroll engages, the missing rule on that element is the fix.

**Forcing overflow on short pages:** resize the real window with `wmctrl -r '<title>' -b remove,maximized_vert,maximized_horz` then `wmctrl -r '<title>' -e 0,x,y,w,h` (physical px; CSS viewport ≈ physical/2 minus ~129 CSS px of browser chrome). Chrome enforces a minimum window width (~500 CSS px) — that's still under the 700px mobile breakpoint, so it doubles as a mobile-layout check (`.shell-bottom` bar appears). Re-maximize with `-b add,maximized_vert,maximized_horz`.

## Steps (local)

1. `npm install` — EBADENGINE warning for `eslint-visitor-keys` on Node 20.x is non-fatal.
2. `npm run build` — must exit 0.
3. `npm run dev`.
4. Smoke: `/login` centered auth form; `/feed` unauthed → 307 to `/login`.
5. API unauth: `curl -X DELETE localhost:PORT/api/folders/x` → 401 (not 500).
6. If real auth is impossible, isolate components on temporary `app/test-*/page.tsx` routes, screenshot, delete.

## Annotations

Use `annotate_recording` for setup/test_start/assertion. Maximize Chrome before recording (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`).
