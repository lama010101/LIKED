# COMPLETE-APP-001 — Vision-Gap Audit + Execution Plan

**Date:** 2026-09-23 · **Author:** Devin (executor) · **Status:** STEP 1 plan — awaiting `APPROVED COMPLETE-APP-001`
**Method:** repo + live-DB (`lzkzfqshnjvlzosnntfx` via direct `pg` + PostgREST service-role probes) + Vercel MCP + live HTTP probes. Doc claims verified against evidence; evidence wins.

---

## 0. Baseline (verbatim tails)

- **git:** `HEAD = origin/main = 88d16d8` ("fix(categorize): PHASE5-N4-HARDEN-001"). Working tree clean except untracked `app/prototype/`, `public/prototype/` (N11 — parked, untouched).
- **tsc --noEmit:** exit 0, 0 errors.
- **eslint:** exit 0, 0 errors / 0 warnings.
- **vitest:** `Test Files 4 passed (4) · Tests 79 passed (79)` — 22.77s.
- **check-invariants-001.mjs (live DB):** `16 passed, 0 failed` (DB-1..7, DB-15/16, REPO-8..14).
- **prod deploy:** `dpl_CrgG2eE8CyiKTHkmyFW6GYy9w5SQ` READY @ `88d16d8` → `liked-zeta.vercel.app` (git-deploy works).
- **live HTTP:** `/` 200 · `/login` 200 · `/signup` 200 · `/extension/install` 200 · `/extension/auth` 200 · `/privacy` 200 · `/terms` 200 · `/prototype` 404 · `/feed` `/social` `/youtube` `/trash` → 307 `/login` · `GET /api/youtube/status` `/api/extension/folders` `/api/extension/tags` → 401 · `POST /api/categorize` unauth → 401.
- **live DB snapshot:** 20 users · 303 live nodes · 585 edges (all `permission='view'`) · 447 causes (307 import / 140 direct_share) · 56 folders (37 is_project) · 6 groups / 22 members · 4 friend_invites · 10 `categorization_suggestions` pending · extensions: pg_trgm ✓, **pgvector ✗** · auth.identities: 7 email + 2 google · ledger: numeric migrations through **105** + 4 timestamped (next sequential = **106**).
- **Vercel env (`liked` project) — names only:** present = `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `YOUTUBE_TOKEN_ENCRYPTION_KEY`; stale leftovers = `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PASSWORD`, `SUPABASE_JWT_SECRET`, `SUPABASE_PUBLISHABLE_KEY` (all integration-owned, `configurationId icfg_94afBdMaPAwx5g5nNISXklPK`); **MISSING = `NEXT_PUBLIC_APP_URL`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_EXTENSION_ID`, `NEXT_PUBLIC_CHROME_WEBSTORE_URL`** (last one optional per EXT-ONE-CLICK).

---

## A. Vision-Gap Matrix (V1–V17 + extras)

