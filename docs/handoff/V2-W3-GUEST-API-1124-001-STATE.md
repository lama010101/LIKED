# V2-W3-GUEST-API-1124-001 — state

Last updated: 2026-11-25. Session was context-limited; this file is the
resume point.

## Branches / commits (pushed)

| Stack | Branch | Head SHA | Base |
|---|---|---|---|
| A (P0-11 + P0-12) | `devin/V2-W3-GUEST-API-1124-001` | `8f9a614` | `origin/main` `346b03f` |
| B (P0-13) | `devin/V2-W3-GUEST-1124-001-b` | `271b83e` | branch A |
| C (P0-14) | `devin/V2-W3-GUEST-1124-001-c` | `ce8644a` | branch B |

PR objects: NOT created — the GitHub MCP server was unreachable for the
whole session and no `gh`/token exists on the box. Compare URLs:
`https://github.com/lama010101/LIKED/compare/main...devin/V2-W3-GUEST-API-1124-001`

Validation ran in an isolated worktree `D:\LIKED-W3-GUEST` because the
parallel session (V2-W4-PIPELINE-1124-001) was writing untracked files
(`app/api/cron/`, `lib/enrich/*`) into the shared checkout `D:\LIKED`,
which broke `tsc`/`next build` there.

## Done

- A: `lib/tmdb/{client,parse}.ts`, `lib/youtube/{serverKey,budget}.ts`,
  `/api/ask/search`, `/api/ask/resolve`, CSP + remotePatterns for
  `image.tmdb.org`, `scripts/tmdb-th-check.mjs`, 50 tests.
- B: `/api/ask/session` (GET issue PoW, POST mint), `/r/[token]` server
  page + identical-404 `not-found.tsx`, `components/v2/friend/{FriendFlow,
  LanguageAppearanceSheet,powClient,types}`, `friend.*` + `ask.*` i18n in
  en/fr/es/th, 10 session tests.
- C: `/api/ask/{submit,receipt,delete-me}`, `lib/enrich/kick.ts`,
  `components/v2/friend/{AddScreen,ReceiptScreen,ScoreSlider}` + FriendFlow
  wiring, `e2e/v2-guest-landing.spec.ts`, 13 write-route tests.

Gates (worktree C): tsc 0; eslint 0 errors; vitest 287/287;
check-invariants 71/0; verify-v2-security 98/0; check-languages 4/0;
check-contrast 109/0; `next build --webpack` green (first attempt can hit
the known next/font Google-loader flake — retry); protected paths 0 vs
`origin/main`.

## Blocked (needs a decision, not code)

1. **YouTube guest search** — needs a class-S RPC writing
   `youtube_search_cache`; REPO-15 forbids direct `.from(...).upsert/insert`
   and migrations are not pre-authorized. `src=youtube` answers
   `{status:'busy'}` so the UI degrades to the paste-a-link row.
2. **TMDB genre sync** — same REPO-15 rule for `tmdb_genres`; only the
   fetch half (`tmdbGenres`) ships.
3. **eslint `react/jsx-no-literals`** in `eslint.config.mjs` is configured
   `{ noStrings: true }` without `ignoreProps: true`, so it rejects every
   JSX attribute string (`className`, `type`, `aria-*`). Three components
   carry a file-level disable + FINDING comment. One-line fix:
   `ignoreProps: true`.

## Not proven

- Live TMDB probe / TH script / YouTube search calls: no
  `TMDB_API_READ_ACCESS_TOKEN`, no `YOUTUBE_API_KEY` locally (key-NAMES
  check). 0 of the 3 allowed YouTube search calls used.
- e2e: spec written, not executed (needs a seeded ask token + a running
  server with `GUEST_COOKIE_SECRET`/`RATE_LIMIT_PEPPER`).
- PoW solve time in headless Chromium: not measured.
- 360 px / 4-language clipping, axe: not run.
- Vercel-preview spoofed `x-forwarded-for` test: not run. Locally
  `lib/ask/clientIp.ts` honours the first XFF value by design (§4.3), so
  the bucket *does* change with a spoofed header off-Vercel; the
  protection relies on the edge overwriting XFF.
- Test-data row counts + `delete_guest_data` cleanup: no rows were
  created (no live run).

## Next

1. Create the three draft PRs (stacked A → B → C) when GitHub is reachable.
2. Add `ignoreProps: true` to the v2 eslint block (CTO, outside task scope).
3. Decide on the two missing class-S RPCs (cache write, genre sync) —
   both need one migration; then implement `lib/youtube/searchCache.ts` and
   `lib/tmdb/genres.ts` sync.
4. Run the e2e suite with a seeded `zz-e2e-` ask token; measure PoW solve
   time; axe + 360 px checks.
