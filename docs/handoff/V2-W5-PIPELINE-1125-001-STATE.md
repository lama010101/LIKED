# V2-W5-PIPELINE-1125-001 — resumable state

## Environment
- Worktree: D:/LIKED-W5-PIPELINE (ONLY work here; D:/LIKED is polluted by V2-W3-GUEST-FIX session).
- node_modules: junction -> D:\LIKED\node_modules (created via mklink /J).
- Base: db3e8ba (PR #62 head). Branches:
  - devin/V2-W5-PIPELINE-1125-001 = working branch (was at db3e8ba; now has ST1 commit cc48981 pushed to PR#62 branch)
  - devin/V2-W5-EMAIL-1125-001 = ST2 branch (created from cc48981)
- PR #62 branch devin/V2-W4-PIPELINE-1124-001 is checked out in D:/LIKED (polluted) — CANNOT checkout locally; push via `git push origin HEAD:devin/V2-W4-PIPELINE-1124-001`.
- Migrations 147/148 NOT YET on devin/V2-W5-MIG147-1125-001 (worktree D:/LIKED-V2-W5-MIG147 clean @5b24d75, only up to 146). DB proofs = UNPROVEN-WAITING-ON-147. Re-check: `git fetch origin; git ls-tree -r --name-only origin/devin/V2-W5-MIG147-1125-001 | grep migrations/14[78]` and local branch files.

## DONE
- ST1 (PR#62 fixes R1+R2): commit cc48981 PUSHED to devin/V2-W4-PIPELINE-1124-001.
  - lib/enrich/redact.ts (new): redactSecrets(text, secrets[]) masks ?key=/api_key/access_token/token/sig query values, Bearer tokens, literal env values (min len 8).
  - lib/enrich/tmdb.ts: getJson + fetchTmdbDetails/fetchTmdbAvailability — AbortSignal.timeout(timeoutMs ?? PROVIDER_TIMEOUT_MS=8000), TimeoutError/AbortError -> 'provider_timeout', network errors redacted.
  - lib/enrich/youtube.ts: same pattern (key in URL).
  - lib/enrich/processJobs.ts: errorText(err, secrets) redact-before-truncate; finish() redacts p_error + console.warn; providerSecrets=[env.tmdbToken, env.youtubeKey].
  - app/api/cron/enrich/route.ts: console.error redacted via readProviderEnv.
  - Tests: redact.test.ts (6), tmdb.test.ts +1 timeout, youtube.test.ts +1 timeout, processJobs.test.ts +1 redaction. vitest lib/enrich 40/40 PASS, tsc 0, eslint 0.
- ST2 (P0-18 email) IN PROGRESS on devin/V2-W5-EMAIL-1125-001:
  - lib/email/env.ts getEmailConfig (RESEND_API_KEY+EMAIL_FROM else null)
  - lib/email/types.ts EmailDb/EmailOutboxRow (contract: email_claim returns [{id,kind,to_email,owner_id,payload,attempts,language}])
  - lib/email/send.ts sendResendEmail (fetch POST api.resend.com/emails, Bearer, Idempotency-Key=outbox id, AbortSignal.timeout 8000, redact)
  - lib/email/templates.ts renderEmail(kind,language,payload)->{subject,text}|null; kinds recommendation_received/account_deleted/deletion_request_confirm x en/fr/es/th
  - lib/email/drain.ts drainEmailOutbox: env null -> {reason:'email_not_configured'} BEFORE claim; email_claim p_limit; per row render->send->email_finish; missing to_email/unknown kind -> finish(false)
  - app/api/cron/email/route.ts GET: authorizeCron, maxDuration 60
  - Tests written: lib/email/drain.test.ts, app/api/cron/email/route.test.ts (401/503/200 cases)
  - NEXT: rerun vitest lib/email app/api/cron/email (1 test was failing - fixed capture), tsc, eslint, commit, push branch, create DRAFT PR base=devin/V2-W4-PIPELINE-1124-001

## TODO ST3 (P0-20 deletion) — branch devin/V2-W5-DELETE-1125-001 from ST2 head
Files: app/api/account/reauth/start+done, app/api/account/delete, lib/account/deletionPipeline.ts, app/settings/delete/page.tsx, app/account-deleted/page.tsx, app/delete-account/page.tsx, app/api/delete-requests/route.ts (POST)+confirm/route.ts (GET), scripts/process-deletion-requests.mjs, messages/*.json (account+deletion namespaces, 4 langs), tests.
Key facts: REPO-17 scans app/settings + app/delete-account -> NO hex literals, NO hard-coded JSX text (use next-intl). lib/ask has guardAskRequest/readAskJsonBody/rlHit/rlBucket/hashRlKey/rateLimitIpKey/getHumanCheckProvider/getAskSecrets/AskError. RATE_LIMITS has delreq_ip(5/h/ip)+acct_delete_user(5/h) — need 3/day/address via rlHit custom. delete_account(uuid,text) live (146). Google revoke pattern: app/api/youtube/disconnect/route.ts (decryptToken + oauth2 revoke fetch). account_deletion_jobs stages storage<auth<email<done; deletion_job_advance forward-only.
147 contract fns (UNPROVEN until live): deletion_request_create(p_email,p_token_hash bytea,p_ip_hash,p_confirm_payload jsonb), deletion_request_confirm(p_token_hash bytea)->bool, deletion_requests_claim(p_limit)->[{id,email}], deletion_request_finish(p_id,p_status 'done'|'rejected'), deletion_job_advance(p_user_id,p_stage,p_error), deletion_jobs_claim_stuck(p_limit)->[{user_id,stage,email,attempts}].
Reauth: signed cookies liked_reauth_state (HMAC {uid,nonce,iat} 10min) + liked_reauth_proof (HMAC {uid,iat} 5min single-use); ACCOUNT_REAUTH_SECRET env; wrong Google acct -> nothing deleted; expired -> REAUTH_REQUIRED (401). OAuth via supabaseBrowser.auth.signInWithOAuth redirectTo /api/account/reauth/done?next=... MANUAL-VERIFY for real round trip.

## TODO ST4 (P0-22 housekeeping) — branch devin/V2-W5-HOUSEKEEPING-1125-001 from ST3 head
GET /api/cron/housekeeping: authorizeCron; steps: (1)(2) enqueue_stale_enrichment rpc [NOTE: fn needs auth.uid() -> service call 42501; likely needs 148 global variant — call it, catch error, report; then processJobs() drain] (3) items_purge_unreferenced rpc (4) housekeeping_purge rpc + deletion_jobs_claim_stuck -> deletionPipeline resume -> deletion_job_advance. vercel.json add daily cron entries ONLY (Hobby). Proof UNPROVEN-WAITING-ON-147.

## VALIDATION per PR: npx tsc --noEmit; npx eslint .; npx vitest run; node scripts/check-invariants-001.mjs; node scripts/verify-v2-security.mjs; node scripts/check-languages.mjs; npm run build; node scripts/check-protected-paths.mjs (+verify-delete-account.mjs for ST3). All need .env.local? check-invariants needs DATABASE_URL — D:/LIKED/.env.local exists; worktree lacks it -> may need to copy? NEVER read/edit .env* — but scripts read it via dotenv; copy file? "Never read, edit, delete or recreate .env* files" — copying for local run is borderline; scripts run from worktree root look for .env.local there. Junction won't cover it. If DB checks fail on missing env, note it.

## PRs: DRAFT only, stacked: PR-2 base devin/V2-W4-PIPELINE-1124-001, PR-3 base PR-2 branch, PR-4 base PR-3 branch. GitHub MCP or REST; GITHUB_CI_TOKEN then credential-manager PAT fallback.

## FINAL STATE (end of run — context exhausted)
- ST1 DONE: cc48981 pushed to devin/V2-W4-PIPELINE-1124-001 (PR #62 updated). vitest lib/enrich 40/40, tsc 0, eslint 0.
- ST2 DONE: branch devin/V2-W5-EMAIL-1125-001 @1bec8e5, DRAFT PR #71 (base devin/V2-W4-PIPELINE-1124-001). vitest 12/12, tsc 0, eslint 0. UNPROVEN-WAITING-ON-147.
- ST3 MOSTLY DONE: branch devin/V2-W5-DELETE-1125-001 @b340e24, DRAFT PR #73 (base devin/V2-W5-EMAIL-1125-001). 18 files: reauth.ts(+test 4/4 pass), deletionPipeline.ts, reauth start/done, account/delete, delete-requests POST+confirm, settings/delete page+panel, account-deleted, public delete-account page+form, process-deletion-requests.mjs, messages x4 (check-languages 4/0 PASS). NOT yet run: full vitest suite, tsc --noEmit on all, eslint ., npm run build, verify-delete-account.mjs, e2e deletion test (throw-away account), MANUAL-VERIFY Google round trip. deletionPipeline stage-gate logic UNREVIEWED by tsc — check for type errors first.
- ST4 NOT STARTED: GET /api/cron/housekeeping (enqueue_stale_enrichment reuse — NOTE auth.uid() NULL under service_role, likely needs migration-148 global variant; then processJobs drain; items_purge_unreferenced; housekeeping_purge; deletion_jobs_claim_stuck->runDeletionPipeline resume; vercel.json daily crons only). Design notes in TODO ST4 above.
- TODO NEXT SESSION: (1) fetch devin/V2-W5-MIG147-1125-001, if 147/148 files exist check them out UNCOMMITTED for BEGIN..ROLLBACK DB proofs; report signature mismatches vs contract. (2) Run full validation on PR #73 branch, fix issues, push. (3) Implement ST4 on devin/V2-W5-HOUSEKEEPING-1125-001 from b340e24, draft PR base=devin/V2-W5-DELETE-1125-001. (4) e2e deletion test w/ throw-away account + verify-delete-account.mjs green. (5) docs/00_PROGRESS.md rows. (6) Final report.
- GitHub MCP servers were unreachable; PRs created via REST + credential-manager PAT (GITHUB_CI_TOKEN absent).