| # | Item | Status | Evidence | Authoritative spec? |
|---|------|--------|----------|--------------------|
| V1 | Google-only signup → immediate YT import "wow" | **partial** | Google-only auth live: `app/(auth)/login/page.tsx:29-41` + `signup/page.tsx:19-23` — `signInWithOAuth` w/ `youtube.readonly` + `access_type=offline`/`prompt=consent`; email/password deleted (`b96f3db`). Callback persists provider tokens → `youtube_connections` (`app/(auth)/callback/route.ts:73-82`). **No immediate import:** callback redirects to `/feed` (`route.ts:23,95`); zero `onboard*` matches in app code; `users` has no onboarding flag (cols: id, display_name, normalized_display_name, language_code, avatar_key, username_changed_at, avatar_change_count_today, avatar_last_reset_date, created_at). | §41.2 yes; §41.4 via N3 |
| V2 | Reduced-v1 onboarding (OAuth → background import → folder-from-likes CTA) | **absent — spec'd FINAL** | Nothing built: no first-login detection, no auto-import, no CTA. All primitives exist: `importYouTubeActivity` action, `/api/youtube/likes` paging, `create_folder_with_nodes` + `get_or_create_named_folder` RPCs live (pg_proc). | **YES** — `NEEDS-SPEC-N3` RULING (Option B approved final); deps N1 ✓ shipped |
| V3 | Share-one-folder-with-one-friend at onboarding end | **deferred by ruling** | N3 RULING: "remaining §41.4 steps are deferred, not cut". `share_folder` RPC live (p_permission view/contribute/edit/admin). | Deferred — no build authorization; fold into Lane B full-onboarding spec |
| V4 | In-app YouTube search → add to chosen folder | **verified-live** | `GET /api/youtube/search` + `searchYouTubeVideos` (`8ed95d8`); `AddCardSheet` 'youtube' chip; N12 `targetFolderId` → `import_url.p_folder_id` (`8a1f559`); e2e `youtube-search.spec.ts`. | YT-SEARCH-001 + N12 ruling — shipped |
| V5 | YT likes bulk import + progress | **verified-live** | `YouTubeImportDialog` + "Import All" button (`app/(app)/youtube/page.tsx:272-295`), sequential `importYouTubeActivity` loop w/ live progress/cancel (YT-BULK-IMPORT). | Build-plan/PRD §41.3 implicit — shipped |
| V6 | LLM categorization Phase B + review gate (likes-only) | **implemented; prod-broken (env)** | `POST /api/categorize` (auth, likes-only ≤10 batch) → `lib/ai/openrouter.ts` → `categorization_suggestions` (mig 105; **10 pending rows live**). `CategorizePanel` mounted `app/(app)/youtube/page.tsx:331`, reachable: `Sidebar.tsx:289` (Library→YouTube) + `ProfileModal` "YouTube Activity". Accept → existing `get_or_create_named_folder`+`add_node_to_folder`+`createOrGetTag`+`addTagToNode` (review-gate holds — writes only on accept). **Prod gap:** `OPENROUTER_API_KEY` absent on Vercel → `/api/categorize` → 503 in prod. | N4 ruling + PHASE5 provider swap — shipped, env gap |
| V7 | Keyword/tag search (stage 1, §33.5) | **verified-live** | Live PostgREST probes (service role): `get_feed {p_search_query:'music'}` → 5 rows; `{'the'}` → 4 filtered rows. UI: `AppHeader` search pill → `useSearchController` → `filterStore.searchQuery` → `get_feed`. pg_trgm GIN indexes live. Doc drift only: 06 §9 says `search_nodes` (dropped by mig 095 — now via `p_search_query`). | §33.5 + 04 spec — shipped |
| V8 | Semantic/AI search over own + friend-shared content | **absent — deferred** | §41.6 explicit deferral; no pgvector ext; no embedding columns. | No spec → **Lane B** |
| V9 | Extension vs 06 PRD §15 | **partial — P0 shipped, prod-unusable** | P0: save URL ✓, metadata via edge-fn path in `/api/import` ✓, auth relay ✓, save confirmation ✓, collection select ✓, tag chips + new tags ✓, note ✓, dup → "Already saved — Open in LIKED" ✓ (`popup.ts`). P1: multi-collections ✗ (single `<select>`), recently-saved ✗, dup-merge ✗, bulk org ✗. P2: none (correct). **Defects:** (a) `manifest.json` `host_permissions`/`externally_connectable` + `service-worker.ts` `ALLOWED_ORIGINS` list `https://liked.app` — **not a project domain** (Vercel domains: liked-zeta.vercel.app + 2 auto) — prod origin absent → pairing impossible; (b) `tabs` permission violates §19 minimal set (unproven need — `chrome.tabs.query` active-tab fields are populated under `activeTab` gesture; `tabs.create` needs no perm); (c) `public/liked-extension.zip` stale (Aug 27 — predates AUDIT-07/08 session hardening; baked `LIKED_API_URL=localhost`); (d) `NEXT_PUBLIC_EXTENSION_ID` unset → relay page hard-errors (no stable ID without manifest `key`/Web Store). | 06 PRD authoritative; §19/§20 give criteria → defects Lane A, P1/P2 features Lane B |
| V10 | Extension AI-suggested tags | **absent — open question** | 06 §24 Q4 explicitly open; §11 P2. | No decision → **Lane B** |
| V11 | Folder metadata rail (avg rating + access avatars + View all) | **partial — unblocked now** | N6 shipped click-to-filter chips (`FoldersStrip.tsx` — chips only). Metadata half absent: no `get_folder_access_users`/`get_group_access_users` usage anywhere in `components/`. RPCs now live (mig 103). PRD §16.4 spec's the access-avatar row + friend-highlight on selection. | §16.4 + N6 ruling ("rich chip waits on N7" — N7 resolved) → **Lane A** |
| V12 | Collaborative folders/mood-boards (multi-user add) | **partial — permissive DB, zero UI, unenforced perms** | DB: `add_node_to_folder` allows write where `folder_is_accessible` — includes **view-level** recipients (direct_share folder edge OR edge on any contained node); `move_node_to_folder` stricter (owner/folder_admin). `has_folder_permission`/`get_folder_permission` rank model (view<comment<contribute<edit<reshare<admin>) exists but **not enforced on any write path**; all 585 live edges are `permission='view'`. UI: `get_user_folders` returns `owner_id` only → pickers/sidebar show own folders only; no surface lists shared folders as collections. | Permission semantics undecided → **Lane B** |
| V13 | Pinterest-board UI vs V2 shell; N11 prototype | **partial** | V2 shell live (Sidebar/AppHeader/StoriesBar/FeedControlsBar/VideoCard — UIX-PORT-01..14). Prototype parked untracked (`app/prototype/` + 30 images), N11 triage default = delete, awaiting owner. | Direction is product call → **Lane B** (spec) + Lane C (N11 decision) |
| V14 | Multi-dimensional rating | **absent — deferred** | §41.6 deferral; `ratings` is single 0–10 numeric + `nodes_sort_cache.avg_rating`. | No spec → **Lane B** |
| V15 | Teacher→students / B2B sharing | **covered, zero new code** | `groups`+`group_members` (6/22 live) + `create_group` + `share_folder` + `group_share` + admin RPCs all live+gated. Teacher: create group → add students → `share_folder` → students see cards via edges. Caveat: recipients get feed visibility, not a navigable shared-folder surface (→V12). | Evidence-based yes |
| V16 | Production health | **degraded features** | Deploy current/READY; all routes probe correctly (see §0). **Missing envs:** `NEXT_PUBLIC_APP_URL` → `/api/youtube/connect` builds `redirect_uri=http://localhost:3000/api/youtube/callback` (`connect/route.ts:15,37`) → **prod YouTube connect broken**; `OPENROUTER_API_KEY` → prod categorize 503; `NEXT_PUBLIC_EXTENSION_ID` → relay page errors. Consent-screen mode not API-checkable → Lane C. | Ops fixes → **Lane A** |
| V17 | Residual hygiene | **open owner items + 1 doc fix** | PR refs `refs/pull/*` retain purged JWTs (not push-deletable — owner/GitHub support). `D:/liked-pre-purge-mirror.git` exists (dead creds — owner disposition). `00_PROGRESS.md` CURRENT STATUS header stale: says "Remaining work is NEEDS-SPEC only (12 items pending spec)" + last task = EXEC-READY-001 — but N1/N4/N6/N7/N8/N9/N10/N12 + PHASE5 all landed since. | Header fix mechanical → **Lane A**; rest Lane C |

