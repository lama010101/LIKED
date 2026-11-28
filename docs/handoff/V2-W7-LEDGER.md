# V2-W7-MARATHON-1128-001 — WORK LEDGER

Dispatch: PROJECT LIKED | V2-W7-MARATHON-1128-001
Spec (verbatim): docs/handoff/V2-W7-WP-SPEC.md on branch devin/V2-W7-LEDGER-1128-001
Started: 2026-11-28 ~08:33 +0700 (unattended, Lolo away)

## Pre-checks

- `git status --porcelain` (D:\LIKED shared checkout, leftovers NOT touched):
  ```
   M next.config.ts
  ?? app/api/ask/
  ?? lib/tmdb/
  ?? lib/youtube/budget.test.ts
  ?? lib/youtube/budget.ts
  ?? lib/youtube/serverKey.test.ts
  ?? lib/youtube/serverKey.ts
  ?? scripts/tmdb-th-check.mjs
  ```
- Worktrees: many stale worktrees exist; new work for this dispatch uses D:\LIKED-WORKTREES\w7-* fresh from `git fetch origin`.
- Another-session check: newest origin branch = devin/V2-W6-LEDGER-1127-001 @ 2026-11-27 13:36:54 +0700 (~19h before start, outside 3h window). NO foreign activity.
- Ancestry: `git merge-base --is-ancestor a3eb164 origin/main` -> OK (Class A items a3eb164 verified; WP1/migrations verified per dispatch, not re-run).
- Secrets: RESEND_API_KEY and EMAIL_FROM ABSENT (Lolo must set). GITHUB_CI_TOKEN absent -> credential-manager PAT fallback. Never print secrets/PII.

## Work packages

