# PLAN-CLASSIFY-001 — Itemized classification of remaining v1 work

**Reconstructed:** 2026-09-21 (EXEC-READY-001)
**Method:** The original PLAN-CLASSIFY-001 itemized list was never persisted; this
document rebuilds it by re-running the same classification method — live DB probe via
direct `pg` connection (`.env.local`, project `lzkzfqshnjvlzosnntfx`) plus repo greps —
and pins the 12 NEEDS-SPEC items to the verbatim list recorded in
`docs/00_PROGRESS.md` (PLAN-CLASSIFY-001 entry, 2026-09-18).

**Legend**
- `READY` — spec'd or mechanical; no product decision required. Executable now.
- `NEEDS-SPEC` — requires a written spec reviewed by Lolo/Claude before any code.
- **Tier** (READY only): `0` = hard architectural invariant, requires machine-checked
  script proof · `1` = strong default (existing conventions), deviation needs stated
  reason · `2` = full discretion.

## READY — 12 items

| # | Item | Description | Tier | State at reconstruction (evidence) |
|---|------|-------------|------|-----------------------------------|
| R1 | FEED-ORDER-001 — get_feed pipeline reorder | Migration 101: stage order cursored→ordered→deduped→paginated | 1 | **verified-live** — `62dd9ca`+`0035c10`; live def offsets cursored=7848<ordered=9290<deduped=11029<paginated=12582; e2e 87 pass / 0 fail |
| R2 | Commit dirty working tree (~1,715 insertions) | node_type write path, /api/youtube/search + AddCardSheet YT mode, public landing, /social proxy fix, sheet fixes | 2 | **verified-live** — `3bc3d0e` `63d749c` `8ed95d8` `5a90455` `c84ac7f`. Residue: `app/prototype/` + `public/prototype/` untracked → NEEDS-SPEC N11 |
| R3 | /social route protection in proxy.ts | Verify commit `c84ac7f` is merged and live | 0 | **verified-live** — `proxy.ts:43` includes `/social`; prod `GET /social` unauth → `307 /login`; `e2e/navigation-unauth.spec.ts:37` covers it |
| R4 | 04_FEED_SQL_SPEC.md §2.1 param-count drift | Spec listed 14 params; live `get_feed` has 16 (`p_exclude_foldered`, `p_custom_order_ids`) — docs-only | 2 | **done-in-tree** (DOC-FIX-001 edits, uncommitted); live probe confirms `pronargs=16` |
| R5 | Undocumented `update_avatar_key` / `update_display_name` dual overloads | Live DB carries 2-arg + 4-arg overloads of each; undocumented | 2 | **open** — live probe 2026-09-21 confirms 4 overloads; needs spec annotation |
| R6 | Missing spec §5.4 sidebar RPCs | `get_folder_access_users`, `get_group_access_users` — spec SQL exists (§5.4), no migration, no TS caller | 1 | **open** — live probe: both absent from `pg_proc` |
| R7 | AUDIT-06 P1-1 — useFeed.ts second get_feed caller | `lib/hooks/useFeed.ts` calls `supabaseBrowser.rpc("get_feed")` directly (2 sites), bypassing `lib/db/feed.ts` single-owner invariant | 0 | **open** — grep: `useFeed.ts:145,199`. Partial mitigation already merged (shared `FeedNode` in `lib/types/feed.ts`, two-caller comment) — residual: restore single-caller via thin server action |
| R8 | AUDIT-06 P1-3 — HorizView client-side tag regrouping | `HorizView.tsx:62-69` splits feed into with-tag/Other groups in TS (post-SQL reorder) | 2 | **open** — `activeTag` prop is never passed by FeedGrid (`FeedGrid.tsx:388-401`); branch is dead code → remove prop + branch |
| R9 | AUDIT-06 P2-1 — custom order sourced from localStorage | `SortableNodeGrid.tsx:129-150` merges `customOrders[scopeKey]` (localStorage) over SQL order; `useFeed.ts:85-88` passes localStorage order as `p_custom_order_ids`; DB table `user_node_preferences` written but never read (`getCustomOrder` dead, 0 rows live) — violates state-single-owner + DB-rebuild determinism | 0 | **open** — grep: only `useFeed.ts` + `SortableNodeGrid.tsx` read `useFeedStore` |
| R10 | Record migration 101 in schema_migrations | 101 applied to prod via pg but absent from `supabase_migrations.schema_migrations` (088–097 were recorded per convention) | 2 | **open** — live probe: latest recorded = `100` + 4 timestamped |
| R11 | youtube-intelligent-import e2e — 2 fails at classify time | `POST /api/import` 30s timeout + beforeAll login timeout (cold dev server) | 1 | **resolved** — FEED-ORDER-001-DEPLOY run: 87 pass / 15 skip / **0 fail**; re-verify in full suite |
| R12 | Tier-0 invariant machine-check + full gate re-run | Scripted checks: edge-only visibility path, non-null cause_id, no UNIQUE(node_id,user_id), RPC-only multi-row writes, atomic writes, soft-delete preserves causes/edges, tsc clean, no committed secrets | 0 | **open** — script + run owed by this task |