### Extra gaps found (§3.3)

- **G1 (V16 dup)** `NEXT_PUBLIC_APP_URL` missing → prod YT OAuth connect broken.
- **G2 (V16 dup)** `OPENROUTER_API_KEY` missing → prod categorize 503.
- **G3 (V9 dup)** Extension prod pairing impossible (wrong origin + stale zip + no stable ID).
- **G4 — scope mismatch bug:** unified signup grant requests `youtube.readonly` (`login/page.tsx:35`), but `/api/youtube/connect` requests full `youtube` scope (`connect/route.ts:39`) — Unlike/Unsubscribe buttons (`youtube/page.tsx` DELETE handlers) need write scope → a unified-grant user sees working-looking buttons that Google will 403. Either downgrade UI when scope=readonly or escalate scope. **Needs product decision → logged; if Lane A ONBOARD-001 touches auth copy, note it; fix itself → Lane B spec (scope model is a product/security call).**
- **G5 — FAB dead ends:** Template + Tag speed-dial actions → `showToast.info('Coming soon')` (`layout.tsx:354`). Both spec'd: §11.3d Template Picker (4 named presets, atomic create) and §11.3b Tag Mode (6-step spec). → **Lane A.**
- **G6 — §17.2 multi-select stubs:** `SelectionOverlay.tsx:255` — `moveToFolder`/`addToFolder`/`edit` → "coming soon" toast; `moveToTrash` on folders/groups → "not yet wired" toast (`:71-74`). `FolderTreePicker` (move+copy modes) and `RenameFolderModal` already exist; `delete_folder` RPC live (owner/admin soft-delete); **no `delete_group` RPC** (groups table has `deleted_at`). → **Lane A** (spec §17.2; one new RPC).
- **G7 — HorizView stub grouping:** `HorizView.tsx:46-51` groups by `folderColor` proxy instead of real sub-folder (AUDIT-01/M4, deferred). §11.2D spec'd. Needs a read-only membership RPC (folder_edges read) — no `get_feed` change → **Lane A.**
- **G8 — `nodes.source_meta` absent:** 05 plan §C.2 spec'd `source_meta` JSONB (video_id, channel_id, channel_name, site_name, published_at); column never created; `import_url` has no such param. → **Lane A** (spec'd; low consumer value now — flag).
- **G9 — dead RPCs live:** `get_visible_nodes` ×2 overloads + `get_nodes_in_folder` have zero TS callers (feed = `get_feed` only, REPO-8 green); `search_nodes` dropped live (095) but still declared in `lib/types/database.ts:855`. → **Lane A hygiene** (drop RPCs + prune type defs), conditional on zero-caller grep re-proof at execution.
- **G10 — stale Vercel envs:** POSTGRES_*/SUPABASE_JWT_SECRET/SUPABASE_PUBLISHABLE_KEY re-created by Supabase integration `icfg_94afBdMaPAwx5g5nNISXklPK` after DEPLOY-01 deletion → Lane C (integration disconnect decision).
- **G11 — 64 nodes `node_type` NULL:** pre-098 junk rows left NULL intentionally (CHECK allows NULL); writes now require `p_node_type`. Known state, no action.
- **G12 — deferred-untouched (out of scope, listed per instructions):** follow model/activity feed, Takeout/Maps likes, chat (§28/§40/P13), two-way YT sync, comments import (N2 → Takeout), ranked-list (N5), public boards.

