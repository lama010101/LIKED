# AUDIT-10-FULL-001 — Full read-only audit of LIKED (legacy library + v2 foundations)

**Audited SHA:** `5da11e2a52151861004f1a09593aee4b8442f32d` (`origin/main`, worktree `D:\LIKED-AUDIT10`, clean `git status`)
**Date:** 2026-11-23 · **Mode:** read-only (DB `BEGIN READ ONLY`…`ROLLBACK` via pooler; prod walkthrough with `e2e-test@liked.app` + `a@a.com` only; all created items prefixed `AUDIT10-` where applicable)
**Production:** https://liked-zeta.vercel.app · **Live DB:** project `lzkzfqshnjvlzosnntfx`

---

## 0. Executive summary

LIKED on `main` is a **working collaborative link-library app** (Next.js 16 + Supabase, ~90 live RPCs, 58 tables, full MVP2 feature set) with **v2 Recommendation Inbox foundations merged but zero user-facing surface**. The public landing page, however, markets the *unshipped* v2 product.

**Requirement matrix (§1 of 05_MVP2_PLAN):** DONE 22 · PARTIAL 3 · BROKEN 0 · MISSING 0 — all 25 requirements have live code + DB evidence; residual gaps are UX-level (see §B).
**Defects F1–F14:** all 14 verified fixed in code + live schema (dropped/replaced objects confirmed absent).
**V2 (PLAN-V2-002 §8):** P0-01…P0-06 DONE (migrations 142–146 live, security scripts green); P0-07 mostly DONE (scopes removed, `safeNext`, `/inbox` in proxy); P0-08…P0-25 NOT STARTED (no `lib/ask`, `lib/tmdb`, `lib/enrich`, no `/r`, `/inbox`, `/api/ask` routes; all v2 tables exist but are **empty**).

**Top 10 findings** (detail §H):
1. **P1** Landing page sells the unshipped v2 "Recommendation Inbox" (send-link/no-account/inbox/merge/where-to-watch) while the shipped app is the legacy library — claim-vs-product mismatch for a public showcase.
2. **P1** BUG-CARDCLICK-002 **reproduced live**: `a@a.com` card-link clicks from `/feed` abort client-side (`/card/[id]?_rsc` fetched, URL stays `/feed`); `e2e-test` unaffected.
3. **P1** `unshare` + `change_node_permission` RPCs lack `authenticated` EXECUTE but are called via the session client in `CardView.tsx` → owner permission-edit/unshare on card detail throws 42501 (code-verified; UI error path UNVERIFIED).
4. **P1** `README.md` is still the create-next-app default.
5. **P2** `/proto` + `/proto/[name]` publicly serve `workspace/` HTML mockups (incl. "PROTO V2" designs) — reachable in production.
6. **P2** 19 legacy SECURITY DEFINER functions lack `search_path`; pg_trgm/extension helpers + `rls_auto_enable`/`set_limit`/`show_limit`/`show_trgm` are EXECUTE-granted to `anon`+`authenticated`.
7. **P2** Test-data pollution: e2e-test feed carries hundreds of synthetic `E2E-*`/`ext-e2e-*` nodes; trash holds 24 items; `a@a.com` sees real shared content — any demo account shows residue.
8. **P2** `categorization_suggestions` + `categorization_suggestions_backup_20260927` tables still live though F12 replaced the mechanism with `organize_batches`.
9. **P3** Server actions still do direct table reads (`notifications`, `card_positions`, `user_node_preferences`, `folder_edges`, `node_classifications`, `groups`) alongside the RPC layer — reads only, but dual-path.
10. **P3** No `LICENSE` file in repo root.

**Quality gates:** tsc ✅ · eslint ✅ (1 warning) · vitest 133/133 ✅ · `next build --webpack` ✅ · check-contrast 49/49 ✅ · check-languages 4/4 ✅ · check-invariants-001 **70/70** ✅ · Playwright e2e **76/76** ✅ (vs production, 4.0 min).

---

## A. Feature inventory (code)

Routes under `app/` (96 files). i18n = `next-intl`, `messages/{en,es,fr,th}.json` — **307 keys each, parity PASS** (`check-languages`). Tests: unit = vitest (10 files/133 tests); e2e = Playwright (15 spec files + helpers, 76 tests).

