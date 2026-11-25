# V2-W5-PIPELINE-1125-002 STATE

Updated: 2025-11-25 (mid-run context handoff)

## Location / branch
- Worktree: `D:/LIKED-W5-PIPELINE-002`
- Branch: `devin/V2-W5-DELETE-1125-001` (also used as the PR #73 head while R3/R4/R5 were fixed)
- Last pushed commit at handoff: `9edef7a36f4303faed560bd3fa8d955bee6b857e` (`fix(account): close reauth proof hole`)
- Temporary rollback-only migration workspace: `.tmp-mig147/` (contains copies of 147/148 and draft 149; do not commit 147/148)

## Completed
1. STEP ZERO complete. Main worktree `D:/LIKED` was dirty with unrelated files; all work is isolated in `D:/LIKED-W5-PIPELINE-002` with `node_modules` junctioned to `D:/LIKED/node_modules`.
2. Read `docs/handoff/V2-W5-PIPELINE-1125-001-STATE.md` and migration 147/148 files from `devin/V2-W5-MIG147-1125-001`.
3. R3/R4/R5 implemented and pushed in commit `9edef7a`:
   - `app/api/account/reauth/done/route.ts`: proof is minted only when server-verified `last_sign_in_at > state.iat - 5000`; wrong uid/expired/missing/stale state redirects to `/settings/delete?reauth=failed`, clears state cookie, and mints no proof.
   - `app/api/account/reauth/start/route.ts`: redirect origin uses `NEXT_PUBLIC_APP_URL`, else `https://${VERCEL_URL}`, else request origin fallback.
   - `app/api/account/delete/route.ts`: success uses `NextResponse.redirect(..., 303)`.
   - `scripts/protected-paths.txt`: `lib/account/**` appended.
   - Tests added in `app/api/account/reauth/reauth.routes.test.ts` and `app/api/account/delete/route.test.ts`; targeted run passed 15/15 before push.
4. Protected paths check after R5 exited 0 and listed `lib/account/deletionPipeline.ts`, `lib/account/reauth.test.ts`, `lib/account/reauth.ts` among 29 protected files.
5. 147/148 contract proof was run in a rollback-only harness after temporarily applying the fetched SQL. Signatures matched contract. `deletion_job_advance` accepted same-stage error recording (`storage` -> `storage`) and incremented attempts/recorded error; regression raised `22023 stage regression`. Rollback issued; 147/148 not live and not committed.
6. Draft migration 149 exists only at `.tmp-mig147/149_v2_housekeeping_enqueue.sql`. It was temporarily applied inside a transaction and rolled back. Signature observed: `enrichment_enqueue_stale(p_youtube_days integer DEFAULT 20, p_tmdb_days integer DEFAULT 150, p_limit integer DEFAULT 200) RETURNS integer`, security definer true. It is not committed/applied.

## Validation evidence already captured
- PR #62 (`cc48981`) raw local validation: `tsc=0`, `eslint=0`, `vitest=0` (27 files/271 tests), `check_invariants=0`, `verify_v2_security=0`, `check_languages=127`, `build=0`, `protected_paths=0`.
- PR #71 (`1bec8e5`) raw local validation: `tsc=0`, `eslint=0`, `vitest=0` (27 files/271 tests), `check_invariants=0`, `verify_v2_security=0`, `check_languages=127`, `build=0`, `protected_paths=0`.
- PR #73 validation currently being rerun after `9edef7a`; captured so far in `.tmp-mig147/validation-logs/pr73/`:
  - `tsc=0`
  - `eslint=1` (13 errors in existing deletion UI/page files, listed below)
  - `vitest=0` (30 files/281 tests passed)
  - `check_invariants=0`
  - `verify_v2_security=0` (98 passed, 0 failed; rollback issued)
  - `verify_delete_account=1`: harness aborts because live DB already has `public.delete_account(uuid,text)`, then attempting to apply migration 146 raises `function "delete_account" already exists with same argument types`; rollback issued and zero residue. Do not edit the script unless explicitly allowed; report as a harness/spec-environment mismatch.
  - `check_languages=127` in this shell/environment (do not mark green)
  - build/protected-paths still running or pending at the moment this handoff was written.

## Known unresolved validation findings
ESLint errors on PR #73/P0-22 baseline:
- `app/account-deleted/page.tsx`: raw `<a href="/">` should be `Link` under Next lint rule.
- `app/delete-account/_components/DeleteRequestForm.tsx`: `react/jsx-no-literals` errors for attribute literals (`type="email"`, `type="text"`, `name="website"`, `autoComplete="off"`, `aria-hidden="true"`, `type="submit"`, `role="alert"`).
- `app/delete-account/page.tsx`: `react/jsx-no-literals` for `href="/login?next=/settings/delete"`.
- `app/settings/delete/_components/DeletePanel.tsx`: `react/jsx-no-literals` for attribute literals (`type="checkbox"`, `type="button"`, `type="submit"`, `role="alert"`).
Warnings do not fail the requirement of zero errors: TanStack virtual warning in `flow/components/AssetGrid.tsx`; unused destructured variable warning in `lib/account/reauth.test.ts`.

## Pending, in required order
1. Finish current PR #73 validation run; capture exact `build` and `protected_paths` exits/logs.
2. Fix the lint errors minimally (use `Link` for internal links and constants for non-user-visible JSX attribute strings), rerun tests/lint/build, commit explicit paths, push. This is required because the user requires `npx eslint .` zero errors.
3. Add/paste route auth-status evidence for `/api/cron/email`, `/api/cron/enrich`, `/api/account/reauth/start`, `/api/account/reauth/done`, `/api/account/delete`, `/api/delete-requests`, `/api/delete-requests/confirm` (cron: no/wrong bearer 401, unset secret 503; session routes no session 401).
4. End-to-end deletion proof with exactly one `zz-e2e-` auth user, recommendation, `thumbnails/<uid>/` storage object, connected-channel row if schema allows; before/after counts for every coverage table, storage zero, auth absent, job `done` and email NULL, idempotence, cleanup.
5. P0-22 housekeeping implementation:
   - copy `.tmp-mig147/149_v2_housekeeping_enqueue.sql` to `supabase/migrations/149_v2_housekeeping_enqueue.sql` only for the draft PR; never apply/merge it;
   - create `app/api/cron/housekeeping/route.ts` with authorizeCron, global enqueue, `processJobs()`, `items_purge_unreferenced`, `housekeeping_purge`, stuck deletion-job resume;
   - update `lib/enrich/processJobs.ts`: first fill uses `item_apply_details`; stale re-enqueued item with existing `localized[job.param]` uses `item_refresh_apply` (migration 145 re-enqueues the same details job kind and has no refresh marker; localized-tag presence is the discriminator);
   - tests with mock client;
   - read `vercel.json` first, then add daily cron entries only; state Vercel plan unknown;
   - rollback proof: fast-forward zz-e2e item `fetched_at` 31 days; after one housekeeping run no YouTube display field older than 30 days and no TMDB display field older than 6 months remains; paste counts.
6. Create/update draft PR for housekeeping, never mark ready/merge; poll CI via REST because Vercel MCP tool listing failed and `GITHUB_CI_TOKEN` is absent. Credential-manager PAT via REST is accepted fallback.
7. Update `docs/00_PROGRESS.md` factually; final report must be one code block with answer first and raw evidence, ending exactly `Ref: LIKED / V2-W5-PIPELINE-1125-002`.

## Constraints / safety reminders
- Never print secret values. Names-only checks only. `RESEND_API_KEY` and `EMAIL_FROM` were absent in the checked environment; other required names were present.
- Do not commit 147/148 migration copies from `.tmp-mig147`.
- Do not edit migrations 001-148. Do not apply migration 149.
- `package*.json` frozen.
- Do not use `git add -A`/`git add .`, force-push, or `--no-verify`.
- Scope is restricted by the original prompt; inspect `git diff --name-only` before every commit.