---

## B. LANE A — EXECUTE (after `APPROVED COMPLETE-APP-001`)

All migrations provisional-numbered; verify live max at execution (expected next = **106**). Every migration applies via `scripts/apply-migration.mjs` + `schema_migrations` record + verbatim `pg_proc`/`information_schema`/`pg_policies` proof.

### A1 · ENV-001 — Vercel env wiring (ops, zero code risk)
- **Spec basis:** restores already-approved shipped features (YT-OAUTH-FULL-EXEC env list, PHASE5-N4, extension §19 auth relay).
- **Actions:** Vercel API/MCP — set `NEXT_PUBLIC_APP_URL=https://liked-zeta.vercel.app` (prod+preview+dev), `OPENROUTER_API_KEY` (value read from `.env.local`, piped to API — never printed/committed), `NEXT_PUBLIC_EXTENSION_ID` (value from A2 manifest `key`; done after A2).
- **Verify:** `GET /api/youtube/connect` authed-probe → 302 with `redirect_uri=https://liked-zeta.vercel.app/...`; prod `/api/categorize` authed → non-503; relay page no longer shows env error.
- **Commit:** none (config only) — report evidence.

### A2 · EXT-PROD-001 — extension production pairing + permission minimization
- **Spec:** 06 §19 (HTTPS to LIKED backend; minimal permissions) + §20 contract; fixes V9 defects (a)-(d).
- **Changes:** `extension/manifest.json` — add `https://liked-zeta.vercel.app/*` to `host_permissions` + `externally_connectable`, drop `tabs` permission, add pinned `"key"` (generated RSA-2048 pubkey → stable extension ID for unpacked installs); `service-worker.ts` `ALLOWED_ORIGINS += https://liked-zeta.vercel.app`; rebuild `dist` with `LIKED_API_URL=https://liked-zeta.vercel.app`; `npm run zip:extension` → commit `public/liked-extension.zip`; then A1 sets `NEXT_PUBLIC_EXTENSION_ID`.
- **Tier-0 risk:** none (extension writes nothing; API unchanged).
- **Tests:** existing `extension-api`/`extension-install`/`extension-auth` e2e stay green; grep proof: prod origin present, `tabs` absent, no secrets in dist.
- **Lane C residue:** generated private key custody + Web Store publish decision.