| WP | Title | Status | Branch | Head SHA | PR | Next step |
|----|-------|--------|--------|----------|----|-----------|
| WP-A | Fix+merge PR #72 (guest stack) | ✅ MERGED | devin/V2-W3-GUEST-FIX-1125-001-d | 43c11ea | #72 merged f38cbba | DONE — post-merge proofs PASS |
| WP-B | P0 acceptance matrix (docs) | ✅ MERGED | devin/V2-W7-P0-MATRIX-1128-001 | 70695fc | #80 merged b63510f | DONE — ancestry verified |
| WP-C | Pipeline stack evidence PRs (#62->#71->#73->#74) | ✅ evidence-ready, CI re-running on final heads | detached wp5-pr* worktrees | #62 15024ef / #71 1699ae1 / #73 38aff24 / #74 ff483a7 | #62/#71/#73/#74 draft Class B | fixes a-h verified; await CI on 38aff24+ff483a7 |
| WP-D | Threat-model tests T1-T17 (P0-23) | ✅ PR #82 (CI running) | devin/V2-W7-THREAT-1128-001 | cd7f404 | #82 | Class A: merge when CI green |
| WP-E | Local smoke suite smoke:v2 | PENDING | - | - | - | independent |
| WP-F | Closeout PROGRESS rows + ledger merge | PENDING | - | - | - | last |

## Threat-model test map (T-number -> test / NOT AUTOMATABLE) — filled by WP-D

| T# | Test name | Status |
|----|-----------|--------|
| T1 | threatModel.test.ts › T1 dead tokens return byte-identical 404 bodies; T1 the 21st miss in the hour is 429 | ✅ PR #82 |
| T2 | T2 tampered-signature cookie → 401 zero DB; T2 signature-valid wrong-secret → only guest_verify then 401; T2 guest A cookie queries only contributor A | ✅ PR #82 |
| T3 | T3 foreign owner_id in body ignored; ask token selects owner | ✅ PR #82 |
| T4 | T4 21 items→400; T4 rating 101/-1/1.5→400 INVALID_RATING; T4 281-char comment→400 FIELD_TOO_LONG; T4 body >64KB→413 | ✅ PR #82 |
| T5 | T5 101st title→429 DAILY_CAP; T5 11th submit/hour→429 ask_submit_c | ✅ PR #82 |
| T6 | T6 failed PoW→403 CAPTCHA_FAILED; T6 honeypot→403; T6 11th mint/h/IP→429 ask_session_ip; T6 PoW solution replays only once | ✅ PR #82 |
| T7 | T7 same client_batch_id replays → replayed:true, single RPC shape | ✅ PR #82 |
| T8 | T8 fabricated item_id→400 INVALID_ITEM; route never mints ids | ✅ PR #82 |
| T9 | — | NOT AUTOMATABLE: claim route not on main (needs Supabase session + intent cookie; e2e-level) |
| T10 | T10 cross-site Origin→403 zero DB; T10 missing Origin→403; T10 non-JSON Content-Type→400 | ✅ PR #82 |
| T11 | — | NOT AUTOMATABLE in vitest: needs live DB/RLS probe; covered by scripts/verify-rls-*.mjs + P0-06 CI probe |
| T12 | T12 search without guest cookie→401 zero DB | ✅ PR #82 |
| T13 | T13 blocked contributor→403 CONTRIBUTOR_BLOCKED; T13 markup name stored opaque (React escapes) | ✅ PR #82 |
| T14 | — | NOT AUTOMATABLE: public deletion form route not on main (arrives with unmerged PR #73) |
| T15 | T15 evil next values → safeNext fallback | ✅ PR #82 (unit-level; vectors already in safeNext.test.ts) |
| T16 | — | NOT AUTOMATABLE beyond limits: one-email-per-submission is SQL/trigger-side; ask_submit_* buckets covered by T5 |
| T17 | — | NOT AUTOMATABLE at route layer: schema/static check (no inet/raw-IP column); hashed-IP keys covered by lib/ask/clientIp.test.ts + peppered rl_hit design |

## Evidence log

(entries appended per WP with decisive lines only)

### WP-A1 — submit 23505 retry (DONE, commit 2f2093a)
- `app/api/ask/submit/route.ts`: RPC wrapped in retry-once on `error?.code === "23505"` (idempotency SELECT/INSERT race, migration 144 unchanged).
- `app/api/ask/_lib/writeRoutes.test.ts`: +2 tests (23505→retry→replayed; double-23505→503). FAIL-before: 2 failed/14 passed. PASS-after: 16/16.
- Live bug found+fixed same commit: first version referenced undefined `rpc` → 500 on POST /api/ask/submit; restructured to `svc.rpc(...)` binding.

### WP-A2 — axe color-contrast (DONE, commits e157825 + 43c11ea)
- Probe `wp7-axe-probe.mjs` BEFORE: 120 serious/critical nodes. Root causes (decisive NODE lines):
  - `fg=#1a1a2e/#6b6b80 bg=#0a0a12` (85): v2 tokens light under system+light OS while globals.css page bg stayed dark — v2 routes have no ThemeSync.
  - `fg=#f0f0f5 bg=#f2f2f6/#ffffff` (27): globals.css:2223 `input,select,textarea{color:var(--text-1)}` pins dark text on light v2 surfaces.
  - `fg=#ff3b30 bg=#f2f2f6 ratio=3.17` (8): --v2-danger (also warn/success) had no light-theme value (script gap: pairs unchecked).
- Fixes: V2Shell `min-h-dvh bg-[var(--v2-bg)] text-[var(--v2-text)]`; v2-tokens.css scoped input color + light overrides success #166534 / warn #92400E / danger #B42318; check-contrast.mjs +12 pairs (121 checks).
- FAIL-before: check-contrast on old tokens = 6 FAIL (danger 3.18, warn 1.97, success 1.99 on light). PASS-after: 121/121.
- i18n bug fixed (43c11ea): FriendFlow used `t("error.*")` under `friend` ns — keys absent in all 4 catalogs → MISSING_MESSAGE crash on submit error. Repointed to existing `ask.error.*` via second useTranslations hook.
- Probe script: runAxe retry x4 for the CSP/eval injection flake.
- AFTER probe: `WP7_AXE_RESULT=PASS failures=none`, 80/80 screen checks `serious_critical_violations=0`, `fixture_cleanup_zero_residue=PASS equal=true`, 0 INJECTION_FAILED.
- Validation: tsc 0 err; eslint changed-files 0 err; vitest 321/321; next build OK (40 routes); check-protected-paths=0; check-contrast 121/121.

### WP-A3 — merge prep (DONE)
- origin/main stayed a3eb164 (already merged at 403da04). Pushed 43c11ea; CI on head: build=success, e2e=success, Vercel=success, Supabase=skipped. mergeable_state=clean. Marked ready via GraphQL markPullRequestReadyForReview (isDraft false).

### WP-A4 — live suite + merge + PROD proofs (DONE)
- Live guest suite `wp4-live-proof.mjs` vs :3001 (branch code + PROD DB): `WP4_LIVE_RESULT=PASS failures=none` — incl `submit_replay_race_atomic=PASS statuses=200,200 replayed=false,true` (A1 live), `browser_axe_{en,fr,es,th}=PASS violations=0` (A2 live), `fixture_cleanup_zero_residue=PASS equal=true`.
- First run FAILed on leftovers only (genre_sync before=35, residue) — purged 2 ZZ Probe contributors + 17 rate_limits rows; re-run all PASS.
- Merge: REST PUT /pulls/72/merge merge_method=merge sha=43c11ea… → merge commit `f38cbba3b963b5ada90e0caec8c73fbf6a3a7646`; `git merge-base --is-ancestor` OK for 43c11ea and f38cbba on origin/main.
- POST-MERGE PROD proofs `wp7-postmerge.mjs` vs https://liked-zeta.vercel.app: `WP7_PM_RESULT=PASS failures=none`:
  - (i) `prod_landing_200_no_sb_cookie=PASS status=200 cookies=0 sb=0`
  - (ii) `prod_xff_spoof_bucket_429=PASS statuses=404×20,429×5 first429_at=21` — 25 reqs each with DIFFERENT x-forwarded-for; bucket still tripped at req 21 (Vercel edge IP used, spoof ineffective)
  - (iii) `prod_inbox_poster_renders=PASS tmdb_imgs=1 loaded=1 csp_errors=0` — real TMDB resolve→submit→owner /inbox shows image.tmdb.org poster; live CSP img-src includes image.tmdb.org
  - final_counts contributors=0 items=0 rate_limits=0

### WP-B — P0 acceptance matrix (PR #80, docs-only Class A)
- `docs/handoff/P0-ACCEPTANCE-MATRIX.md`: C1–C26 (§13 bullets) + P0-21..P0-25, evidence-cited statuses vs origin/main f38cbba. Headline: PASS=13, UNPROVEN=7, NOT DONE=6 (C7 email, C11 enrichment, C13 threat suite, C15 housekeeping, C22/C24 deletion, P0-22/23/24). Ranked MVP blockers listed in doc.

### WP-C — recon (no changes yet)
- Stack heads (REST): #62 `devin/V2-W4-PIPELINE-1124-001`@37da871 base=main draft; #71 `devin/V2-W5-EMAIL-1125-001`@3bcb50f base=#62 draft; #73 `devin/V2-W5-DELETE-1125-001`@5d0cabd base=#71 draft; #74 `devin/V2-W5-PIPELINE-1125-002`@7b135fe base=#73 draft. Spec SHAs stale (9edef7a, 0a078ce) — branches advanced.
- File map: #62=enrich worker+cron/enrich+protected-paths; #71=email drain+cron/email; #73=deletion (account/delete, reauth start/done, delete-requests, delete-account page, deletionPipeline, verify-delete-account, verify-deletion-ledger-147); #74=housekeeping cron+reauth tests+processJobs tweaks+vercel.json.
- Fix routing: a) cherry-pick bee8c7c→#73; b) verify-delete-account.mjs→#73; c) deletion_job_advance ruling→#73 (deletionPipeline+route+test); d) reauth start→#73 (+#74 test file exists); e) ledger proof→#73 verify script vs PROD; f) cron/housekeeping #74 + cron/email #71 vs PROD dry-run; g) vercel.json #74 report only; h) Library deletion proof→#73 deletionPipeline vs PROD fixture.

### WP-C — V2-W6 provenance + V2-W7 integration (2026-11-28)
- **V2-W6-MARATHON-1127-001 WP5 already executed fixes a–g** (its ledger on main@15c1664): stack integrated+pushed at heads 37da871/3bcb50f/5d0cabd/7b135fe, all draft Class B, CI green, protected paths 11/21/31/37. Fixes verified in-tree: a) 0ae94ac==bee8c7c content (4 files, zero diff); b) verify-delete-account.mjs:173 skips 146-apply when delete_account exists; c) deletionPipeline.ts:86 throws on advance error + route maps ok:false→500 + tests; d) reauth/start/route.ts:44-45 `prompt=select_account consent`+`max_age=0`, done requires last_sign_in_at>iat; e) verify-deletion-ledger-147.mjs PROD 7/7; f) verify-housekeeping-email-live.mjs PROD 13/13 (REAL send NOT DONE, RESEND_API_KEY/EMAIL_FROM absent); g) vercel.json: enrich+email+housekeeping once daily, youtube sync 2×/day.
- V2-W7 WP-C remaining work = integrate current origin/main (f38cbba guest + b63510f matrix + 15c1664 docs) through the stack + fix h live proof.
- Merges: #62 15024ef (clean); #71 1699ae1 (clean); #73 2bef0a8+50d9145 (messages/{en,es,fr,th}.json conflicts resolved union-merge: deletion+friend+ask namespaces, all JSON valid); #74 0078452+57e62f4 (same 4-file resolution) + ff483a7 (absorbed #73 script commit).
- Local validation on merged heads: #62 tsc0/eslint0err1warn/vitest366; #71 tsc0/eslint0err1warn/vitest378; #73 tsc0/eslint0err2warn/vitest396; #74 tsc0/eslint0err2warn/vitest409. check-protected-paths: #62=13, #73=32, #74=37 protected paths (Class B confirmed).
- CI on merged heads: #62@15024ef build✓e2e✓Vercel✓; #71@1699ae1 ✓✓✓; #73@50d9145 ✓✓✓; #74@57e62f4 ✓✓✓. New heads #73@38aff24 + #74@ff483a7 CI pending.
- **Fix h LIVE proof** `scripts/verify-delete-pipeline-live.mjs` (committed on #73@38aff24, run vs PROD): `WP7_DELETE_RESULT=PASS pass=24 fail=0` — fixture users+node+folder+edge+grant+rating+guest contribution+thumbnails PNG; delete_account deleted:true; storage purge emptied prefix; auth delete tolerated; ledger done/email NULL; 12 residue checks 0; run2 already:true+purge empty+ledger refuses done→auth ("stage regression"); zero fixture residue, per-table counts equal. NOTE: PROD has a concurrent writer (owner 353c0d1a…, ~1 node/8s) — first run showed +4 external deltas in nodes/edges/causes/folder_edges, all non-fixture; second run zero drift.
- Orphan cleanup: run-1 fixture (items check-constraint abort) purged manually — users 7903c135 + dependents deleted.

### WP-D — threat-model suite (PR #82, Class A)
- Branch `devin/V2-W7-THREAT-1128-001`, worktree `w7-threat`, head `cd7f404`. New `app/api/ask/_lib/threatModel.test.ts` (25 tests, T1–T17 rows from PLAN-V2-002 threat table; T15 covered by existing safeNext.test.ts). tsc 0, eslint 0 err, vitest 346/346, protected paths 0. T-number→test map recorded above in ledger. Awaiting CI → merge via REST.

### WP-E — local smoke suite (PR #83, Class A)
- Branch `devin/V2-W7-SMOKE-1128-001`, worktree `w7-smoke`, head `04b13c3`, base main@15c1664.
- `e2e/helpers/prodAudit.ts` (21 fixture-owned tables, counts only, assertEqual throws on residue; rate_limits excluded as ephemeral); all 5 `e2e/v2-*.spec.ts` retrofitted; new `e2e/v2-smoke.spec.ts` (5 tests: guest submit via real PoW/cookie/submit routes, two-friend merge → one inbox card count 2, rail badge sum ≤ All, settings sign-out → /login + no sb- cookies, guest delete-my-data → contributor gone); `playwright.v2.config.ts` (v2 specs were absent from playwright.config testMatch — dedicated config keeps them out of CI); `npm run smoke:v2`; `docs/handoff/SMOKE-V2.md`.
- Validation: tsc 0, eslint clean on touched files, vitest 321/321, protected paths 0.
- Live run vs local dev :3001 (W3-FIX code + PROD DB): `5 passed (1.0m)`, `PROD AUDIT residue check: PASS (all table counts equal)`. Fix during bring-up: client_batch_id must be UUID (route 400 BAD_REQUEST otherwise).
- Awaiting CI → merge via REST.

### WP-D merge (DONE)
- PR #82 merged via REST merge_method=merge sha=cd7f404… → merge commit `c191ee4349efe95d8b88d40e795e20882ddccbf0`. CI on head: build/e2e/Vercel success, Supabase skipped. `git merge-base --is-ancestor` OK for cd7f404 and c191ee4 on origin/main. origin/main = c191ee4.

### WP-C final state (DONE — Class B hold)
- All four stack heads merged with origin/main and pushed; CI green on every head: #62@15024ef, #71@1699ae1, #73@38aff24, #74@ff483a7 (build+e2e+Vercel success, Supabase skipped). All mergeable_state=clean, all draft → REVIEW QUEUE, no merge per Class B.
- Fix h LIVE proof PASS (see WP-C section above): verify-delete-pipeline-live.mjs 24/24 vs PROD.