| Surface | Purpose | Data path (RPCs/tables) | i18n | Tests |
|---|---|---|---|---|
| `/` landing | marketing; authed→`/feed` | none (server component) | full (landing.* keys) | e2e auth-smoke |
| `/login`,`/signup` | Google OAuth only | Supabase auth | full | auth-login/signup/smoke specs |
| `/callback` | OAuth redirect, `safeNext` | auth code exchange | n/a | route.test.ts (3) |
| `/feed` (+`?folder ?q ?friend ?group ?view`) | card feed, folders section, search/filter, 3 views | `get_feed` (only caller `lib/db/feed.ts`), `get_folders`, `get_visible_tags`, `get_friend_bar`, `get_group_bar`, `get_node_context`, `autoTagNodes` | full | mvp2-shell, navigation-auth |
| `/folders/[id]` | folder detail, breadcrumb, share/access mgmt, rating | `get_folder`, `get_folder_access`, `share_folder_v2`, `revoke_folder_grant`, `set_folder_grant_permission`, `rate_folder`, `move_folder`, `rename_folder`, `set_folder_details`, `trash_folder`, `get_node_access` | full | mvp2-shell (folder tile) |
| `/card/[id]` | card detail sheet/page | `get_visible_node_by_id`, `update_node_title/text`, `upsert_rating`, `increment_view_count`, `get_node_friend_ratings`, `unshare`, `change_node_permission` ⚠ | full | BUG-CARDCLICK reports |
| `/friends` | friend/group management | `invite_friend`,`remove_friend`,`block_user`,`create_group`,`add/remove_group_member`,`delete_group`,`get_friend_bar`,`get_group_access_users` | full | e2e social flows (prior audits) |
| `/me` | profile, language, theme, sign out, links | `update_display_name`,`update_avatar_key`,`set_language`,`syncGoogleAvatar` | full | mvp2-shell "/me shows language picker" |
| `/notifications` | notification list, mark read, badge | direct `notifications` select + `get_unread_notification_count`,`mark_notifications_read`,`list_notifications` | full | mvp2-shell |
| `/organize`,`/organize/[batchId]` | AI organize batches | `create_organize_batch`,`get_organize_batches`,`get_organize_batch`,`set_organize_item_proposal`,`apply_organization_batch`,`discard_organization_batch` + `/api/categorize` (OpenRouter) | full | mvp2-shell "/organize renders" |
| `/trash` | trash list, restore, hard delete, empty | `get_trash_items`,`restore_node`,`restore_folder`,`hard_delete_node`,`hard_delete_folder`,`empty_trash`,`get_trash_count` | full | trash-authenticated (4) |
| `/youtube` | YT connect/import/likes/subscriptions UI | `/api/youtube/*` routes; `youtube_connections` table | full | youtube-api/intelligent-import/search (17) |
| `/privacy`,`/terms` | legal | static | en only? (check) | — |
| `/extension/install`,`/extension/auth` | extension install + auth relay | static + `externally_connectable` | partial | extension-install/auth specs |
| `/proto`,`/proto/[name]` | **public** UI-preview index + serves `workspace/*.html` | fs read | n/a | none — **should not be public** |
| `/flow` | Flow UIX prototype | `flow/` components | n/a | gated: `NEXT_PUBLIC_SHOW_FLOW!=="1"→notFound()` (env on prod UNVERIFIED) |
| API `auth/signout` | sign out | supabase.auth | n/a | api-unauth |
| API `categorize` | organize LLM proposals | organize_* RPCs, OpenRouter | n/a | — |
| API `classify` | grouped-search theme/channel classify | `node_classifications`,`set_node_classifications` | n/a | — |
| API `extension/{status,folders,tags}` | extension picker/status (bearer) | `nodes`,`folders`,`get_visible_tags` | n/a | extension-api spec |
| API `folders/[id]` PATCH/DELETE | rename/color/trash folder | `rename_folder`,`set_folder_color`,`trash_folder` | n/a | api-unauth (401) |
| API `import` | extension save (bearer) | `import_url` RPC (atomic) | n/a | youtube-intelligent-import (6) |
| API `nodes/[id]` DELETE | soft delete | `set_node_deleted` | n/a | api-unauth |
| API `users/create` | profile create | `create_user_profile` | n/a | — |
| API `youtube/{connect,callback,status,disconnect,likes,subscriptions,sync,search}` | YT OAuth + Data API proxy + cron sync | `youtube_connections`, Google APIs | n/a | youtube-api (14) |
| Edge fn `extract-node-metadata` | OG/title/thumbnail/tags for new cards | storage + http | n/a | exercised via import e2e |
| Chrome extension (`extension/`) | MV3 popup save, bearer auth, i18n strings | `/api/import`, `/api/extension/*` | popup i18n en/fr/th (`src/i18n/strings.ts`) | extension-api/auth/install specs |
| `_archive/` | old UI (excluded from routing/build) | — | — | not built (REPO checks) |
| `workspace/` | static HTML mockups served via `/proto/[name]` | fs | — | — |