### A3 · HYGIENE-001 — dead RPC drop + type pruning
- **Spec:** migration-safety invariant (old logic must be removed/unreachable); SWEEP-01 precedent (mig 095).
- **Migration 106:** `DROP FUNCTION get_visible_nodes(uuid,boolean)`, `get_visible_nodes(uuid,text,text,text)`, `get_nodes_in_folder` — **only after fresh grep re-proves zero callers** (repo + extension + scripts). Prune `database.ts` defs for those + `search_nodes`.
- **Tier-0 risk:** low — all dead; conditional abort if any caller appears.
- **Checks:** none new; `check-invariants` REPO-8 unaffected.

### A4 · ONBOARD-001 — reduced-v1 onboarding (N3 FINAL ruling)
- **Spec:** `NEEDS-SPEC-N3` RULING — OAuth (done) → background liked-videos import → single dismissible "create folder from your likes" CTA; remaining §41.4 steps stay deferred.
- **Migration 107:** `users.onboarding_imported_at timestamptz` + `users.onboarding_dismissed_at timestamptz` (both NULL default); gated RPC `complete_onboarding_step(p_user_id, p_step text)` or two thin set-RPCs (094-pattern authz, authenticated-exec, service bypass) — keeps writes RPC-mediated.
- **App:** feed/(app) shell detects new user (`youtube_connections` active + `onboarding_imported_at IS NULL` + `onboarding_dismissed_at IS NULL`) → fires existing client-side import loop (`/api/youtube/likes` pages → `importYouTubeActivity`, reusing YT-BULK-IMPORT pattern, non-blocking) → marks `onboarding_imported_at` → renders CTA card on feed → CTA accept groups imported videos by their YouTube-category **tag** (categoryId→name already stored as tag at import; `source_meta` absent) → per-group `create_folder_with_nodes` (atomic RPC, live) → dismiss writes `onboarding_dismissed_at`.
- **Tier-0 risk:** writes reuse existing atomic RPCs; no feed/visibility logic; CTA is read+write-orchestration only.
- **Tests:** vitest for detector predicates; e2e: onboarding CTA visible→accept→folder exists / dismiss persists (injected session + mocked likes route pattern per existing specs).
- **Risk/rollback:** real node creation for real new users (intended). Rollback = remove detection branch; imported nodes are legitimate user data, keep.
- **Escalation trigger:** if CTA copy/grouping granularity needs product call mid-build → move to Lane B with finding.

