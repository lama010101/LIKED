# V2-W6-MARATHON-1127-001 Ledger

Dispatch: unattended day batch for migrations 147/148/149, guest/pipeline evidence PRs, and Class A items.
Started: 2026-11-27T09:29+07:00

## STEP ZERO

- Shared checkout `D:\LIKED` is read-only for this dispatch.
- Initial shared checkout status contained pre-existing files not owned by this dispatch; they will not be touched.
- `git worktree list` showed pre-existing worktrees; no origin branch was updated in the last 3 hours at the initial check.
- `origin/main` = `d235272f8f6a749e7bf315c4e1d5a2ee3d55349e`.
- Verified absent on main: `app/r/[token]/`, `app/api/ask/`, enrichment worker, email drain, deletion pipeline, migrations 147/148/149.
- Verified stack commits and ancestry listed in dispatch.
- Verified migration blob pins for 147/148/149.
- Process-environment booleans: all dispatch-listed secret names absent; `GITHUB_CI_TOKEN` absent. Credential-manager PAT fallback is therefore expected for GitHub operations.

## Work packages

| WP | Status | Branch | Head SHA | PR | Next step |
|---|---|---|---|---|---|
| Ledger | ACTIVE | devin/V2-W6-LEDGER-1127-001 | ee85ae392e50bbc6b4d3b11078281f14d4520650 | pending | update after every WP |
| WP1 CI unblock | MERGED | devin/V2-W5-CISTACK-1126-001 | 41683df040390c286370d5bcd6060843b9a76e36 | PR75 | merged as 9a18b9ebec848efda34eb07f8b76feb4d5600a6e; non-main-base CI proof pending WP5 push |
| WP2 migrations 147+148 | DONE | devin/V2-W6-MIG147-1127-001 | 1f96edff2ecda108d3c7e6718692d57c015f95b0 | PR76 | merged as 3fb0527ebf8ff863e9325430e4b48609125d2f76; postmerge production proofs all pass; next WP3 |
| WP3 migration 149 | DONE | devin/V2-W6-MIG149-1127-001 | bec2acca62691d014186339de63d571f3c2fa9d4 | PR77 | merged as 4d01614b1087bd5d81e6f145adc918b23dca5833; postmerge proofs pass; next WP6 |
| WP4 guest stack | EVIDENCE_READY_WITH_FAILURES | devin/V2-W3-GUEST-FIX-1125-001-d | 403da0411db18ce3ccbea534aed10b8e119bc4a9 | PR72 | green CI; do not merge; race/axe failures documented; next WP5 |
| WP5 pipeline stack | EVIDENCE_READY | devin/V2-W4-PIPELINE-1124-001 + devin/V2-W5-EMAIL-1125-001 + devin/V2-W5-DELETE-1125-001 + devin/V2-W5-PIPELINE-1125-002 | 37da871 / 3bcb50f / 5d0cabd / 7b135fe | #62/#71/#73/#74 | all green draft Class B PRs; do not merge; next WP7 |
| WP6 class A items | DONE | devin/V2-W6-CLASSA-1127-001 | b0bb0ad885261de7174ebb4f46d25910cffb4e48 | PR78 | merged as a3eb164b206eb7331bf7cfe18fdde2b00cd0e9f3; next WP4 |
| WP7 closeout | PENDING | devin/V2-W6-LEDGER-1127-001 | pending | pending | final |

## WP2 checkpoint 2026-11-27

- PR76 pinned head `1f96edff2ecda108d3c7e6718692d57c015f95b0`; REST `state=open`, `merged=false`, `mergeable=true`, `mergeable_state=clean`.
- CI run `45931499228` completed success; E2E run `45931499182` completed success.
- `check-invariants-001.mjs` premerge exit 1 with exactly expected failures: DB-7 unrecorded 147,148; DB-21 missing 12 class-S functions plus `get_inbox_item`; total `69 passed, 2 failed`.
- Harness final result remains `192 passed, 0 failed`, rollback issued, zero residue, no `@` or UUID-like output.
- `verify-v2-security.mjs` premerge was still running when the context checkpoint was reached; log path `D:LIKED-WORKTREESwp2-security-premerge.log`.
- Resume next action: finish/read premerge security output, verify all WP2 preauthorization conditions, merge PR76 only if conditions pass, then run post-merge proofs and begin WP3.

## WP2 merge checkpoint 2026-11-27T03:20Z