**Dead/unreachable:** `_archive/*` (not routed); `app/flow` (env-gated); `categorization_suggestions*` tables; `card_positions`/`user_node_preferences` (0 rows — FreeGrid/custom-order remnants); `direct_chats`,`messages`,`group_messages` tables (no chat UI in `app/`); `external_sources`,`external_items_map` (edge-fn support); `get_social_timeline` etc. confirmed **dropped live** (absent from pg_proc).

## B. Requirement verification

### B.1 — 25-row matrix (docs/05_MVP2_PLAN §1)

| # | Req | Verdict | Code evidence | Live evidence |
|---|---|---|---|---|
| 1 | New UIX, archive old, responsive, light/dark | DONE | `_archive/` excluded; `app/(app)` shell; `v2-tokens.css`; ThemeSync; e2e theme.spec | /feed 390+1280 screenshots; Light/Dark toggles on /me |
| 2 | Google sign-in basic scopes; in-app YT opt-in | DONE | login page comment "only basic OIDC scopes (D25)"; `/api/youtube/connect` separate; `set_youtube_import_consent` | /youtube shows "Connect YouTube" consent state; e2e consent-gated test PASS |
| 3 | All UI strings i18n en/fr/es/th | DONE | 307 keys ×4 locales, parity PASS | check-languages 4/4 |
| 4 | FAB add card/folder in context | DONE | `AddSheet.tsx`; `createCardAction`, `createFolderAction` | e2e "FAB opens AddSheet with card/folder modes" PASS |
| 5 | YouTube folder + auto-organize | DONE | `system_kind='youtube'`; organize batches; `apply_organization_batch` | /organize 200 w/ folder list; organize_batches=4, items=606 in DB |
| 6 | Web folder + extension saves | DONE | `system_kind='web'`; `/api/import` `autoFolderName:'Web'`; Web folder live (392 items) | /api/import e2e PASS; Web folder tile on /feed |
| 7 | Search cards+folders | DONE | `get_feed` search; `get_folders(p_search)` | ?q=AUDIT grouped results live |
| 8 | Filter by tag | DONE | `p_filter_tag_ids` feed; `get_folders(p_tag_ids)` | tag RPCs live; e2e tag flows |
| 9 | DnD move card/folder | DONE | `move_node_everywhere`,`move_node_to_folder`,`move_folder` | RPCs live+granted; folder_edges live |
| 10 | Home own+friends, 3 views | DONE | `get_feed` views; List/Masonry/Columns | view buttons live on /feed |
| 11 | Friend avatar filter | DONE | `p_friend_id` feed; `get_folders(p_friend_id)` | ?friend=<id> filtered feed live |
| 12 | Rail=friends, Me separate | DONE | `FriendsRail.tsx`, Me button | feed rail shows friends + Me |
| 13 | Mobile bottom bar | DONE | AppShell bottom bar | 390px screenshots show Home/Add/Me |
| 14 | Friend mgmt + groups | DONE | invite/remove/block/create_group/member RPCs | groups=9, group_members=25 live |
| 15 | Private by default | DONE | edges model unchanged | — |
| 16 | Share card/folder | DONE* | `share_node`,`share_folder_v2` | *card-detail unshare/permission-edit BROKEN (§H-3); share itself verified in PORTFOLIO-AUDIT + RPCs live |
| 17 | Per-folder permission editing | DONE* | `folder_grants`,`set_folder_grant_permission`,`revoke_folder_grant` (authenticated-granted) | folder_grants=3 rows live; *node-level edit broken (§H-3) |
| 18 | Subfolders depth≤5 | DONE | `create_folder`/`move_folder` depth cap | folders nested live (folder_tree) |
| 19 | Breadcrumb | DONE | `get_folder` ancestors → Crumbs.tsx | /folders/[id] live |
| 20 | Trash folder/card | DONE | `trash_folder`,`restore_*`,`hard_delete_*`,`empty_trash`,`get_trash_items` | /trash "Trash · 24" + buttons live |
| 21 | Card detail | DONE | `/card/[id]` + CardView | card page 200; controls live |
| 22 | Who shared with (owner-only) | DONE | `get_node_access`,`get_folder_access` | RPCs live; access UI on folder page |
| 23 | Notifications | DONE | `list_notifications`,`mark_notifications_read`,`get_unread_notification_count` | a@a.com badge "9+", list renders |
| 24 | Rating 0–100 card+folder | DONE | `upsert_rating`,`rate_folder` (int 0–100) | ratings=13, folder_ratings=2; slider on card detail |
| 25 | Chrome extension installable | DONE | ZIP/CRX sideload; `/extension/install`; `/api/extension/*`,`/api/import` | install page 200; endpoints 401-unauth correct |