### A5 · ACCESS-RAIL-001 — §16.4 friends-with-access surface
- **Spec:** PRD §16.4 verbatim — on folder/group selection: highlight friends-with-access on the rail + scrollable access-avatar row + "View all". N7 RPCs live: `get_folder_access_users(p_folder_id, p_requester_id)`, `get_group_access_users(p_group_id)`.
- **Changes:** new `components/bars/AccessStrip.tsx` (mounted in `(app)/layout.tsx`, renders when `folderId`/`groupId` context active; fetch via new thin server actions `app/lib/actions/access.ts`); highlight pass on `StoriesBar` items (ring state from access set); "View all" opens existing `FriendManagerModal`-adjacent list (simplest: popover listing all).
- **Tier-0 risk:** read-only RPCs; no feed logic; no new state source (server-driven per context).
- **Tests:** e2e — share folder to friend → access avatars render on select; unit-none (presentation).
- **Risk:** low; additive UI only. If §16.4's "highlight" semantics prove ambiguous for groups → implement folder branch, report group finding.

### A6 · SEL-MENU-001 — finish §17.2 multi-select actions
- **Spec:** PRD §17.2 table verbatim.
- **Changes:** `SelectionOverlay.tsx` — `moveToFolder`/`addToFolder` → open existing `FolderTreePicker` (move/copy modes exist, wired to `dndMoveNodeToFolder`/`dndAddNodeToFolder` actions); `edit` (single selection) → node: open `CardDetailSheet` (title edit exists) / folder: `RenameFolderModal`; `moveToTrash` on folders → `delete_folder` RPC via server action; groups → **migration 108 `delete_group(p_group_id)`** (owner/group_admin soft-delete, authz-gated, exec-scoped like 094 pattern).
- **Tier-0 risk:** `delete_group` must be soft-delete only, preserve causes/edges (invariant DB-4 pattern); add invariant check DB-17 (groups soft-delete preserves related rows) — actually assert RPC exists+SECURITY DEFINER+gated.
- **Tests:** e2e multi-select move/add/edit/trash paths where test-user data allows.

### A7 · TEMPLATE-001 — §11.3d Template Picker + §11.3b Tag Mode
- **Spec:** §11.3d verbatim (4 presets: Read Later, Watch List, Trip Planner [+3 subfolders], Book Notes; optional name input; "Creates the folder/card structure atomically"); §11.3b verbatim (Tag Pill + half-sheet, tap-to-tag, mutual exclusivity w/ multi-select).
- **Migration 109:** `create_folder_template(p_user_id, p_template_key text, p_name text)` — atomic: parent + subfolders + folder_tree in one tx (extends `create_folder_with_nodes` pattern; node_ids empty for presets).
- **Changes:** `components/sheets/TemplatePickerSheet.tsx` new; `layout.tsx` onAction 'template' → open sheet; 'tag' → `uiStore.tagMode` + `TagModeBar`/`TagSheet` (new components); card tap interception while tagMode active → `addTagToNodeAction` (existing) + 150ms accent-ring flash; multi-select exclusivity guard.
- **Tier-0 risk:** tag/folder writes via existing RPCs; new template RPC gated.
- **Tests:** e2e — template creates folder structure; tag mode applies tag on card tap + exits on ×.

### A8 · HORIZ-001 — §11.2D real sub-folder grouping
- **Spec:** §11.2D (Netflix rows grouped by sub-folder).
- **Migration 110:** read-only RPC `get_folder_memberships(p_user_id, p_folder_id)` → `{node_id, folder_id(child)}[]` for direct children (094-gated, authenticated). `HorizView.tsx`: replace `folderColor` proxy with real membership map (fetched alongside feed, passed as prop — grouping is presentation of SQL-returned rows; **no get_feed change, no filter/sort in TS**).
- **Tier-0 risk:** read-only; FEED LOCK respected (feed rows/order untouched).
- **Tests:** e2e horiz view inside folder w/ subfolders shows named group headers.

