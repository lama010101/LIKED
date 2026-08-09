---
name: LIKED Next.js E2E smoke test
description: How to build, start, and run Playwright/CDP smoke tests for the LIKED Next.js app against the local dev server.
---

# LIKED Next.js E2E smoke test

## Devin secrets needed
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by the app for auth and feed.
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_CONNECTION` — only needed if you must set up or verify the Supabase project schema for authenticated tests.

## Setup
1. Checkout the branch under test (`devin/YYYYMMDD-audit-fixes`, etc.).
2. Install JS deps and run static checks:
   - `npx tsc --noEmit`
   - `npm run lint` (expect 0 errors; warnings are common)
   - `npm run build`
3. Start the dev server: `npm run dev` (default port `3000`).
4. If using Playwright and the browser cache is stale for the installed `playwright` version, run `npx playwright install chromium`.

## Testing the unauthenticated golden path
- `/login` should render the auth card with the `liked.` wordmark, email/password inputs, and **Sign In** / **Continue with Google** buttons.
- `/signup` should render the same card with `displayName` input and **Sign Up** button.
- `/feed` while unauthenticated should redirect to `/login` (per `middleware.ts` and `app/(app)/feed/page.tsx`).
- Collect `pageerror` + `console` `error` events and any network response `>= 500`; fail if any appear.

## Testing the authenticated feed shell
- The feed page requires a valid user session and the Supabase project must contain the LIKED schema, especially the `public.get_feed(...)` RPC.
- If the configured Supabase project does not have `get_feed`, `/feed` will 500 after login and the feed UI cannot be exercised.
- To get a session, either:
  - use the `/signup` UI (works only when email confirmation is disabled); or
  - use the Supabase admin API with `SUPABASE_SERVICE_ROLE_KEY` to create a confirmed user, then sign in through `/login`.
- Once authenticated, exercise `TopBar` search, `FeedTabs`/`MineSubTabs`, `SortViewRow` view toggles, the `FabSpeedDial` **Add Card** sheet, and `BottomBar` interactions.

## Common blockers
- `get_feed` missing from the connected Supabase project → feed route 500s; cannot test feed shell or FAB/view-mode interactions.
- Chrome for Testing infobar in Playwright headful screenshots; for PR-comment screenshots prefer a headless capture or crop the banner.
