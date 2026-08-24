LIKED is a Next.js app for saving and organizing links, backed by Supabase (Postgres + Auth + Storage + Edge Functions), with a companion Chrome extension for quick-saving from the browser toolbar.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, used sparingly in `lib/supabase/service.ts` — never expose to the client |
| `NEXT_PUBLIC_APP_URL` | Base URL used for OAuth redirects and the extension auth relay |
| `NEXT_PUBLIC_EXTENSION_ID` | Chrome extension ID, used by `externally_connectable` messaging |
| `NEXT_PUBLIC_CHROME_WEBSTORE_URL` | Link shown to users who don't have the extension installed |

YouTube integration (liked videos / subscriptions) authenticates via Supabase Auth's Google OAuth provider with the `youtube` scope — configure the Google provider (client ID/secret, redirect URL) in the Supabase dashboard, not as app env vars.

## Project structure

- `app/` — Next.js App Router pages, API routes (`app/api/**`), and server actions (`app/lib/actions/**`)
- `lib/` — shared server/client helpers (Supabase clients, DB access, YouTube API wrapper)
- `supabase/functions/` — Deno Edge Functions (currently `extract-node-metadata`, used server-to-server for link metadata extraction)
- `supabase/migrations/` — SQL migrations
- `extension/` — the Chrome extension (Manifest V3); see `extension/README.md` for its own build steps
- `e2e/` — Playwright end-to-end tests

## Testing

```bash
npm test                # unit tests (Vitest)
npm run test:e2e        # e2e, headless (Playwright)
npm run test:e2e:ui     # e2e, interactive Playwright UI
```

Unit tests (`**/*.test.ts`, run via Vitest — see `vitest.config.ts`) cover pure/mockable logic such as `lib/youtube/client.ts` and `lib/db/rpc.ts`; add more alongside the modules they test as coverage grows. E2E tests run against a local dev server and a real (or local) Supabase project — see `playwright.config.ts` and `e2e/` for setup details.

## Linting & type checking

```bash
npm run lint
npx tsc --noEmit
```

## CI

`.github/workflows/ci.yml` runs lint and build on every push/PR. The e2e job is opt-in: set the `RUN_E2E` repository variable to `true` and provide `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository secrets to enable it.

## Deploying Supabase changes

Migrations live in `supabase/migrations/`; apply them with the Supabase CLI or MCP tooling rather than hand-editing the remote database. Edge Functions are deployed with `supabase functions deploy <name>`.