### A9 · SOURCE-META-001 — `nodes.source_meta` (05 plan §C.2)
- **Spec:** 05 §C.2 — `source_meta` JSONB (video_id, channel_id, channel_name, site_name, published_at).
- **Migration 111:** `ALTER TABLE nodes ADD COLUMN source_meta jsonb`; extend `import_url` + `create_node_with_metadata` with `p_source_meta jsonb DEFAULT NULL` (single overload each — drop old); callers pass through (`/api/import` client_metadata subset; `youtubeImport` sends video_id/channel/category fields).
- **Tier-0 risk:** write-path signature churn (mitigated: single overload, all callers updated, e2e import suite green); **checkpoint:** if RPC re-signature proves incompatible with deployed clients mid-execution, keep additive-only.
- **Value flag:** no current consumer — lands as spec'd source-of-truth column.

### A10 · PROGRESS-001 — tracker refresh (end of batch)
- Update `00_PROGRESS.md` CURRENT STATUS (last task, phase, gates) + COMPLETE-APP-001 log section; amend stale "NEEDS-SPEC only" claim. Doc-only.

**Estimated commits:** plan doc (1) + A2 (1-2) + A3 (1) + A4 (2-3) + A5 (1-2) + A6 (1-2) + A7 (2) + A8 (1) + A9 (1-2) + A10 (1) ≈ **13-16 commits**, order: plan → A3 → A2 → A1 → A4 → A5 → A6 → A7 → A8 → A9 → A10. Push = credential-manager HTTPS fast-forward; **stop+report if force-push needed.**

---

## C. LANE B — SPEC-FIRST (docs written in STEP 2; no code)

| Spec doc (to write) | Covers | Required content |
|---|---|---|
| `docs/specs/SPEC-V8-SEMANTIC-SEARCH.md` | V8 | Embedding provider options ≥2 (Supabase **pgvector** + edge-fn embeddings vs external vector store); visibility-respecting retrieval: candidate set = edge-visible node_ids **inside SQL** (never post-filter; no new visibility path — friend-shared content is already edge rows); write-path embedding trigger options (import-time vs batch); cost: pgvector free-tier, embedding API quotas verified from live provider docs; open product questions. |
| `docs/specs/SPEC-V12-COLLABORATIVE-BOARDS.md` | V12 | Current state evidence (above); options: (a) enforce `has_folder_permission` ranks on `add/move/remove_node_from_folder` (view≠contribute), (b) shared-folder read model (folders list needs non-owner scope — new RPC, since `get_user_folders` is owner-only), (c) mood-board surface design; data-model impact (none vs folder_members table); Tier-0 analysis (folder_edges exemption interplay, visibility=edges stays read-side only). |
| `docs/specs/SPEC-V13-UI-DIRECTION.md` | V13 + N11 input | Pinterest pin-grid as 6th view mode vs `/prototype` ship vs delete; UIX-PORT V2 alignment; N11 disposition input for owner. |
| `docs/specs/SPEC-V10-EXT-AI-TAGS.md` | V10 + 06 §24 Q4 | Server-side suggestion endpoint (reuse `lib/ai/openrouter.ts`, review-before-write — suggestions as hints only); popup UX; quota (free-tier 50/day bound); P0-vs-P2 placement decision. |
| `docs/specs/SPEC-V14-MULTIDIM-RATINGS.md` | V14 | Dimension model options (fixed dims vs free axes); `ratings` schema impact + `nodes_sort_cache.avg_rating` semantics; sort/`highest_rated` implications. |
| `docs/specs/SPEC-EXT-OPEN-QUESTIONS.md` | 06 §24 Q1/Q2/Q3/Q5 | Formalize answers already embodied by impl (Q1 select-only, Q2 no-merge/Open-in-LIKED, Q3 blank note, Q5 canonical watch-URL) → PRD amendment text. Q4 covered by V10 spec; Q6 resolved (one note/node/user — migration 065 UNIQUE). |
| `docs/specs/SPEC-ONBOARDING-FULL.md` | §41.4 steps 3-6 + V3 | Template catalog decision ("Funny videos"/"Music"/"Movies & TV" + TBD), pre-population matching (N4 output vs categoryId), share-one-friend step placement — beyond N3 reduced-v1. |
| `docs/specs/SPEC-YT-SCOPE-MODEL.md` | G4 | readonly-vs-full `youtube` scope: one-grant-full-scope vs two-tier (readonly at signup, escalate for Unlike/Unsub) — consent-screen friction vs capability; recommendation. |

