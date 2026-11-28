# V2-W7-MARATHON-1128-001 — WORK PACKAGE SPEC (verbatim from dispatch prompt)

PROJECT: LIKED | V2-W7-MARATHON-1128-001 | Fix and merge guest PR #72, P0 acceptance matrix, pipeline evidence PRs, threat-model tests, local smoke suite

## GLOBAL RULES

- Commits: explicit paths only (`git add <path> ...`), NEVER `git add -A` / `git add .`. Conventional commits. No force-push, no --no-verify. Push right after the first clean local commit. Update branches with `git merge origin/main` (not rebase). PROGRESS.md conflicts are additive: add NEW rows citing hashes, never edit old rows.
- No full-file rewrites (str_replace/sed only; if impossible, STOP). Per WP, `git diff --name-only <base>...HEAD` must list only files the WP names or that already belong to the integrated branch; any extra file = revert it.
- Validation per WP: `npx tsc --noEmit` (0 errors), `npx eslint .` (0 errors), `npx vitest run`, `next build` when routes/config/deps changed, `node scripts/check-protected-paths.mjs` (paste). Every bug fix ships with a check that FAILS before and PASSES after (paste both).
- Merge mechanics: pin the PR head SHA, poll REST until mergeable_state=clean, merge via REST with merge_method=merge. A draft PR must first be marked ready (POST /repos/{owner}/{repo}/pulls/{n}/ccr/ready_for_review or the standard REST route). GITHUB_CI_TOKEN is absent: the credential-manager PAT is the accepted fallback (cite the absence check). Verify every merge with `git merge-base --is-ancestor <sha> origin/main` after a full fetch.
- CLASS A: merge yourself when CI is green, validation clean, scope matches, NO protected path from scripts/protected-paths.txt, no migration. CLASS B (any protected path or migration): green PR, STOP merging, list it in the REVIEW QUEUE. The ONLY Class B-style merge authorized now is WP-A (PR #72) under its conditions. NO migration is authorized in this dispatch.
- If a WP fails, mark it BLOCKED in the ledger, skip only its dependents, continue with independent WPs.
- STOP TRIGGERS: a pre-authorization condition fails; a migration would be needed; a protected path outside a WP's scope would change; foreign changes or another session detected; the merge method fails; the spec contradicts the repo in a way that changes the design.
- PROD test data: print per-table counts BEFORE creating fixtures and AFTER cleanup; they must be equal. Fixture ids only, no PII.

## WORK PACKAGES (execute in this order)

### WP-A | FIX AND MERGE PR #72 (guest stack, branch devin/V2-W3-GUEST-FIX-1125-001-d, head 403da04) (CTO-PRE-AUTHORIZED merge)

CTO read submit, guestRequest, search, searchCache, powClient and the TMDB client and found no security defect. Two live failures must be fixed first:

A1 RACE. Two concurrent submits with the same (contributor, client_batch_id) both pass the idempotency SELECT in submit_recommendations (migration 144, live, DO NOT change it); the loser gets a unique violation (23505) and the route returns 503. Fix IN THE ROUTE app/api/ask/submit/route.ts (no migration): when the RPC error code is 23505, retry the RPC ONCE; the retry returns replayed:true. Any other error keeps the existing mapping. Add a unit test (mock rpc: 23505 then success returns replayed:true; 23505 twice returns the mapped error; a non-23505 error is not retried). Live proof before and after the fix: concurrent duplicate pair FAIL (503,200) before, PASS after (200,200, exactly ONE submissions row for that batch, one response replayed:true).

A2 AXE color-contrast (serious) in the friend flow, en/fr/es/th. First capture per failing node the axe data: foreground, background, computed ratio, and which screen. Then fix in components/v2/friend/** using existing design tokens (no hard-coded colors). Prefer a local class/token choice that passes. Change a global token in app/v2-tokens.css ONLY if the token pair itself fails, and then scripts/check-contrast.mjs must pass for every preset in both themes. Fix the es axe injection failure in the proof script. Run axe on EVERY friend screen (landing, add with an item in the tray, details expanded, receipt, language sheet) in light and dark, in en/fr/es/th at 360px: zero serious/critical.

A3 Merge `git merge origin/main` into the branch, push, CI green on the PR (mark it ready for review first).

A4 Re-run the full live guest suite (reuse the existing proof script; same PASS list as before plus the two fixes) with audited cleanup.

CONDITIONS to merge: A1-A4 proofs all PASS; tsc/eslint/vitest/build green; CI green; check-protected-paths output pasted (if it now lists ANY protected path, STOP at green PR); `git diff --name-only origin/main...HEAD` lists only the earlier 43-file guest scope plus the A1/A2 fix and test files. Then merge and verify by ancestry.

POST-MERGE PROOFS on PRODUCTION (use a fixture ask, audited cleanup):
(i) landing of a fixture ask token returns 200 and sets no `sb-*` cookie;
(ii) SPOOFED X-FORWARDED-FOR: send 25 requests for a dead token with a DIFFERENT random x-forwarded-for each; the 429 from ask_token_miss must appear after about 20 requests from your real IP (the spoofed header must not reset the bucket) (this exhausts your own IP bucket for an hour, which is fine);
(iii) an inbox poster from image.tmdb.org renders on the production inbox (CSP not blocking): check via the console or an e2e assertion. Paste decisive lines.

### WP-B | P0 ACCEPTANCE MATRIX (Class A, docs only)

Create docs/handoff/P0-ACCEPTANCE-MATRIX.md: one row for every bullet of section 13 "P0 acceptance criteria" in claude/05_PRD_V2_RECOMMENDATION_INBOX.md (the repo copy is docs/05_PRD_V2_RECOMMENDATION_INBOX.md; use it) plus P0-21..P0-25 from docs/PLAN-V2-002.md. Columns: criterion | status (PASS / FAIL / NOT DONE / UNPROVEN) | evidence (test file and test name, script and output line, PR, or merge SHA) | gap and what closes it. Status must rest on evidence you can point at on origin/main or on a named open PR; no guessing. End with a ranked list of the gaps that block MVP. Merge via a docs-only PR (Class A). Keep it compact.

### WP-C | PIPELINE STACK -> EVIDENCE-READY PRs (Class B, DO NOT MERGE)

Order #62 (cc48981) -> #71 (1bec8e5) -> #73 (9edef7a) -> #74 (0a078ce). Migrations 147/148/149 are LIVE. For each: `git merge origin/main` (and the parent branch where stacked), push so CI runs, paste the run result. Required fixes, each with a check that FAILS before and PASSES after:

a) #73 is red on 13 eslint errors fixed only on #74 (bee8c7c): cherry-pick bee8c7c into #73.
b) scripts/verify-delete-account.mjs re-applies migration 146 (already live): skip the apply when public.delete_account exists.
c) DELETION RULING: when deletion_job_advance fails before stage `done`, the pipeline and route MUST return ok:false with a non-2xx status and leave the job resumable (stage not advanced). Never ok:true. Add a test that injects the advance failure.
d) REAUTH RULING: /api/account/reauth/start must force a Google round trip (prompt=login and/or max_age=0). Report whether it does today (paste the code line). If not, implement it, keep `done` requiring last_sign_in_at > state.iat - 5s, and add a test.
e) Ledger proof (147 live): deletion jobs advance forward-only, equal-stage allowed, 'done' nulls the email, on a fixture user with audited cleanup.
f) Housekeeping route and email drain (149 live): run against PROD with fixtures; CRON_SECRET via env only; unauthenticated request = 401/503; authenticated run enqueues and drains; zero residue. RESEND_API_KEY/EMAIL_FROM are absent: stub the provider at the HTTP boundary or use dry mode, never send to a real address, and mark the REAL send NOT DONE.
g) Report whether each vercel.json schedule is once per day and what that implies for the owner e-mail drain. Do not change schedules.
h) The deletion pipeline must delete Library data and storage files per PRD section 10.2: verify with a fixture account that has a Library node, a folder, an edge, a grant and a rating, and a guest contribution; after delete_account everything is gone, running it twice is harmless. Paste the per-table before/after counts.

STOP at green PRs with an evidence pack for each.

### WP-D | THREAT-MODEL TEST SUITE P0-23 (Class A if no protected path; otherwise green PR and STOP)

Implement the automatable subset of threat-model tests T1-T17 from docs/PLAN-V2-002.md section "Threat" table, for the guest routes now on main after WP-A, as vitest route tests with mocked RPC/service client (no PROD writes): token enumeration (identical 404 and the 20/h IP miss bucket), replay of another guest's cookie, forged/tampered cookie costs zero DB calls, oversized body, wrong content-type, missing/foreign Origin, flooding per bucket, honeypot/PoW failure, rating out of range, too many items, blocked contributor. One test per row, named with its T-number. Add a table in docs/handoff/V2-W7-LEDGER.md mapping T-number -> test name or NOT AUTOMATABLE (with reason).

### WP-E | LOCAL SMOKE SUITE (Class A; package.json "scripts" entry only, no dependency changes)

CTO RULING: v2 e2e specs write PROD, so they are NOT wired into CI. Build instead (1) e2e/helpers/prodAudit.ts: snapshot per-table row counts before, assert equality after, fail loudly on residue, never print PII; (2) retrofit every existing e2e/v2-*.spec.ts to use it; (3) `npm run smoke:v2` running the core v2 flows (guest submit, merge of two friends on one title, friend rail counts, settings/sign-out, delete-my-data) against the local dev server; (4) docs/handoff/SMOKE-V2.md with one paragraph on how Lolo or a coder runs it. Run it once and paste the summary line plus the residue audit.

### WP-F | CLOSEOUT

Add NEW PROGRESS rows (citing hashes) for every WP via one docs-only Class A PR; merge the ledger branch with it. Final reply = ONE code block: (1) answer first, max 15 lines: per-WP status, what is live on PROD now, what waits for the CTO. (2) REVIEW QUEUE table: PR number, head SHA, protected files touched, proofs PASS/FAIL/NOT DONE, recommended merge order. (3) Decisive raw evidence verbatim. (4) `git log origin/<branch>..HEAD` empty for every branch you pushed. Never claim pushed/merged/done without ancestry or REST proof. Ref: LIKED / V2-W7-MARATHON-1128-001