### B.2 — Defects F1–F14

| ID | Verdict | Evidence |
|---|---|---|
| F1 folder access fn | FIXED | `get_folder_access_users` absent from pg_proc; `get_folder_access` live |
| F2 share_folder snapshot | FIXED | `share_folder` absent; `share_folder_v2` live (grant+edges) |
| F3 visibility derivation | FIXED | `folder_is_visible` live; `folder_is_accessible`/`folder_is_owned` remain as helpers |
| F4 FK cascades | FIXED | migration 111 applied; hard_delete works (trash live) |
| F5 trash_folder family | FIXED | `trash_folder/restore_folder/hard_delete_folder/get_trash_items/empty_trash` all live |
| F6 atomic categorize | FIXED | `categorization_suggestions` replaced by `organize_batches/items` + `apply_organization_batch` (table still present — see H-8) |
| F7 direct writes | FIXED (residual reads) | write RPCs live; some direct *reads* remain (§H-9) |
| F8 system_kind | FIXED | `folders.system_kind`; YouTube/Web/Unsorted folders live |
| F9 folder colour | FIXED | per-owner count (migration 123+) |
| F10 YT scope at sign-in | FIXED | basic scopes only; `/api/youtube/connect` separate |
| F11 group membership writes | FIXED | `add/remove_group_member` live+granted |
| F12 categorize UNIQUE | FIXED | organize_batches/items live (606 items) |
| F13 folders in reads | FIXED | `get_folders`/`get_folder` live; `get_social_timeline` dropped (absent pg_proc) |
| F14 recipient list owner-only | FIXED | `get_node_access`/`get_folder_access` owner-gated; CardView gates on isOwner |

## C. Data layer (live DB, read-only)

