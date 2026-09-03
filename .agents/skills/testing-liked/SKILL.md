---
name: testing-liked
description: End-to-end smoke testing guidance for the LIKED Next.js app, including environment checks, login/workaround notes, and component isolation.
---

# LIKED End-to-End Smoke Testing

## Overview

LIKED is a Next.js 15/16 + Supabase app. Authenticated smoke tests need a Supabase project that contains the LIKED schema (`public.users`, `public.get_feed` RPC, etc.) and a valid publishable key.

## Devin Secrets Needed

- `NEXT_PUBLIC_SUPABASE_URL_DEV`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (for admin setup if needed)
- `SUPABASE_DB_CONNECTION_DEV` (for seeding)

## Steps

1. `npm install` — expect an `EBADENGINE` warning for `eslint-visitor-keys` on Node `v20.18.x`; install still succeeds.
2. `npm run build` — must exit `0`.
3. Start dev server on the standard port: `npm run dev`.
4. Smoke-test pages:
   - `http://localhost:3000/login` — expect centered auth form.
   - `http://localhost:3000/signup` — expect centered signup form.
   - `http://localhost:3000/feed` unauthenticated — expect `307` redirect to `/login`.
5. Dynamic route handlers (Next.js 16 `params` Promise):
   - `curl -X DELETE http://localhost:3000/api/folders/test-id` → `401` (not 500).
   - `curl -X DELETE http://localhost:3000/api/nodes/test-id` → `401` (not 500).
6. If real auth cannot be created because the Supabase project is empty or credentials mismatch, isolate components:
   - Create temporary `app/test-add-card/page.tsx` rendering `<AddCardSheet open userId="" ... />`.
   - Create temporary `app/test-share/page.tsx` rendering `<SharePickerModal isOpen shareType="node" ... />`.
   - Delete the temporary routes after screenshots.

## Common Issues

- `Invalid API key` or `Database error querying schema` during login usually means the configured `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` point to a project without the LIKED schema or with mismatched credentials. Verify the URL matches the key's `ref` claim.
- Direct `auth.users` insertion via the DB connection is unlikely to work for GoTrue sign-in; prefer the Admin API or Supabase Dashboard.
- The `middleware` deprecation warning from Next.js 16 is non-fatal.

## Annotations

Use `annotate_recording` for setup, test start, and pass/fail assertions. Maximize Chrome before recording.