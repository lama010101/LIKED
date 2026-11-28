# V2-W6 Marathon Work Package Specification

Saved verbatim from V2-W6-MARATHON-1127-003.

## GLOBAL RULES

- Commits: explicit paths only (`git add <path> ...`), NEVER `git add -A` / `git add .`. Conventional commits. No force-push, no --no-verify. Push right after the first clean local commit. Update branches with `git merge origin/main` (not rebase). PROGRESS.md conflicts are additive; add NEW rows citing hashes, never edit old rows.
- No full-file rewrites (str_replace/sed only; if impossible, STOP). Per WP, `git diff --name-only <base>...HEAD` must list only files the WP names or that already belong to the integrated branch; any extra file = revert it.
- Validation per WP: `npx tsc --noEmit` (0 errors), `npx eslint .` (0 errors), `npx vitest run`, `next build` when routes/config/deps changed, `node scripts/check-protected-paths.mjs` (paste). Ignore the check_languages exit=127 Windows teardown noise only when "5 passed" is printed.
- Merge mechanics: pin the PR head SHA, poll REST until mergeable_state=clean, merge via REST with merge_method=merge. GITHUB_CI_TOKEN is absent: the credential-manager PAT is the accepted fallback (cite the absence check). Verify every merge with `git merge-base --is-ancestor <sha> origin/main` after a full fetch.
- CLASS A (merge yourself when CI is green, tsc/lint/vitest clean, scope matches, NO protected path from scripts/protected-paths.txt, no migration). CLASS B (any protected path or migration): green PR, then STOP merging and list it in the REVIEW QUEUE. The ONLY Class B merge authorized now is WP3 under its condition.
- If a WP fails, mark it BLOCKED in the ledger, skip only its dependents, continue with independent WPs.
- STOP TRIGGERS: a pre-authorization condition fails; a migration is needed beyond WP3; a protected path outside a WP's scope would change; foreign changes or another session detected; the merge method fails; the spec contradicts the repo in a way that changes the design.
- PROD test data: print per-table counts BEFORE creating fixtures and AFTER cleanup; they must be equal. Fixture ids only, no PII.

## WORK PACKAGES

WP3 | MIGRATION 149 (CTO-PRE-AUTHORIZED Class B merge, pinned)
Migration-only PR from new branch devin/V2-W6-MIG149-1127-001 off main. Take supabase/migrations/149_v2_housekeeping_enqueue.sql from origin/devin/V2-W5-PIPELINE-1125-002 (0a078ce). Condition: `git hash-object` of the file MUST equal c8009b57239d4e6f31d64783d0981d6191a12326, else STOP (the CTO audited that exact blob). Allowed extras: only the catalog-count constants it forces in scripts/v2-catalog-probes.test.ts and a new scripts/verify-housekeeping-149.mjs; if more is needed, STOP.
Proof before merge, in a rollback-wrapped script as service_role: enrichment_enqueue_stale enqueues for a fixture item; respects p_limit; a second call enqueues 0; anon and authenticated calls are rejected; zero residue. Add rollback SQL (DROP FUNCTION IF EXISTS public.enrichment_enqueue_stale(integer, integer, integer);) to the PR body. Merge when CI is green. Then read-only postmerge proof (pasted): the function exists, prosecdef=true, search_path=public, ACL service_role only; rerun scripts/verify-v2-security.mjs and scripts/check-invariants-001.mjs against PROD. If a postmerge check fails: STOP, do NOT run rollback SQL on PROD, report.

