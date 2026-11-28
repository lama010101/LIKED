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
| WP-C | Pipeline stack evidence PRs (#62->#71->#73->#74) | PENDING — recon done | - | - | #62 37da871 / #71 3bcb50f / #73 5d0cabd / #74 7b135fe | heads moved vs spec; see recon below |
| WP-D | Threat-model tests T1-T17 (P0-23) | PENDING | - | - | - | after WP-A (needs guest routes on main) |
| WP-E | Local smoke suite smoke:v2 | PENDING | - | - | - | independent |
| WP-F | Closeout PROGRESS rows + ledger merge | PENDING | - | - | - | last |

## Threat-model test map (T-number -> test / NOT AUTOMATABLE) — filled by WP-D

| T# | Test name | Status |
|----|-----------|--------|
| T1-T17 | pending | - |

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
