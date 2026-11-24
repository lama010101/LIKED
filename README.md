# LIKED

A collaborative link library: save links (URL, text, YouTube, or via the Chrome extension), organize them into nested folders, and share cards and folders with friends and groups. Visibility is derived from database edges — every share is a *cause* plus *edges* written in a single transaction, and every feed query runs inside Postgres.

> **Status:** the shipped app is the link library described below. A "Recommendation Inbox" v2 is in progress — its database foundation exists, but there is no user-facing v2 surface yet, so nothing here claims it.

## Stack

- **Next.js 16** (App Router, Turbopack dev / webpack build) + **React 19**
- **Supabase** — Postgres (RLS everywhere), Auth (Google OAuth), Realtime, Storage
- **next-intl** — en / fr / es / th, parity-checked in CI
- **Tailwind CSS**, dark/light theme
- **Vitest** (unit) + **Playwright** (e2e against a running deployment)
- Chrome extension (MV3) in `extension/`

## Architecture highlights

- **Cause/edge visibility model** — sharing writes a cause row plus permission edges in one transaction; read visibility is computed by SQL (`get_feed`, `get_folders`, `get_visible_node_by_id`, …), never in TypeScript. There is no client-side filtering, sorting, or deduplication of feed data.
- **RPC write authority** — all mutations go through `SECURITY DEFINER` Postgres functions (`import_url`, `share_node`, `share_folder_v2`, `move_node_everywhere`, `trash_*`, `restore_*`, ratings, friend/group management). The frontend renders; server actions only orchestrate.
- **Invariants check** — `scripts/check-invariants-001.mjs` verifies DB + repo invariants (RLS coverage, grant hygiene, FK coverage for account deletion, no secrets in tracked files, tsc clean) — 70 checks.
- **CI** — `.github/workflows/ci.yml` (typecheck, lint, unit tests, build, contrast/language/invariant scripts) and `.github/workflows/e2e.yml` (Playwright) run on every push/PR to `main`.
- **Deterministic rebuild** — system state rebuilds from the database only; no hidden caches or memory-only truth.

## Repository layout

| Path | Contents |
|---|---|
| `app/` | Routes: `/feed`, `/card/[id]`, `/folders/[id]`, `/friends`, `/me`, `/notifications`, `/organize`, `/trash`, `/youtube`, `/extension`, legal pages |
| `app/(app)/_components/` | App shell, cards, rails, sheets, modals |
| `lib/db/` | Data-access layer — all reads/writes funnel through RPCs or RLS-scoped table reads |
| `supabase/migrations/` | Ledgered migrations (currently through `146`) |
| `scripts/` | Invariant/contrast/language checkers + DB verification harnesses |
| `e2e/` | Playwright specs + auth helpers |
| `extension/` | Chrome MV3 extension |
| `flow/`, `workspace/`, `app/proto/` | UI experiments — gated behind env flags, off by default |
| `docs/` | PRD, build plan, architecture spec, feed SQL spec, audit reports, progress log |

## Running locally

Requirements: Node 20+, npm, a Supabase project with the LIKED schema applied.

```bash
npm install
cp .env.example .env.local   # if present, else create it — see below
npm run dev                  # http://localhost:3001
```

`.env.local` needs at least:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...        # service-side operations
```

Optional: `NEXT_PUBLIC_APP_URL`, `OPENROUTER_API_KEY` (AI organize), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + `YOUTUBE_TOKEN_ENCRYPTION_KEY` (YouTube connect), `NEXT_PUBLIC_SHOW_FLOW=1` / `NEXT_PUBLIC_SHOW_PROTO=1` (dev-only UI previews).

## Checks

```bash
npm run lint                 # eslint
npx tsc --noEmit             # typecheck
npm test                     # vitest unit tests
npm run build                # production build (next build --webpack)
node scripts/check-invariants-001.mjs
npm run test:e2e             # playwright (needs a reachable deployment + TEST_EMAIL/TEST_PASSWORD)
```

## Docs

Architecture, specs, audits, and the progress ledger live in [`docs/`](docs/) — start with `docs/01_PRD.md`, `docs/03_TECHNICAL_ARCHITECTURE.md`, and `docs/04_FEED_SQL_SPEC.md`.