- **Counts:** 58 public tables · 171 public functions · 64 policies · 0 views · `supabase_migrations.schema_migrations` = **142 rows**, max `146` (`v2_delete_account`).
- **Migration drift:** 142 files in `supabase/migrations/` = 142 ledger rows; `FILES_NOT_IN_LEDGER=[]`, `LEDGER_NOT_IN_FILES=[]` — perfect sync.
- **Live-only objects:** `categorization_suggestions_backup_20260927` (manual backup table, not in migrations); pg_trgm extension functions (`gin_trgm_*`,`gtrgm_*`,`similarity*`,`word_similarity*`,`strict_word_similarity*`,`show_trgm`,`show_limit`,`set_limit`) and `rls_auto_enable`.
- **Migration-defined but absent live:** `share_links`, `owner_picks` (P1-04 / migration 147 — not yet created, expected). Dropped-and-verified-absent: `delete_folder`, `share_folder`, `direct_share`, `group_share`, `group_unshare`, `unshare_folder_op`, `get_social_timeline`, `get_folder_access_users`, `get_folder_memberships`, `revoke_folder_admin`, `revoke_group_admin`.
- **All 80 distinct `.rpc('…')` names in live code exist as live functions** (cross-checked against pg_proc list) — zero missing-RPC calls.
- **RLS:** enabled on **every** public table (0 disabled).
- **`USING(true)`/`with_check=true` policies (9):** `external_sources_select_authenticated`, `folder_admins_{delete,insert}_service_role`, `group_admins_{delete,insert}_service_role`, `notifications_insert_service_role`, `tag_translations_select_authenticated`, `tags_select_authenticated`, `translations_select_authenticated` — all reference-data or service-role writes; no user-table `USING(true)`.
- **SECURITY DEFINER without `search_path` (19, legacy):** `change_folder_permission, change_node_permission, create_group, get_folder_permission, get_friend_bar, get_node_permission, get_visible_node_by_id, grant_folder_admin, grant_group_admin, has_folder_permission, has_node_permission, increment_view_count, is_folder_admin, is_group_admin, set_custom_order, update_avatar_key, update_display_name, update_node_title, upsert_card_position`.
- **EXECUTE grants:** all 30 v2 functions correctly classed (18 class-S service-role-only, 12 class-O authenticated-only — verified via proacl + DB-21 anon probes → 42501). Legacy `authenticated`-granted functions match the session-RPC surface. **Exceptions:** `unshare`, `change_node_permission`, `change_folder_permission`, `get_node_permission`, `get_folder_permission`, `has_node_permission`, `has_folder_permission` are `{postgres,service_role}` only — see H-3. `ensure_user_profile` + pg_trgm internals + `rls_auto_enable` granted to `anon`+`authenticated`.
- **Row counts (live):** users=25, nodes=2236, edges=2571, causes=2405, folders=106, folder_edges=2389, folder_grants=3, ratings=13, folder_ratings=2, notifications=146, groups=9, group_members=25, friend_invites=11, tags=1353, tag_edges=6897, tag_translations=1353, translations=1710, organize_batches=4, organize_items=606, node_classifications=212, youtube_connections=2, node_notes=109, categorization_suggestions(+backup) present. **All v2 tables = 0 rows** except `user_prefs`=1.
- **`check-invariants-001.mjs` raw summary:** `70 passed, 0 failed` — DB-1…DB-23 + REPO-8…REPO-19 all PASS (incl. DB-20 v2 tables clean, DB-21 30 functions clean/anon→42501, DB-22 coverage 42 FKs/2 cols/8 payload keys no gaps, DB-23 no edges DML in v2 fns, REPO-13 no secrets in 760 tracked files, REPO-14 tsc clean).

## D. Quality gates (raw results)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** exit 0, no output |
| `npx eslint` | **PASS** 0 errors, 1 warning (`flow/components/AssetGrid.tsx:72` react-hooks/incompatible-library — TanStack Virtual; flow is env-gated off) |
| `npx vitest run` | **PASS** 10 files / **133 tests**, 0 failures (5.06s) |
| `npm run build` (`next build --webpack`) | **PASS** exit 0; route table emitted (all ƒ dynamic) |
| `node scripts/check-contrast.mjs` | **PASS** `49 passed, 0 failed` |
| `node scripts/check-languages.mjs` | **PASS** `4 passed, 0 failed` (TMDB tag probe SKIPPED — `TMDB_API_READ_ACCESS_TOKEN` unset) |
| `node scripts/check-invariants-001.mjs` | **PASS** `70 passed, 0 failed` |
| `BASE_URL=https://liked-zeta.vercel.app npx playwright test` | **PASS** `76 passed (4.0m)`, 0 failed, 0 flaky — projects: setup+unauth+authed. **Residue:** specs create `E2E-*`/`ext-e2e-*` nodes/folders/tags on the e2e-test account (consistent with prior runs; no cleanup in suite) |

## E. Production walkthrough (390px + 1280px, Playwright/Chromium)