WP6 | CLASS A PRODUCT ITEMS (merge to main yourself; no protected paths; no migration)
 6a) Owner detail sheet: wire get_inbox_item (migration 148, LIVE; it returns NO offers and NO region_missing) through a class-O wrapper in app/lib/actions/v2-owner.ts into the existing detail sheet under components/v2/inbox/**: one row per recommending friend (initial avatar, name, score %, platform text, comment, date). Keep the Friends and TMDB rings separate. Read the real return shape from the live function first. All text via i18n keys in en/fr/es/th; no hard-coded colors or strings. Add vitest plus an e2e spec (audited before/after cleanup).
 6b) Privacy policy and Terms (app/privacy, app/terms): cover guests/contributors, TMDB, YouTube with a link to Google's privacy policy and the way to revoke access, retention (guest contributors inactive 18 months are purged; YouTube display data <= 30 days), deletion paths (in-app, public /delete-account, email request processed within 30 days), backups per provider retention, security logs <= 30 days. Do NOT mention JustWatch (Stream/Rent/Buy is dropped, no availability data is displayed). Use the existing i18n mechanism of those pages. No visible "draft" banner; state in the report that legal review is still needed.
 6c) TMDB logo: fetch the official logo from TMDB's logos-attribution page, add it under public/brand/, and show it on app/settings/credits next to the existing attribution sentence. If the download is blocked or the licence is unclear: STOP this item only.

WP4 | GUEST STACK -> EVIDENCE-READY PR (Class B, DO NOT MERGE)
Branch devin/V2-W3-GUEST-FIX-1125-001-d (f95d4f0). Find the existing draft PR objects via REST (do not close them); use one PR for the tip, base main. `git merge origin/main`, resolve additively, push, get CI green (CI now runs for all PR bases).
Then run the live proofs that were skipped for lack of env, each PASS/FAIL/NOT DONE with the decisive raw lines: live TMDB probe and scripts/tmdb-th-check.mjs (Thai provider coverage on >= 20 titles); YouTube search through the server key; YouTube CACHE-HIT proof (same query twice = 1 provider call; migration 147 is live now); budget exhaustion returns the busy shape while TMDB search still works; genre sync; PoW solve time; guest flow e2e on the dev server asserting NO `sb-*` cookie; two-guest receipt isolation; guest "Delete my data"; axe and 360px in en/fr/es/th; spoofed x-forwarded-for test against the Vercel PREVIEW URL of the PR; flood and race tests. Make sure next.config.ts has CSP img-src and remotePatterns for image.tmdb.org. Audited test-data cleanup as in GLOBAL RULES. STOP at a green PR with the evidence pack.

WP5 | PIPELINE STACK -> EVIDENCE-READY PRs (Class B, DO NOT MERGE)
Order #62 (cc48981) -> #71 (1bec8e5) -> #73 (9edef7a) -> #74 (0a078ce). For each: `git merge origin/main` (plus the parent branch where stacked), push so CI runs, paste the run result. Required fixes, each with a test that FAILS before and PASSES after:
 a) #73 is red on 13 eslint errors fixed only on #74 (bee8c7c): cherry-pick bee8c7c into #73.
 b) scripts/verify-delete-account.mjs re-applies migration 146 (already live): skip the apply when public.delete_account exists.
 c) DELETION RULING: when deletion_job_advance fails before stage `done`, the pipeline and route MUST return ok:false with a non-2xx status and leave the job resumable (stage not advanced). Never ok:true. Add a test that injects the advance failure.
 d) REAUTH RULING: /api/account/reauth/start must force a Google round trip (prompt=login and/or max_age=0). Report whether it does today (paste the code line). If not, implement it, keep `done` requiring last_sign_in_at > state.iat - 5s, and add a test.
 e) Ledger proof (147 is live): deletion jobs advance forward-only, equal-stage allowed, 'done' nulls the email, on a fixture user with audited cleanup.
 f) Housekeeping route and email drain (149 live after WP3): run against PROD with fixtures; CRON_SECRET via env only; unauthenticated request = 401/503; authenticated run enqueues and drains; zero residue. RESEND_API_KEY/EMAIL_FROM are absent: stub the provider at the HTTP boundary or use dry mode, never send to a real address, and mark the REAL send NOT DONE (waiting for Lolo to set two env names).
 g) Report whether each vercel.json schedule is once per day and what that implies for the owner e-mail drain. Do not change schedules.
STOP at green PRs with an evidence pack for each.

WP7 | CLOSEOUT
Add NEW PROGRESS rows (citing hashes) for every WP through one docs-only Class A PR; merge the ledger branch with it.
Final reply = ONE code block: (1) answer first, max 15 lines: per-WP status, what is live on PROD now, what waits for the CTO. (2) REVIEW QUEUE table: PR number, head SHA, protected files touched, proofs PASS/FAIL/NOT DONE, recommended merge order. (3) Decisive raw evidence verbatim. (4) `git log origin/<branch>..HEAD` empty for every branch you pushed. Never claim pushed/merged/done without ancestry or REST proof.