- Resume STEP ZERO repeated: remote ledger head `8373545c866a1036123711766b117ee10b6a03c0`; main `9a18b9ebec848efda34eb07f8b76feb4d5600a6e`; PR76 independently verified open/clean at pinned head before merge.
- C1 migration diff contained only F1/F5 in 147 and F2 in 148; changed migration files exactly `147_v2_support_rpcs.sql` and `148_v2_inbox_item_detail.sql`.
- C2 static check passed: 13 CREATE FUNCTION entries, all SECURITY DEFINER with search_path=public; no new function/table/policy/DROP versus `0f8c0a6`.
- C5 rollback SQL added to PR76 body; PATCH status 200, body length 1124.
- Local validation: tsc exit 0, eslint exit 0 with 0 errors/1 warning, vitest 226/226 passed exit 0, next build exit 0, protected-path checker exit 0 with 3 protected files.
- PR76 merged through REST with pinned SHA; merge commit `3fb0527ebf8ff863e9325430e4b48609125d2f76`; merge ancestry and head ancestry both pass.
- Direct production catalog postmerge proof passed 9/9: 13 functions exist, definer/search_path correct, class-S ACL service_role only, get_inbox_item authenticated+service executable, zero v2 policies/grants, migrations 147/148 recorded.
- Postmerge invariant/security scripts were rerun after the Supabase integration lag; final rows still pending at this checkpoint.

## WP2 completion 2026-11-27T03:30Z

- Postmerge `verify-v2-security.mjs`: `124 passed, 0 failed`, rollback issued, exit 0.
- Postmerge `check-invariants-001.mjs`: `71 passed, 0 failed`, exit 0; DB-7 and DB-21 now pass.
- WP2 is DONE. Next WP: WP3 migration 149.

## WP3 merge checkpoint 2026-11-27

- Pinned hash verified: c8009b57239d4e6f31d64783d0981d6191a12326.
- PR77 merged as 4d01614b1087bd5d81e6f145adc918b23dca5833; head ancestry pass.
- Harness 7/7 pass, zero residue; local validation and CI green; direct postmerge ACL proof pass.

## WP3 completion 2026-11-27

- Postmerge direct proof: PASS definer/search_path/ACL service_role only.
- Postmerge verify-v2-security: 124 passed, 0 failed, rollback issued, exit 0.
- Postmerge check-invariants: 71 passed, 0 failed, exit 0.
- WP3 DONE. Next WP6.

## WP6 PR checkpoint 2026-11-27T05:52Z

- Branch `devin/V2-W6-CLASSA-1127-001` pushed; `git log origin/devin/V2-W6-CLASSA-1127-001..HEAD` empty after push.
- PR78 opened non-draft at pinned head `b0bb0ad885261de7174ebb4f46d25910cffb4e48`, base main `4d01614b1087bd5d81e6f145adc918b23dca5833`.
- Local validation before PR: tsc exit 0; eslint exit 0 with 0 errors/1 pre-existing warning; vitest 21 files/228 tests passed; next build exit 0; protected-path checker reported 0 protected paths.
- Owner inbox e2e passed 9/9. Fixture row counts before and after were equal for contributors, submissions, recommendations, recommendation_notifications, asks, and items.
- Privacy/Terms report: legal review is still needed.
- Next action: wait for PR78 CI; merge only if green and scope remains Class A.

## WP6 completion 2026-11-27T05:57Z

- PR78 CI green: build success, e2e success, Vercel Preview Comments success, Supabase Preview skipped.
- PR78 merged through REST at pinned head `b0bb0ad885261de7174ebb4f46d25910cffb4e48`; merge commit `a3eb164b206eb7331bf7cfe18fdde2b00cd0e9f3`.
- Ancestry proof: both the pinned head and merge commit are ancestors of `origin/main`; branch push log was empty before merge.
- Protected-path checker: 0 protected paths touched. Scope matched WP6 owner detail, privacy/terms, and TMDB credits/logo files only.
- Legal review is still needed for Privacy/Terms.
- WP6 DONE. Next WP4 guest stack.

## WP4 evidence checkpoint 2026-11-27T13:45Z

- Branch integrated with current main and pushed: head `403da0411db18ce3ccbea534aed10b8e119bc4a9`; `git log origin/devin/V2-W3-GUEST-FIX-1125-001-d..HEAD` empty.
- PR72 REST: state=open, draft=true, mergeable=true, mergeable_state=clean, head `403da0411db18ce3ccbea534aed10b8e119bc4a9`, base `a3eb164b206eb7331bf7cfe18fdde2b00cd0e9f3`, merged=false.
- PR72 checks: build success; e2e success; Vercel Preview Comments success; Supabase Preview skipped.
- Local validation: tsc exit 0; eslint exit 0 with 0 errors and 1 TanStack Virtual warning; vitest 32 files/318 tests passed; next build exit 0; protected-path checker reported 0.
- next.config proof: CSP img-src includes image.tmdb.org and remotePatterns includes hostname image.tmdb.org.
- Live PASS lines: landing 200/no sb cookie; genre sync before=0 after=35; PoW sessions status 200 (2216 ms, 58 ms); TMDB search status 200 count=18; YouTube concurrent identical search all 200/ok with exactly one contributor budget unit; cache hit added zero budget with one cache row; exhausted budget produced busy while TMDB remained 200; flood produced 429 after cached searches; two-guest receipts isolated; delete-my-data removed both guests.
- Live FAIL lines: concurrent same-batch submit produced statuses 503,200 instead of a replayed pair; axe color-contrast serious violation (7 nodes) in en/fr/es/th.
- 360px PASS lines: en/fr/es/th scrollWidth=360 innerWidth=360 and zero sb cookies.
- Preview spoofed-xff proof is NOT DONE/invalid: the protected preview was reachable through vercel curl, but a valid production ask token returned 404 there, so the preview cannot exercise the production guest ask backend. Twenty-four parallel dead-token requests with distinct spoofed x-forwarded-for values all returned 404 and are not evidence of rate-limit behavior.
- Final production residue counts after audited cleanup: contributors:0, submissions:0, recommendations:0, notifications:146, email_outbox:0, enrichment_jobs:0, items:0, tmdb_genres:0, youtube_search_cache:0, youtube_search_budget:0, rate_limits:0. These equal the pre-fixture baseline.
- WP4 remains Class B and unmerged. Next WP: WP5 pipeline stack.