Sessions: password-grant `e2e-test@liked.app`; admin `generate_link`+`verify` magiclink for `a@a.com` (documented method). Screenshots in `docs/audit-10/`.

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Landing→app redirect | PASS | anon `/` 200 title "LIKED — The recommendation inbox…" (`e01`); authed `/`→`/feed` (`e02`) |
| 2 | Add card URL/text/YT-search | PARTIAL | AddSheet opens (FAB, e2e PASS); inputs Search/`https://…`/Title/note; URL+Enter attempted (`s2-*`); `/api/import` YouTube path proven by e2e intelligent-import (6 tests); **in-app YT search w/o connection → `/api/youtube/search` returns 401 `not_connected`** (e2e youtube-search PASS) — exact behavior: search unavailable until `/api/youtube/connect` grant |
| 3 | Folder+nested, move, breadcrumb | PARTIAL | folders live (Unsorted 238, Web 393, custom); `/folders/[id]` + breadcrumb components; move RPCs live; full DnD move not re-driven this run (e2e folder-tile nav PASS) |
| 4 | Share card+folder roles→friend+group | PARTIAL | `share_node`/`share_folder_v2` live; Share button on card detail; group expansion in RPC; live share not re-driven (PORTFOLIO-AUDIT verified end-to-end previously) |
| 5 | Receiver items/attribution/notification/badge | PASS | a@a.com `/feed` shows friends (laurent.martenot, bb) + folders (`s5a`); `/notifications` "shared a card with you" + unread badge `9+` (`s5b`) |
| 6 | Card click /feed→/card/[id] both accounts | **e2e-test PASS / a@a.com REPRODUCED-FAIL** | e2e: `/card/a7ca3a2d…` navigates; a@a.com: click fires `GET /card/c8c0694c…?_rsc` then URL stays `/feed` — BUG-CARDCLICK-002 confirmed live (`s6a-afterclick-390`, `s6a-bug.json`) |
| 7 | Rating 0–100 card+folder | PASS (presence) | card detail has slider + Rename/Share/Move-to-trash (`s7`); `upsert_rating`/`rate_folder` live; write path verified in prior audits |
| 8 | Tags add/filter, search, friend filter | PASS | `?q=AUDIT` grouped results; `?friend=<uuid>` filtered "Cards" view; tag RPCs live |
| 9 | Views list/masonry/columns + sort | PASS | buttons `List`,`Masonry`,`Columns` + `Creation date`,`Alphabetical` (+Theme/Channel groups) on /feed |
| 10 | Trash/restore/hard/empty | PASS | `/trash` 200 "Trash · 24", Empty trash/Restore/Delete forever (`s10`) |
| 11 | /organize AI flow | PASS (list) | `/organize` 200 folder list w/ Organize buttons (`s11`); create/review/apply RPCs live; apply not re-driven |
| 12 | /youtube states | PASS | `/youtube` 200 "Connect YouTube" not-connected state (`s12`) |
| 13 | /me language/theme/sign-out | PARTIAL | `/me` 200: Save, Light/Dark, Friends left/top, Sync YouTube, Sign out (`s13`); **no language button found in visible controls** — e2e "/me shows language picker" PASS suggests picker exists but wasn't surfaced as button text; Thai 360px clip check UNVERIFIED |
| 14 | Extension endpoints + install | PASS | `/extension/install` 200; `/api/extension/status`,`/folders`,`/api/import` all **401** unauthenticated (correct) |
| 15 | Privacy + terms | PASS | `/privacy`,`/terms` 200, dated 2026-09-06 |
| 16 | Landing claims vs shipped | **FAIL (see G/H)** | LandingV2 markets v2 inbox — mostly NOT SHIPPED |