## D. LANE C — OWNER ACTIONS (no code can do these)

1. **Google Cloud Console** — verify OAuth consent screen mode (Testing→Production) + verification status for sensitive scopes (`youtube.readonly`, `youtube`); confirm redirect URIs: `https://lzkzfqshnjvlzosnntfx.supabase.co/auth/v1/callback`, `https://liked-zeta.vercel.app/api/youtube/callback`, `http://localhost:3001/api/youtube/callback`. (Testing mode = 100-test-user cap + 7-day refresh-token expiry — material to onboarding.)
2. **Supabase Auth** — Site URL = `https://liked-zeta.vercel.app`; redirect URLs include `https://liked-zeta.vercel.app/callback` (+ wildcard). Verify only.
3. **GitHub** — `refs/pull/*` still serve objects containing purged JWTs: file a GitHub support request to dereference+GC, or accept (creds are dead — legacy keys disabled 2026-08-25).
4. **`D:/liked-pre-purge-mirror.git`** — decide disposition (delete vs offline-archive; contains dead creds).
5. **Chrome Web Store** — publish decision (enables `NEXT_PUBLIC_CHROME_WEBSTORE_URL` flow + managed extension ID); take custody of extension signing private key generated in A2 (file path will be reported — never committed).
6. **Vercel ↔ Supabase integration** `icfg_94afBdMaPAwx5g5nNISXklPK` — it re-created `POSTGRES_*`/`SUPABASE_JWT_SECRET`/`SUPABASE_PUBLISHABLE_KEY` after DEPLOY-01 cleanup; disconnect or accept.
7. **YouTube Data API quota** — confirm project quota (default 10k units/day) vs bulk-import volume expectation.

## E. Risks (Lane A items that could affect live users)

| Item | Risk | Rollback |
|---|---|---|
| A4 onboarding | Auto-import writes real nodes for new signups (intended); large like-counts → long client loop | Remove detection branch; nodes are user-legit data — keep |
| A2 manifest | `key` pin changes extension ID → existing unpacked installs need re-auth (session re-pair) | Re-ship old zip; ID churn is one-time |
| A3 dead RPCs | If grep misses a caller (scripts/e2e) → runtime 404 | Conditional abort at execution; restore from migration text |
| A6 `delete_group` | New write path | Soft-delete only; revoke exec if misbehaving |
| A9 `import_url` re-signature | Extension/old clients calling old signature break until zip updated | Ship A2 first (zip rebuild); keep param `DEFAULT NULL` |
| A5/A7/A8 UI | Additive UI; worst case = visual noise | Feature is removable without data loss |

## F. Execution order (dependency-sorted)

1. `docs/plans/COMPLETE-APP-001-PLAN.md` (this commit)
2. A3 dead-RPC hygiene (clears ground)
3. A2 extension manifest/zip → A1 Vercel envs (needs ext ID) 
4. A4 onboarding (flagship)
5. A5 access rail
6. A6 multi-select completion (+`delete_group`)
7. A7 template picker + tag mode
8. A8 HorizView grouping
9. A9 source_meta
10. Lane B spec docs (all, docs-only commits)
11. A10 progress update + final report

**STEP 2 begins only on `APPROVED COMPLETE-APP-001`.**
