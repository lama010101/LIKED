# P0 Acceptance Matrix — V2-W7-MARATHON-1128-001

Evidence-only statuses. PASS = proven on `origin/main` (merge SHA / test / script output cited) or by a named live run. UNPROVEN = partial evidence exists but the full criterion is not demonstrated. NOT DONE = the implementing work is absent from `origin/main` (named open PR where applicable). Compiled 2026-11-28 against `origin/main` = `f38cbba` (post PR #72 merge).

## Section 13 bullets (docs/05_PRD_V2_RECOMMENDATION_INBOX.md)

| # | Criterion | Status | Evidence | Gap / what closes it |
|---|-----------|--------|----------|----------------------|
| C1 | Guest opens `/r/{token}`, name, ≥1 title, submit; no Supabase session | PASS | `e2e/v2-guest-landing.spec.ts` ("sets no Supabase cookie on /r/*"); live `wp4-live-proof.mjs`/`wp7-postmerge.mjs` on merged `f38cbba`: `pow_session_guest_*`, `guest_cookie_shape`, `submit_guest_b`, `prod_guest_session`, `prod_guest_submit`, `browser_360_no_sb_*` | — |
| C2 | Submission is one atomic RPC; rollback leaves no partial rows | PASS | `app/api/ask/_lib/writeRoutes.test.ts` (16 tests incl. replay/rollback paths); route calls `submit_recommendations` once (+23505 retry, `2f2093a`) | — |
| C3 | Two friends same TMDB title → ONE card, two recommenders | PASS | `e2e/v2-owner-inbox.spec.ts` (PR #63, merge `bf87616`) | — |
| C4 | Re-adding same title by same contributor → no duplicate | PASS | Live `submit_replay_race_atomic=PASS statuses=200,200 replayed=false,true` (post-fix run on `f38cbba` code); idempotency in `submit_recommendations` | — |
| C5 | Score 0–100 step 5, tooltip, null/0/clear, server rejects out-of-range, a11y | UNPROVEN | `components/v2/friend/ScoreSlider.tsx` exists; range check lives in RPC (migration 144) | Needs e2e: keyboard/screen-reader slider, explicit 0 stored, Clear→null, out-of-range 4xx — WP-D threat row covers reject only |
| C6 | Friends avg ring + rater count; separate Friends/TMDB rings; no TMDB logo in score UI | PASS | `e2e/v2-owner-inbox.spec.ts` (PR #63) | — |
| C7 | Owner receives email AND in-app unread count per submission | NOT DONE | In-app: `e2e/v2-owner-notifications.spec.ts` PASS (PR #66-era, merge on main); email: no sender/outbox drain on `origin/main`; `RESEND_API_KEY`/`EMAIL_FROM` absent | Email sender + drain = pipeline PR stack (#62→#74, WP-C) + secrets |
| C8 | Friend rail: unseen ring, per-friend badge, All=sum, clear-on-open | PASS | `e2e/v2-owner-rail.spec.ts` (PR #64, merge `f1e47c4`) | — |
| C9 | §6.2 quote rules; status tabs counts; To watch = default list | UNPROVEN | `get_inbox` returns `quote` + `counts{to_watch,watched,dismissed}` (PLAN-V2-002 contract); inbox card renders quote | Status tabs are P1-hidden; needs e2e asserting tab counts + default-list equality |
| C10 | Receipt shows exactly what guest sent, nothing from others | PASS | Live `two_guest_receipt_isolation=PASS` (both directions, `wp4-live-proof.mjs`) | — |
| C11 | Skeleton cards; enrichment fills year/genre/lang/rating/platform without blocking submit | NOT DONE | `enrichment_jobs` table + `lib/enrich/kick.ts` on main; no worker/cron route (`app/api/cron` absent); `enrichment_status`/`skeleton` fields exist | Enrichment worker + `/api/cron/enrich` — pending pipeline stack / WP-C scope |
| C12 | No guest table/RPC access; RLS on, no anon policy; all via `/api/ask/*` | PASS | `scripts/verify-v2-security.mjs` (98 checks), `scripts/verify-anon-blocked-094.mjs`, `verify-rls-087*.mjs`; guest routes are the only guest surface (PR #72) | Re-run verify scripts on final main at closeout |
| C13 | Rate limits + abuse control on every `/api/ask/*`; threat-model suite passes | NOT DONE | Rate limits live-proven: `flood_rate_limit_live`, `youtube_budget_exhausted_busy`, `prod_xff_spoof_bucket_429` (429 at req 21, spoof ineffective) | Threat suite T1–T17 = WP-D (this dispatch, pending) |
| C14 | YouTube search via server key; identical queries cached; budget exhaustion → paste-link UI, TMDB still works | PASS | Live `wp4-live-proof.mjs`: `youtube_live_search`, `youtube_race_single_budget`, `youtube_cache_hit_zero_budget`, `youtube_budget_exhausted_busy`, `tmdb_still_works_when_youtube_busy` — all PASS | Paste-link UI copy verified in `AddScreen.tsx` (`searchBusy`) |
| C15 | No YouTube display fields >30d; inbox stores video ids only | NOT DONE | Migration 149 live; `scripts/verify-housekeeping-149.mjs` exists | Housekeeping route/drain run = WP-C(f); 30-day purge proof pending |
| C16 | Sign-in/signup request only openid/email/profile; YT import works via incremental connect | UNPROVEN | `lib/youtube/persist-connection.ts`, `runImport.ts` on main; Google scopes in auth routes | Needs scope audit of `/api/auth/*` + live incremental-connect check |
| C17 | `Accept-Language` matrix: fr-FR→French, de-DE→English, th→Thai, en,fr→English; saved choice wins; no IP language | PASS | `lib/i18n/negotiate.test.ts` (10 tests) covers negotiation; `set_language` RPC persists choice | Live header-matrix spot check not run — low risk |
| C18 | Language switch: instant UI, persists, changes TMDB `language` param | UNPROVEN | `e2e/v2-owner-settings.spec.ts` covers fr switch + cookie + persist; `tmdbTagFor` used in `/r/[token]` and search | TMDB `language=` param verification from request logs not done |
| C19 | Language list single config; CI fails on missing TMDB tag/UI key; fallback en→original | PASS | `scripts/check-languages.mjs` wired in `ci.yml` (hashFiles gate); `lib/i18n/languages.ts` single `LANGUAGES` config; fallback in `negotiate`/`tmdbTagFor` | — |
| C20 | Owner prompt/note + friend comments display as written; Thai font; no 360px clip in any language | UNPROVEN | `Noto_Sans_Thai` loaded in `app/layout.tsx`; receipt/inbox render comment text; `browser_360_no_sb_*` checks sw≤iw | Per-locale 360px clip audit + Thai glyph check not run for every screen |
| C21 | Settings shows all §6.9 groups and each works; Sign out ends this-device session, deletes nothing | PASS | `e2e/v2-owner-settings.spec.ts` (PR #65, merge `ffd3616`): groups, region, email toggle, sign-out→/login no sb cookie, row counts unchanged | Theme/colour + Danger-zone rows intentionally hidden (P1/deletion pending) |
| C22 | Delete account: checkbox + fresh Google re-auth; full purge (auth user, users row, inbox, recs sent+received, Library nodes/folders/edges/grants/ratings, files); Ask link dead; sent recs vanish; folder-item rule; confirmation email; idempotent | NOT DONE | Pipeline stack open: PR #62 `cc48981` → #71 `1bec8e5` → #73 `9edef7a` → #74 `0a078ce`; migrations 147/148/149 LIVE; `app/api/account` + `/delete-account` absent on main | WP-C evidence pack (fixes a–h) then CTO merge decision — Class B |
| C23 | Guest "Delete my data" removes contributor + submissions + recommendations immediately | PASS | Live `guest_delete_my_data=PASS statuses=200,200 remaining=0` (`wp4-live-proof.mjs`, post-merge code) | — |
| C24 | `/delete-account` public, names app/developer; email path creates `deletion_requests`; Privacy/Terms reachable from Settings + landing footer | NOT DONE | `/privacy` + `/terms` exist on main; `/delete-account` route absent (in pipeline stack); `deletion_requests` table live (mig 149) | WP-C PR stack merge (Class B) |
| C25 | TMDB + JustWatch attribution (official logos + wording) on Credits | UNPROVEN | `app/settings/credits/page.tsx` + `e2e/v2-owner-settings.spec.ts` assert exact notices | Official logo assets missing (noted PR #65: would need `public/**`) — legal/asset decision pending |
| C26 | Foundations: no hard-coded hex/user-visible strings outside tokens/messages; dark OS first paint no flash | PASS | `scripts/check-invariants-001.mjs` REPO-* gates; `scripts/check-languages.mjs` message parity (en/fr/es/th); `e2e/theme.spec.ts` dark-first-paint; v2 tokens scoped `[data-ui="v2"]` | — |

## PLAN-V2-002 P0-21..P0-25

| # | Criterion | Status | Evidence | Gap / what closes it |
|---|-----------|--------|----------|----------------------|
| P0-21 | Privacy policy + Terms updates (guests/contributors, TMDB, YouTube/Google privacy ref, JustWatch, retention, backups, deletion paths); footer+Settings links; claim-vs-implementation table all IMPLEMENTED | UNPROVEN | `/privacy`, `/terms` routes on main; links in Settings/landing | Guest-flow sections + claim-vs-impl audit table not evidenced — legal review gate |
| P0-22 | Housekeeping cron §6.5: >30d YouTube fields purged, TMDB 6-month purge, stuck deletion jobs resume | NOT DONE | Migration 149 live; `scripts/verify-housekeeping-149.mjs` exists | Cron route + drain run vs PROD = WP-C(f); rollback-harness proof pending |
| P0-23 | Threat-model test suite T1–T17 (automatable subset) green | NOT DONE | — | WP-D (this dispatch): vitest route tests + ledger T-map |
| P0-24 | e2e v2 suite green on CI | NOT DONE | `e2e/v2-*.spec.ts` ×6 on main (guest-landing, owner-inbox/rail/settings/notifications, landing-v2b) | Specs write PROD → deliberately not CI-wired; `smoke:v2` local suite = WP-E |
| P0-25 | CI wiring: `vitest run` + check-* scripts in ci.yml; secrets documented | PASS | `.github/workflows/ci.yml`: `npx vitest run`, `check-languages.mjs`, `check-contrast.mjs` (hashFiles gates); tsc+eslint steps | Secrets list documentation — verify in docs before closeout |

## Ranked MVP blockers

1. **C22/C24/P0-22 — deletion pipeline unmerged** (Class B stack #62→#74): account deletion, `/delete-account`, `deletion_requests`, housekeeping drain all absent from prod code path. Blocks launch-legal requirements.
2. **C13/P0-23 — threat suite T1–T17**: rate limits proven live but the mandated test set does not exist yet (WP-D in flight).
3. **C7 — owner email**: in-app notification works; Resend sender + outbox drain absent and secrets unset.
4. **C11 — enrichment worker**: skeleton cards exist but nothing fills year/genre/platform post-submit (no worker/cron on main).
5. **C15/P0-22 — housekeeping cron**: 30-day YouTube purge + 6-month TMDB purge undrained (migration live, runner pending).
6. **C5/C9/C18/C20/C25 — evidence gaps**: slider a11y/range-reject, status tabs, TMDB language param, per-locale 360px audit, official attribution logos.
