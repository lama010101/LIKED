# PLAN-CLASSIFY-001 — Itemized List (Reconstructed)

**Task:** EXEC-READY-001
**Date:** 2026-09-21
**Status of this document:** Reconstruction. The original 2026-09-18 classification was delivered verbally and never persisted; only the summary row survives in `docs/00_PROGRESS.md`. This list was re-derived using the same method (live DB probe via direct `pg` against `lzkzfqshnjvlzosnntfx` — `scripts/verify-live-state-004.mjs`, run 2026-09-21) and cross-checked against the surviving NEEDS-SPEC enumeration in the progress entry.

**Tier definitions:** Tier 0 = hard architectural invariant, requires a machine-checked script (not assertions). Tier 1 = strong default fix direction already exists (audit/spec); deviation allowed only with stated reason. Tier 2 = full discretion.

---

## READY (12)

| # | Item | Description | Tier | State at reconstruction |
|---|------|-------------|------|-------------------------|
| R1 | IMPL-NODE-TYPE-01 | Caller-supplied `node_type` through the write path (migrations 098–100 + callers/types) | 1 | ✅ Done — `3bc3d0e` |
| R2 | FIX-PROXY-001 | `/social` missing from `proxy.ts` protected routes | 0 | ✅ Code done — `c84ac7f` (`proxy.ts:43`). Residual: verify live deploy returns redirect |
| R3 | LANDING-001 | Public landing page at `/` for unauthenticated users | 2 | ✅ Done — `63d749c` |
| R4 | YT-SEARCH-001 | In-app YouTube search in Add Card sheet (`GET /api/youtube/search` + `searchYouTubeVideos`) | 1 | ✅ Done — `8ed95d8` |
| R5 | FIX-SHEET-001 | Sheet visibility/positioning + YouTube OAuth error toast | 2 | ✅ Done — `5a90455` |
| R6 | AUDIT-06 P1-1 | `useFeed.ts` is a second `get_feed` caller — feed single-ownership invariant | 0 | Code-resolved `76396cb` (invariant comment redefined as "no logic around the RPC"; `FeedNode` consolidated to `lib/types/feed.ts`). Residual: machine-check in Tier-0 sweep + audit-status note |
| R7 | AUDIT-06 P1-3 | `HorizView` filters feed by `activeTag` client-side | 1 | Open — `activeTag` prop has zero callers (dead code); remove prop + branch |
| R8 | AUDIT-06 P2-1 | `SortableNodeGrid` reorders feed from localStorage store, not DB | 1 | Open — `get_feed` now accepts `p_custom_order_ids` and `useFeed` passes it; remove the client-side merge so SQL is the sole ordering authority |
| R9 | DOC-FIX-001 | Docs consolidation: quarantine stale docs → `DOCS/archive/`, `DOCS/README.md` authority matrix, **`04_FEED_SQL_SPEC.md` §2.1 param-count drift 14→16** (`p_exclude_foldered`, `p_custom_order_ids`) | 2 | Applied in working tree; uncommitted → commit |
| R10 | DB-OVERLOAD-CLEANUP | `update_display_name(uuid,text,text,text)` + `update_avatar_key(uuid,text,integer,text)` — superseded 4-param overloads still live, undocumented, and bypass rate limits (caller supplies count/date) | 1 | Open → migration 102 `DROP FUNCTION`; zero callers in app/extension/scripts (verified by grep) |
| R11 | OPS-MIG-LEDGER | Migration 101 applied to prod (FEED-ORDER-001-DEPLOY) but **not recorded** in `supabase_migrations.schema_migrations`; pending read-only probe scripts uncommitted | 1 | Open → record 101; commit `verify-live-state-004.mjs` + `verify-live-maxbatch-001.mjs` |
| R12 | TIER0-SWEEP | Executable invariant check: edges-only visibility (no non-deleted node missing owner edge), non-null `cause_id`, no `UNIQUE(node_id,user_id)` on edges, RPC-only multi-row writes, atomic writes, soft-delete preserves causes/edges, `tsc --noEmit` clean, no committed secrets | 0 | Open → `scripts/check-invariants-001.mjs` + run |

## NEEDS-SPEC (12) — do not touch

| # | Item | Description / why it needs spec |
|---|------|--------------------------------|
| N1 | §41.2 auth method changes | Product/security decision |
| N2 | §41.3.1 comments | Feature scope decision |
| N3 | §41.4 onboarding | Product flow decision |
| N4 | §41.5 Phase B LLM categorization | Infra/cost decision |
| N5 | Ranked-list variant | Product decision |
| N6 | Folder filter chips | UX/spec decision |
| N7 | Sidebar-query drift | Spec §5.4–5.7 specifies RPCs (`get_folder_access_users`, `get_group_access_users` — verified **absent** live); code uses direct service-client queries (AUDIT-06 P1-11/P2-2/P2-11 remnants). Resolving requires deciding RPCs vs amended spec |
| N8 | Reference-table RLS scope | `USING(true)` SELECT policies verified live on 8 reference tables: `ratings`, `nodes_sort_cache`, `tags`, `tag_translations`, `tag_edges`, `translations`, `external_sources`, `external_items_map` (AUDIT-06 P2-7). Scoping policy is a product/security decision |
| N9 | `folder_edges` causes | Folder-membership writes don't create `causes`/`edges` rows; whether they must is a write-system design decision |
| N10 | AUDIT-02 pipeline-order ruling | Requires CTO ruling on pipeline order |
| N11 | Landing/prototype ship decision | Landing shipped (`63d749c`); `app/prototype/` + `public/prototype/` Pinterest-style home remain uncommitted pending ship decision |
| N12 | YT-search folder-choice residue | Which folder YT-search saves land in — product decision |

---

## Cross-reference anchor check

| Anchor from EXEC-READY-001 | Maps to |
|---|---|
| AUDIT-06 P1-1 | R6 |
| AUDIT-06 P1-3 | R7 |
| AUDIT-06 P2-1 | R8 |
| Spec §5.4–5.7 sidebar RPCs | N7 |
| `/social` proxy protection (c84ac7f) | R2 |
| `04_FEED_SQL_SPEC.md` §2.1 param drift (14→16) | R9 |
| `USING(true)` on 8 reference tables | N8 |

## Live-DB evidence snapshot (verify-live-state-004.mjs, 2026-09-21)

- `get_feed`: exactly 1 overload, 16 params — matches corrected spec §2.1
- `get_folder_access_users` / `get_group_access_users`: absent
- `create_folder`: single overload `(text, uuid)`, no `random()` — P1-9 already resolved (migration 080)
- `update_avatar_key`: 2 overloads; `update_display_name`: 2 overloads
- Write RPCs present: `move_node_to_folder`, `create_folder_with_nodes`, `get_or_create_unsorted_folder`, `get_or_create_named_folder`, `set_custom_order`, `import_url`, `create_node_with_metadata`; `create_node` absent (dropped by 095)
- Invariants: 0 NULL `cause_id`, no `UNIQUE(node_id,user_id)`, 0 non-deleted nodes missing owner edge, 4 soft-deleted nodes retain 4 edges / 4 causes
- `schema_migrations` latest: `20260101000003`…`097`; **101 absent**
- `user_node_preferences`: 0 rows, RLS on
