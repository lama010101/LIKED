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
| WP2 migrations 147+148 | MERGED_POSTMERGE_VERIFY_RUNNING | devin/V2-W6-MIG147-1127-001 | 1f96edff2ecda108d3c7e6718692d57c015f95b0 | PR76 | merged as 3fb0527ebf8ff863e9325430e4b48609125d2f76; catalog postmerge proof passed; final invariant/security reruns in progress |
| WP3 migration 149 | PENDING | devin/V2-W6-MIG149-1127-001 | pending | pending | wait WP2 live |
| WP4 guest stack | PENDING | devin/V2-W3-GUEST-FIX-1125-001-d | f95d4f00c449d368a4f80cb04611888deb9f2e29 | existing draft TBD | wait WP2 live |
| WP5 pipeline stack | PENDING | stacked branches | pending | #62/#71/#73/#74 | wait WP1+WP2/WP3 |
| WP6 class A items | PENDING | TBD | pending | pending | wait dependencies |
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