## NEEDS-SPEC — 12 items (pinned; do not touch)

| # | Item | Description |
|---|------|-------------|
| N1 | Auth method changes (PRD §41.2) | YouTube-core pivot auth changes — needs spec |
| N2 | Comments (PRD §41.3.1) | Commenting feature — needs spec |
| N3 | Onboarding (PRD §41.4) | Onboarding flow — needs spec |
| N4 | Phase B LLM categorization (PRD §41.5) | LLM categorization pipeline — needs spec |
| N5 | Ranked-list variant | Feed variant — needs spec |
| N6 | Folder filter chips | UI filter feature — needs spec |
| N7 | Sidebar-query drift resolution | §5.2/§5.5/§5.6/§5.7 implemented as direct service-client reads where spec shows RPCs — decide spec-vs-code authority |
| N8 | Reference-table RLS scope | `USING(true)` SELECT policies on 8 tables live (`external_items_map`, `external_sources`, `nodes_sort_cache`, `ratings`, `tag_edges`, `tag_translations`, `tags`, `translations`) — scope decision required |
| N9 | folder_edges causes | `add_node_to_folder`/`remove_node_from_folder` write `folder_edges` without causes (AUDIT-06 P2-14) — decide whether org writes need causes |
| N10 | AUDIT-02 pipeline-order ruling | Ruling on AUDIT-02's ordering question (distinct from FEED-ORDER-001 deploy, which is done) |
| N11 | Landing/prototype ship decision | `app/prototype/` + `public/prototype/` (30 stock images) untracked; keep/ship/remove decision |
| N12 | YT-search folder-choice residue | Residual folder-choice wiring from in-app YouTube search (8ed95d8) — needs spec |

## Live-DB evidence snapshot (2026-09-21, read-only probe `scripts/verify-live-state-004.mjs`)

- `get_feed` live: `pronargs=16` (includes `p_exclude_foldered`, `p_custom_order_ids`) — matches updated spec §2.1
- `get_folder_access_users` / `get_group_access_users`: **absent** from `pg_proc`
- `create_folder`: single overload `(p_name, p_parent_folder_id)`, no `random()` — AUDIT-06 P1-9 resolved
- `update_avatar_key`: `(p_user_id, p_avatar_key)` + `(p_user_id, p_avatar_key, p_new_count, p_today)`; `update_display_name`: `(p_user_id, p_display_name)` + `(p_user_id, p_display_name, p_normalized, p_old_display_name)`
- Write RPCs present: `move_node_to_folder`, `create_folder_with_nodes`, `get_or_create_unsorted_folder`, `get_or_create_named_folder`, `set_custom_order`, `import_url` (w/ `p_auto_folder_name`), `create_node_with_metadata` (w/ `p_auto_folder_name`, `p_node_type`); `create_node` dropped (095)
- `USING(true)` policies: 8 SELECT on reference tables + 2 service_role DELETE (folder_admins, group_admins)
- All 32 public tables RLS-enabled; `edges`/`causes` have SELECT-only policies for `authenticated` (writes = service_role RPCs only)
- Invariants: 0 NULL `cause_id`, no `UNIQUE(node_id,user_id)` on edges, 0 non-deleted nodes missing owner edge, soft-deleted nodes retain causes/edges (4/4/4)
- `user_node_preferences`: 0 rows, RLS on — custom-order DB path written but never exercised
- `schema_migrations` latest recorded: `100` + `20260101000000`–`…03`; **101 applied but unrecorded**
- EXECUTE grants: no anon/PUBLIC on app RPCs (except `ensure_user_profile` signup helper); writes service_role-only