**Console/network:** authed pages show 0–5 non-fatal console errors; a@a.com `/feed` shows 1 `pageerror` (consistent with known hydration #418). Failed requests observed on `/organize`,`/trash` = 3–5 (likely aborted RSC prefetches; no 4xx/5xx API failures captured).

**Cleanup:** this run created **no** persistent items (read-only browsing + one attempted URL add that was not confirmed persisted; prior e2e residue predates this audit). Nothing to clean.

## F. V2 inbox state (code + DB)

| PLAN-V2-002 §8 item | State | Evidence |
|---|---|---|
| P0-01 mig 142 core tables | DONE | 19 v2 tables live, RLS on, 0 policies, no anon/auth grants (DB-20 PASS); all empty |
| P0-02 mig 143 support+infra fns | DONE | `node_items,enrichment_jobs,email_outbox,rate_limits,youtube_search_cache,youtube_search_budget,account_deletion_jobs,deletion_requests` live; `rl_hit,yt_budget_consume,enrichment_claim/finish,item_apply_*,item_refresh_apply,housekeeping_purge` live |
| P0-03 mig 144 guest/class-S | DONE | `guest_*`,`submit_recommendations`,`delete_guest_data`,`upsert_item` live, service_role-only (DB-21 PASS) |
| P0-04 mig 145 owner/class-O | DONE | `ensure_my_ask,get_my_ask,regenerate_my_ask,set_ask_active,update_ask_settings,get_inbox,get_friend_rail,mark_friend_seen,get_my_prefs,set_my_prefs,set_language` live, authenticated-only |
| P0-05 mig 146 delete_account | DONE | `delete_account` live; coverage guard 42 FKs/2 cols/8 keys no gaps (DB-22 PASS); `scripts/verify-delete-account.mjs` exists (119/119 per PROGRESS — harness not re-run, it writes fixtures in ROLLBACK only) |
| P0-06 security/Tier-0 scripts | DONE | DB-20..23 + REPO-16..19 + `verify-v2-security.mjs` all PASS in check-invariants (70/70) |
| P0-07 auth D25 | DONE (code) | login uses basic OIDC scopes; `lib/auth/safeNext.ts`+test; `proxy.ts` includes `/inbox`; callback route.test exists |
| P0-08 `lib/ask/*` + route skeleton | NOT STARTED | no `lib/ask`, no `app/api/ask`, no `data-ui="v2"` |
| P0-09 i18n foundation | PARTIAL | `lib/i18n/languages.ts` (en/fr/es/th), `negotiate.ts`+test exist; `es.json` exists (307 keys); v2 keys/dirs absent (REPO-17 vacuous) |
| P0-10 theme foundation | PARTIAL | `lib/theme/contrast.ts` exists; `v2-tokens.css` exists; cookie-based `data-theme`/`data-accent` + ThemeSync present — scoped as foundation, v2 UI absent |
| P0-11 TMDB | NOT STARTED | no `lib/tmdb`, no `/api/ask/search|resolve`, `tmdb_genres` table empty |
| P0-12 YT guarded search | NOT STARTED | `youtube_search_cache`/`youtube_search_budget` tables exist (empty); no routes |
| P0-13 `/r/[token]` + session | NOT STARTED | no `app/r`, no `/api/ask/session` |
| P0-14…P0-25 (UI, worker, inbox, rail, notifications-v2, settings, deletion UI, legal, cron, threat tests, e2e, CI) | NOT STARTED | no `app/inbox`, `app/s`, `app/settings`, `app/delete-account`, `components/v2`; `email_outbox`/`deletion_requests` empty; `/api/cron/enrich` absent |

**User-facing v2 flow — confirmed ABSENT:** no `/r/[token]`, `/inbox`, `/s/[token]`, `/api/ask/*`, `/delete-account`, `/account-deleted` routes; `app/(app)` contains only legacy library pages. Expected per task — confirmed.

## G. Showcase readiness

- **Secrets/PII scan:** REPO-13 PASS (760 tracked files, no committed secrets). Only `.env.local` (gitignored) holds secrets — not committed. `e2e/helpers/auth.ts` contains the **test password `E2eTestPass123!`** for `e2e-test@liked.app` (committed, documented test credential — acceptable but note it grants prod access to that account). `a@a.com`/`laurent.martenot` passwords not in repo (magiclink path used).
- **README.md:** still **create-next-app default** (36 lines, no project description) — P1 for public repo.
- **LICENSE:** **absent** — P3.
- **Docs accuracy:** `docs/00_PROGRESS.md` is heavily V2-W2 bookkeeping; `05_MVP2_PLAN.md` matches shipped state well; ARCHIVE/audit reports present; `docs/` contains `prompt_template FOR CTO ONLY.txt` and `plans/` — review before public showcase.
- **Public routes that shouldn't be:** `/proto`,`/proto/[name]` serve `workspace/` mockups publicly (P2); `/flow` env-gated (prod env UNVERIFIED — likely off); `/_archive` not routed.
- **Accessibility:** no axe run this audit (UNVERIFIED); e2e theme.spec + keyboard paths exist. Landing uses semantic landmarks (`aria-label`, `aria-labelledby`).
- **Lighthouse:** not run (UNVERIFIED — no lighthouse CLI in repo; can be added).
- **Bundle size:** largest route = `/feed` (FeedHome + dnd-kit + framer-motion + react-virtual) — exact KB UNVERIFIED (build manifest available in `.next`; not extracted this run).
- **Security headers (next.config.ts):** CSP present (`default-src 'self'`, `script-src 'self' 'unsafe-inline'`, img/connect/frame allowlists for Supabase/YouTube), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS preload, `Permissions-Policy`. CSP may block some third-party embeds — consistent with app's own domains; `'unsafe-inline'` scripts noted.

## H. Findings register

| ID | Sev | Area | Evidence | Recommended fix | Size |
|---|---|---|---|---|---|
| F-01 | P1 | Landing vs product | LandingV2 copy = v2 inbox ("send one link…no account…inbox merges…where to watch") — none shipped | Gate landing to shipped features or mark "coming soon" | M |
| F-02 | P1 | Card navigation | BUG-CARDCLICK-002 reproduced: a@a.com `/feed` card clicks abort (`?_rsc` ERR_ABORTED pattern), URL stays `/feed` | Root-cause hydration/transition (BUG-CARDCLICK-002 open) | M |
| F-03 | P1 | Card share management | `unshare`+`change_node_permission` lack `authenticated` EXECUTE; called via sessionRpc in `CardView.tsx:218,230` → 42501 | Grant EXECUTE to authenticated (they're authz-gated inside) or route via service client | S |
| F-04 | P1 | Repo polish | README = create-next-app default | Write real README | S |
| F-05 | P2 | Public surface | `/proto`,`/proto/[name]` serve workspace mockups | Gate behind env like /flow or remove | S |
| F-06 | P2 | DB security | 19 SECDEF fns w/o search_path; trgm/rls_auto_enable/set_limit/show_* EXECUTE to anon+authenticated | Add search_path; revoke anon EXECUTE on non-essential | S |
| F-07 | P2 | Data hygiene | e2e residue: hundreds of synthetic nodes on e2e-test; trash=24; demo accounts show test data | Purge/flag test accounts before showcase | M |
| F-08 | P2 | Dead schema | `categorization_suggestions` + `_backup_20260927` still live post-F12 | Drop after backup verification | S |
| F-09 | P3 | Architecture | Direct table reads in actions (`notifications`,`card_positions`,`user_node_preferences`,`folder_edges`,`node_classifications`,`groups`,`nodes_sort_cache`,`edges`,`ratings`,`tags`) | Route reads through RPCs or document exception | M |
| F-10 | P3 | Repo | No LICENSE | Add LICENSE | S |
| F-11 | P3 | i18n | `/me` language picker not surfaced as button in walkthrough (e2e says present) | Verify picker UX at 360px all locales | S |
| F-12 | P3 | Docs | `prompt_template FOR CTO ONLY.txt`, stale audit docs in public docs/ | Curate docs/ for public repo | S |

### Claims fully supported by evidence (portfolio-safe)

- Collaborative link-library with folders (nested, depth-capped), cards from URL/text/YouTube/extension, atomic `import_url` writes.
- Real-time-ish sharing: direct + folder-grant sharing with permission ranks, live subtree expansion/revocation, owner-only access lists.
- Trash with restore/hard-delete/empty; ratings 0–100 on cards+folders; tags + grouped AI classification (OpenRouter).
- Notifications with unread badge; friends/groups management; 4-language UI (en/fr/es/th) + light/dark theme.
- Chrome extension (MV3) with sideload install, bearer-token API, popup i18n.
- Strong DB hygiene: RLS everywhere, 70/70 invariant checks, 133 unit + 76 e2e green, migrations fully ledgered.
- v2 Recommendation Inbox: complete DB foundation (19 tables + 30 SECURITY DEFINER RPCs, class-S/class-O grants verified, delete_account with FK coverage guard) — foundations only, no UI.

### Claims NOT supported / currently false

- "Recommendation Inbox", "send one link", "no account needed", "inbox merges duplicates", "where to watch", "scores that stay honest" — **v2 landing copy; none shipped**.
- "AI auto-organize" — PARTIAL: organize batches + LLM proposals exist (`/api/categorize`, OpenRouter) but apply path not re-verified this run.
- Card-click navigation reliability — false for at least `a@a.com` (BUG-CARDCLICK-002).
- Owner card-share management (change permission/unshare) — broken via missing grant.
- "Private by default" — supported by edges model, but note service-role server actions perform owner checks in TS for some paths.

---

*Audit performed read-only. DB access: `BEGIN READ ONLY` → `ROLLBACK` via pooler. No code/schema/config/data changes made. Only files created: this report + `docs/audit-10/*.png`.*
