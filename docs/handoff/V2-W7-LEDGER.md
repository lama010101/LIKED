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
| WP-A | Fix+merge PR #72 (guest stack) | IN PROGRESS | devin/V2-W3-GUEST-FIX-1125-001-d | 403da04 | #72 | A1 route retry fix + test; A2 axe contrast; A3 merge main+CI; A4 live suite; merge; post-merge proofs |
| WP-B | P0 acceptance matrix (docs) | PENDING | - | - | - | after/parallel with WP-A |
| WP-C | Pipeline stack evidence PRs (#62->#71->#73->#74) | PENDING | - | - | - | Class B, DO NOT MERGE |
| WP-D | Threat-model tests T1-T17 (P0-23) | PENDING | - | - | - | after WP-A (needs guest routes on main) |
| WP-E | Local smoke suite smoke:v2 | PENDING | - | - | - | independent |
| WP-F | Closeout PROGRESS rows + ledger merge | PENDING | - | - | - | last |

## Threat-model test map (T-number -> test / NOT AUTOMATABLE) — filled by WP-D

| T# | Test name | Status |
|----|-----------|--------|
| T1-T17 | pending | - |

## Evidence log

(entries appended per WP with decisive lines only)