## WP5 evidence checkpoint 2026-11-28T09:55Z

- Ordered stack integrated and pushed: PR62 head `37da87187696136bfd8560c8058d906dcf934834` base `main` `a3eb164`; PR71 head `3bcb50f8fe83b9d23685a2d6c0402c5483091fb2` base `devin/V2-W4-PIPELINE-1124-001` `37da871`; PR73 head `5d0cabdb7a1821d66f40d9bedbe5ee96bcbcfa7c` base `devin/V2-W5-EMAIL-1125-001` `3bcb50f`; PR74 head `7b135fe151099e49c3232a25eeab79b7100e99bb` base `devin/V2-W5-DELETE-1125-001` `5d0cabd`.
- REST state after pushes: all four PRs remain `state=open`, `draft=true`, `merged=false`; final mergeable_state is `clean` for each. Checks on each final head: build success, e2e success, Vercel Preview Comments success, Supabase Preview skipped.
- Local validation: PR62 tsc 0, eslint 0 errors/1 warning, vitest 273/273, webpack build exit 0 after the dependency-junction Turbopack limitation (CI `next build` also green); PR71 tsc 0, eslint 0 errors/1 warning, vitest 285/285, webpack build exit 0 on retry after the known next/font transient; PR73 tsc 0, eslint 0 errors/2 warnings, vitest 303/303, next build exit 0; PR74 tsc 0, eslint 0 errors/2 warnings, vitest 316/316, next build exit 0.
- Protected paths are intentionally Class B: PR62 11 paths, PR71 21 paths, PR73 31 paths, PR74 37 paths by `scripts/check-protected-paths.mjs`; all four remain unmerged for CTO review.
- Required fix a: `bee8c7c` cherry-picked into PR73; lint is green.
- Required fix b: `scripts/verify-delete-account.mjs` now skips migration-146 apply when `public.delete_account(uuid,text)` exists. Live run: `119 passed, 0 failed`, rollback issued, zero residue.
- Required fix c: `deletion_job_advance` errors now abort `runDeletionPipeline`; the API route still maps `ok:false` to HTTP 500. Fail-before test result was `expected true to be false`; pass-after result is `5 passed`. The standalone deletion-request drainer now propagates the same failure instead of marking the request done.
- Required ruling d: `/api/account/reauth/start` already forces a Google round trip: `app/api/account/reauth/start/route.ts` builds `&prompt=select_account consent` and `&max_age=0`; route tests assert both query params, and `done` still requires `last_sign_in_at` newer than state iat.
- Required proof e: `scripts/verify-deletion-ledger-147.mjs` on PROD passed `7/7`: storage→auth, equal-stage allowed, backward rejected, done completed/email NULL, done→email rejected, rollback cleanup equal.
- Required proof f: `scripts/verify-housekeeping-email-live.mjs` on PROD passed `13/13`: housekeeping missing/wrong bearer 401, authenticated 200 `{enqueued:2, claimed:2, done:2, unavailable:1}`, email route missing bearer 401 and authenticated dry `{reason:email_not_configured, claimed:0}`, rollback email_claim/email_finish success, audited table counts equal. REAL send remains NOT DONE because `RESEND_API_KEY` and `EMAIL_FROM` are absent.
- Required report g: `vercel.json` schedules are `/api/youtube/sync` twice daily (`0 6 * * *`, `0 18 * * *`), `/api/cron/enrich` once daily (`0 1 * * *`), `/api/cron/email` once daily (`30 1 * * *`), and `/api/cron/housekeeping` once daily (`0 2 * * *`). Owner email drain therefore runs once daily and can delay queued owner mail by up to ~24 hours; housekeeping does not replace the email drain.
- WP5 is EVIDENCE_READY, not merged. Next WP: WP7 closeout.
