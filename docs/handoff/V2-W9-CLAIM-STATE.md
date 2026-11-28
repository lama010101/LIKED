# V2-W9-CLAIM-1128-001 — resumable state

## Current state (in progress)

Worktree: `D:\LIKED-WORKTREES\V2-W9-CLAIM-1128-001`  
Branch: `devin/V2-W9-CLAIM-1128-001`  
Base at creation: `ffbfe313e1d859d7f66fc78354cfe99d7c357bf7` (`origin/main` at fetch time)

Step Zero shared checkout `D:\LIKED` `git status --porcelain` before any work:

```text
 M next.config.ts
?? app/api/ask/
?? lib/tmdb/
?? lib/youtube/budget.test.ts
?? lib/youtube/budget.ts
?? lib/youtube/serverKey.test.ts
?? lib/youtube/serverKey.ts
?? scripts/tmdb-th-check.mjs
```

Those are foreign/active-session changes. The shared checkout was not edited.

## Completed so far

- Read PLAN-V2-002 §2.8, §4.5 T9, §5; PRD 05 §4 and §5.5.
- Checked live PROD constraints for `contributors`, `submissions`, `recommendations` with read-only SQL. Key facts: `contributors.claimed_by_user_id` is UNIQUE and FK users CASCADE; `submissions` has UNIQUE `(contributor_id, client_batch_id)` and contributor FK CASCADE; `recommendations` has UNIQUE `(owner_id,item_id,contributor_id)`, contributor FK CASCADE, submission FK CASCADE, item FK RESTRICT.
- Added `supabase/migrations/154_v2_claim_guest.sql` (not applied): class-S `claim_guest`, guard first, service_role only, lock/idempotency/merge/conflict/self-drop logic.
- Added `lib/ask/claimIntent.ts`: signed 5-minute `liked_claim_intent`, contributor+ask-token binding, strict `/r/<32-char-token>?claim=1` return path helper.
- Added `app/api/ask/claim/intent/route.ts`: guarded intent mint endpoint.
- Added `app/api/ask/claim/route.ts`: guarded three-factor claim endpoint, owner-link state, RPC call, cookie rotation, intent clear.
- Edited only the delimited claim JSX region in `components/v2/friend/ReceiptScreen.tsx`; no picks/promote/playlist block touched.
- Added top-level `claim.*` catalog entries in `messages/{en,fr,es,th}.json`.

## Important interpretation recorded

`dropped_self` is implemented as rows with `owner_id = p_user_id AND contributor_id = surviving_contributor`. `owner_id` is the recipient; deleting every row with `owner_id=p_user_id` would erase other people's recommendations in that inbox. This safety interpretation is documented in the migration comments.

## Validation state before commit

- Migration NOT applied.
- Rollback harness: 30 passed, 0 failed; zero residue across users/asks/contributors/items/submissions/recommendations/notifications.
- tsc: exit 0.
- eslint (npm run lint): exit 0, 0 errors, 2 pre-existing warnings.
- npx next lint: NOT RUNNABLE in this repo because Next 16 treats lint as a directory; npm run lint is the repo script.
- vitest: 51 files / 460 tests passed.
- build: exit 0; /api/ask/claim and /api/ask/claim/intent appear in route table.
- check-languages: 4 passed, 0 failed (638 keys per locale).
- check-protected-paths before commit: 0 because all work was still uncommitted; rerun after commit.
- check-invariants: 66 passed, 5 failed. Expected/blocking facts: DB-7 fails only because migration 154 is intentionally unapplied/unrecorded. REPO-15 initially failed due a direct contributors update; fixed by adding class-S guest_rotate_secret and regex recheck is clean. Remaining non-154 failures observed in same run: REPO-17 AppearanceControls baseline, REPO-18 oauthScopes test literal, REPO-20 threatModel test literal.
- Real Google round trip: MANUAL-VERIFY.

## Review state

- Initial commit/head: `fc63fdba0805348582f9368fd61111031c01531b`. Push proof: `git ls-remote origin refs/heads/devin/V2-W9-CLAIM-1128-001` returned the same SHA.
- `git merge origin/main --no-edit`: Already up to date, exit 0.
- DRAFT PR #89 created: https://github.com/lama010101/LIKED/pull/89.
- Migration NOT applied; nothing merged.

## MANUAL-VERIFY for Lolo

1. Apply migration 154 only after approval (not done here).
2. Open a valid `/r/<token>` in a browser profile with no LIKED Google session, submit one recommendation, press **Continue with Google** in **Make your own list**, complete a real Google consent round trip.
3. Confirm return lands on `/r/<token>?claim=1`, then automatically redirects to `/inbox`.
4. Confirm the submitted recommendation still appears for the owner and the Google account now has its own Ask link/contributor history.
5. Shared-device negative check: copy only `/r/<token>?claim=1` into a browser signed into a different LIKED account without pressing the guest button; confirm no claim occurs.
6. Owner negative check: sign in as the Ask owner, press the guest button and return; confirm the UI shows **This is your own link** and no claim occurs.

## Resume instructions

Review PR #89. Do not apply migration 154 or merge unless explicitly authorized.
