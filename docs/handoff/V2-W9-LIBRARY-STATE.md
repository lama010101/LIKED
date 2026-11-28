# V2-W9-LIBRARY-1128-001 state

Implemented in worktree `D:\LIKED-WORKTREES\V2-W9-LIBRARY-1128-001`:
- migration 152 promote-to-library, additive poster RPC, folder-choice/target RPCs, harness `verify-promote-recommendation-152.mjs` — rollback harness PASS 29/0.
- migration 153 owner_picks, owner/guest RPCs, `/api/ask/picks`, owner/friend UI, threat tests, harness `verify-owner-picks-153.mjs` — rollback harness PASS 26/0.
- Validation so far: tsc PASS; targeted eslint PASS; vitest picks PASS 6/6; catalog tests PASS 33/33; production build PASS; language parity PASS 4/0.
- `check-invariants-001` expectedly reports the seven new 152/153 functions missing from the live catalog because migrations are intentionally not applied. All other visible checks passed; harnesses prove the new functions under rollback.
- Not done: stacked PR split, smoke:v2, full final vitest rerun after the catalog-test expectation fix, `git merge origin/main` at finish.
