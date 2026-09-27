# LIKED — MVP 2.0 Phased Implementation Plan (spec of record)

**Project:** LIKED · **Plan task:** LIKED-MVP2-PLAN-001 · **Execution task:** LIKED-MVP2-EXEC-002
**Status:** APPROVED. Every product/architecture question (Q1–Q22) is resolved in §4. Together with the owner decision set in LIKED-MVP2-EXEC-002, this document is the spec of record; no PRD rewrite is required (Q22).

**Evidence basis:** live Postgres (project `lzkzfqshnjvlzosnntfx`, read-only probes through the pooler) and repo HEAD `6d90e50` (2026-09-27).

---

## 0. Ground truth (pre-MVP2)

### 0.1 Schema facts
| Object | State before MVP2 |
|---|---|
| `edges` | `node_id NOT NULL`, `cause_id NOT NULL → causes ON DELETE CASCADE`, `direction ∈ {sent,received}`, `permission ∈ {view,comment,contribute,edit,reshare,admin}`. No UNIQUE(node_id,user_id). **No folder edges.** |
| `causes` | `cause_type ∈ {direct_share, group_share, import}`, `metadata jsonb`. |
| `folders` | `parent_folder_id`, `deleted_at`, `color_hex`. No description, no system-folder marker. |
| `folder_tree` | Closure table. Nesting existed (live max depth 2). |
| `folder_edges` | `(node_id, folder_id)` UNIQUE; organizational (N9 exemption); no `added_by`. |
| `ratings` | 0–10 step 0.5, nodes only (6 rows). |
| `notifications` | Table + realtime; 3 emitters. |
| `categorization_suggestions` | `UNIQUE(node_id)`; per-item accept, non-atomic. |
| FK delete actions | CASCADE only on `edges`, `user_node_preferences`, `card_positions`, `node_notes`, `categorization_suggestions`. NO ACTION on `nodes_sort_cache`, `folder_edges`, `folder_tree`, `tag_edges`, `ratings`, `translations`, `group_nodes`, `external_items_map`, `node_messages`, `folder_admins`, `folders.parent_folder_id`. |
| Migrations | Files 001–110; `schema_migrations` held 106 numbered rows + 4 placeholder rows (`20260101000000..03`) that blocked `supabase db push` (repaired in B3). |

### 0.2 Live data
20 users · 366 nodes · 657 edges (all `view`) · 60 active folders (18 nested, depth 2) · 147 nodes in >1 folder · 6 legacy folder-share causes · 8 groups · 6 ratings · 139 notifications · 10 pending categorization suggestions.

---

## 1. Requirement matrix (25) — pre-MVP2 status → MVP2 delivery
| # | Requirement | Pre-MVP2 | MVP2 delivery (phase) |
|---|---|---|---|
| 1 | New UIX, archive old, responsive, light/dark | PARTIAL | Old UI moved to `_archive/` (excluded from routing/build/tsc/lint). New responsive shell with light/dark tokens (P4). |
| 2 | Google sign-in confirms before YouTube import | CONFLICT | Sign-in requests basic scopes only; silent onboarding import removed; in-app opt-in + confirmation modal + incremental `youtube.readonly` grant (P7). |
| 3 | All UI strings i18n | NET-NEW | `next-intl`, locales en/fr/th, catalogs in `messages/`; system folder labels and RPC error codes mapped client-side (P4). |
| 4 | FAB adds card or folder in current context | EXISTS | Rebuilt: FAB → Card / Folder, target = current folder (P4). |
| 5 | "YouTube" folder + one-click auto-organize, accept-all/unselect | PARTIAL | `system_kind='youtube'`; organize batches + atomic `apply_organization_batch` (move semantics) (P1–P2, P7). |
| 6 | "Web" folder for extension saves + same flow | NET-NEW | `system_kind='web'`; `/api/import` routes there; same organize flow (P2, P8). |
| 7 | Search cards + folders (title/tag/description) | PARTIAL | Cards: unchanged `get_feed` search. Folders: new `get_folders` RPC (name/description/tag label), separate section (P3, P5). |
| 8 | Filter by tag | EXISTS (cards) | Cards via `get_feed`; folders via `get_folders(p_tag_ids)` (P3, P5). |
| 9 | DnD any card/folder into folder | PARTIAL | `move_node_to_folder` / `move_folder` with permission gates + live grant expansion/revocation (P2, P4). |
| 10 | Home: own + friends' activity; list/masonry/columns | PARTIAL | Exactly 3 views (list default); folders section + cards section (P5). |
| 11 | Friend avatar filters to shared items | PARTIAL | Cards: `get_feed.p_friend_id` (both directions, unchanged). Folders: `get_folders(p_friend_id)` over folder edges (P3, P5). |
| 12 | Rail = friends only; Me separate | NET-NEW | New rail + fixed Me button (P4). |
| 13 | Mobile bottom bar Home/Add/Me | NET-NEW | New bottom bar (P4). |
| 14 | Friend management + group creation | PARTIAL | RPCs for invite/remove/block, group create/add/remove member; UI (P2, P6). |
| 15 | Private by default | EXISTS | Unchanged; no preselected recipients. |
| 16 | Share any folder/card | PARTIAL/BROKEN | Cards: `share_node` (multi-target, one txn). Folders: grant-based live subtree sharing via folder edges (P1–P2, P6). |
| 17 | Per-folder permission editing | PARTIAL/BROKEN | Role grants on the edge permission rank; gates enforced in every membership RPC; `added_by` for own-item deletion; "all friends" snapshot (P1–P2, P6). |
| 18 | Subfolders | EXISTS | Depth cap 5 enforced in `create_folder` / `move_folder` (P2). |
| 19 | Breadcrumb | EXISTS | Rebuilt from `get_folder` ancestors (P4). |
| 20 | Trash for folder/subfolder/card | PARTIAL/BROKEN | `trash_folder` (subtree + sole-membership cards), `restore_*`, `hard_delete_*`, `empty_trash`; cascade-only permanent delete (P0, P2, P10). |
| 21 | Card detail | EXISTS | Rebuilt card detail sheet (P5). |
| 22 | Who content is shared with | PARTIAL/BROKEN | Owner-only `get_node_access` / `get_folder_access` (P3, P6). |
| 23 | Notifications | PARTIAL | 4 v1 events, in-app only, `list_notifications` / `mark_notifications_read` (P2, P9). |
| 24 | Rating 0–100 cards + folders | PARTIAL | Integer 0–100; 6 legacy rows ×10; independent `folder_ratings` (P1–P2, P11). |
| 25 | Chrome extension installable | EXISTS | Sideload ZIP/CRX only (no CWS); saves routed to Web; popup i18n (P8). |

---

## 2. Defect register (all fixed in MVP2)
| ID | Defect | Fix (phase) |
|---|---|---|
| F1 | `get_folder_access_users` read `metadata->>'user_id'`; writers store `target_user_id` → always empty | Replaced by owner-only `get_folder_access` over `folder_grants`; old function dropped (P3). |
| F2 | `share_folder` shared direct children only, snapshot, empty folder produced nothing | Replaced by `share_folder_v2` (grant + folder edges on full subtree + live expansion); old RPC dropped (P2). |
| F3 | Folder access derived by JOIN/metadata (`folder_is_accessible`) and used as the write gate | Folder visibility = owner OR folder edge; write gates use permission rank (P1–P2). |
| F4 | `hard_delete_node` blocked by NO ACTION FKs | `ON DELETE CASCADE` on all node/folder dependents (P0). |
| F5 | `delete_folder` soft-deleted one row; no restore; Trash nodes-only | `trash_folder` / `restore_folder` / `hard_delete_folder` / `get_trash_items`; `delete_folder` dropped (P2–P3). |
| F6 | Non-atomic categorization accept | `apply_organization_batch` single RPC (P2). |
| F7 | Direct table writes / dual paths (tags, folders, nodes, blocks, friend_invites, users, notifications, auth-callback users upsert) | Each converted to one RPC; old paths removed (P0, P2). |
| F8 | System folders identified by name | `folders.system_kind` + partial UNIQUE(owner_id, system_kind) (P1). |
| F9 | Folder colour from global cross-tenant count | Per-owner folder count (P2). |
| F10 | YouTube scope at sign-in + silent import | Basic-scope sign-in; opt-in consent flow (P7). |
| F11 | No group-membership write path | `add_group_member` / `remove_group_member` (P2). |
| F12 | `categorization_suggestions UNIQUE(node_id)` blocks re-proposal | Replaced by `organize_batches` / `organize_items` (P1). |
| F13 | Folders absent from reads; `get_social_timeline` duplicated visibility | Dedicated folder read RPCs; `get_social_timeline` dropped with the archived UI (P3, P12). |
| F14 | Card recipient list shown to every viewer, TS dedup | Owner-only SQL `get_node_access` (P3). |

---

## 3. Tier-0 register (constraint ↔ requirement resolution)
| ID | Requirement | Resolution |
|---|---|---|
| T0-1 | Folder visibility (11,15,16,22) | `edges.folder_id` nullable, CHECK `num_nonnulls(node_id, folder_id) = 1`, FK → folders ON DELETE CASCADE, same cause binding, no UNIQUE(folder_id,user_id). Folder visible IFF `deleted_at IS NULL` AND (owner OR folder edge). |
| T0-2 | Live subtree sharing (16,17,9) | `folder_grants(folder_id, grantee_id, permission, granted_by)` is a write-time expansion instruction (like `group_nodes`), not a visibility source. Every item entering a folder covered by a grant gets one `direct_share` cause per (grant, item) with `causes.folder_grant_id → folder_grants ON DELETE CASCADE` plus sent/received edges, in the same RPC transaction. Revoking a grant deletes its row → causes cascade → edges cascade. |
| T0-3 | "All friends" (17) | Expanded at grant time into one grant per current friend (snapshot). No wildcard edge. |
| T0-4 | Groups (14,16) | Sharing to a group expands to current members at share time (snapshot); membership RPCs are organizational only. |
| T0-5 | Permissions (17) | Effective folder permission = max rank over grants on the folder or any ancestor (owner = admin; `folder_admins` = admin). Adds need `contribute`; removing others' items needs `edit`; rename needs `edit`; grant/revoke needs `reshare`; trash needs owner/`admin`. Own-item deletion uses `folder_edges.added_by`. |
| T0-6 | Trash (20) | Soft delete sets `deleted_at` (+ `trash_batch_id`) only; causes/edges untouched. Permanent delete = `DELETE` of batch roots; everything else cascades. |
| T0-7 | Organize commit (5,6) | `apply_organization_batch` is one transaction: move (delete source membership, insert target membership), tag writes, grant expansion/revocation. |
| T0-8 | Move semantics (9, Q11) | Moving item X from S to T: revoke causes of grants covering S but not covering T nor any other remaining membership of X; expand grants covering T but not S. Direct-share causes (no `folder_grant_id`) are never touched. |
| T0-9 | Imports (2,5,6) | `import_url` keeps cause+edge atomicity; system folder resolved by `system_kind` inside the same transaction. |
| T0-10 | Feed lock (7,8,10,11) | `get_feed` untouched. Folders come from new RPCs rendered as a separate section; no client merge/sort/filter. |
| T0-11 | Ratings (24) | Rating RPCs gated by visibility; aggregates computed in SQL in the same transaction. |
| T0-12 | Notifications (23) | Inserted inside the triggering RPC; reads/writes via RPC. |
| T0-13 | i18n of DB literals (3) | System folders rendered from catalog by `system_kind`; RPC errors raise stable codes mapped to catalog keys. |
| T0-14 | Dual paths | Every F7 path converted; old path removed in the same change. |
| T0-15 | Rating scale | One migration: CHECK change + ×10 data + `upsert_rating` validation + cache recompute. |

---

## 4. Resolved decisions (Q1–Q22)
| Q | Decision |
|---|---|
| Q1 | Folder nesting capped at depth 5 (root = depth 1), enforced in `create_folder`, `create_folder_with_nodes`, `move_folder`, `create_folder_template`. |
| Q2 | Existing OpenRouter pipeline. A run processes as many items as fit the per-request budget; remaining items stay `pending` and the UI offers "re-run". UI never blocks on full completion. |
| Q3 | Role-based grants on the existing rank (view<comment<contribute<edit<reshare<admin). "All friends" = snapshot at grant time. |
| Q4 | Groups are organizing tools; sharing to a group = one-time snapshot expansion to current members. |
| Q5 | Folder rating independent of card ratings; integer 0–100 for both; 6 legacy node ratings ×10 in the CHECK migration. |
| Q6 | v1 notifications: share received, folder shared, permission changed, item added to a shared folder. In-app only. |
| Q7 | Trash retained until manually emptied; no auto-purge. |
| Q8 | Old UI archived to `_archive/`, excluded from routing, build, tsc and lint; not deleted; not linked. |
| Q9 | `edges.folder_id` with exactly-one-of CHECK; folders are not nodes. |
| Q10 | Folder sharing is live and covers the full subtree. |
| Q11 | Moving an item out of a shared folder revokes grant-derived visibility unless another covering grant or an independent direct-share cause exists. |
| Q12 | Folder read RPCs of their own; `get_feed` return shape locked; folders render as a distinct section. |
| Q13 | Incremental consent: basic scopes at sign-in; `youtube.readonly` + explicit confirmation only on in-app opt-in. Scope = liked videos, authored comments, liked comments (see §7 platform note). |
| Q14 | `next-intl`; locales en, fr, th; no hardcoded copy in new UIX; extension popup i18n in Phase 8. |
| Q15 | `youtube` / `web` system folders cannot be renamed, trashed or moved; "YouTube" casing kept; `unsorted` stays the fallback and remains user-manageable. |
| Q16 | Organize acceptance moves items out of the default folder. |
| Q17 | Trashing a folder trashes a contained card only when all of the card's folder memberships are inside the trashed subtree and the caller owns the card. |
| Q18 | No Chrome Web Store submission; ZIP/CRX sideload only. |
| Q19 | Friend filter unchanged (both directions). |
| Q20 | Recipient/access lists are owner-only. |
| Q21 | Exactly 3 views: list (default), masonry, columns; HorizView and FreeGrid removed. |
| Q22 | This document + the EXEC-002 decision set is the spec of record. |

---

## 5. Phased plan (all items READY)

### Phase 0 — Baseline and defect remediation
- P0-01 Worktree disposition (snapshot branch/tag, keep real feature work as separate commits).
- P0-02 Migration-history repair (backup `schema_migrations`, revert 4 placeholder rows) — `supabase db push` restored.
- P0-03 FK `ON DELETE CASCADE` on all node and folder dependents (F4).
- P0-04 F7 conversions: tag add/remove, folder rename/colour, node soft-delete route, block, friend invite add/remove/backfill, language, notification read, auth-callback profile upsert removed (trigger `ensure_user_profile` is the single owner).
- P0-05 `scripts/check-invariants-001.mjs` extended (edge targets, cascades, direct-write scan, archive exclusion, i18n copy scan, view set, new RPC gates).

### Phase 1 — Data model
- P1-01 `folders.description`, `folders.system_kind` (+ partial UNIQUE, backfill `YouTube`/`Unsorted`), `folders.trash_batch_id`, `nodes.trash_batch_id`.
- P1-02 `edges.folder_id` + exactly-one CHECK + index; `edges.node_id` nullable.
- P1-03 `folder_grants`; `causes.folder_grant_id` FK ON DELETE CASCADE; backfill legacy folder shares into grants (+ folder edges on subtree).
- P1-04 `folder_edges.added_by` (backfill = node owner).
- P1-05 Ratings 0–100 integer (×10) + `folder_ratings`.
- P1-06 `organize_batches` / `organize_items` (replacing `categorization_suggestions`, backed up first).
- P1-07 `users.youtube_import_consent_at`.

### Phase 2 — Write RPCs (SECURITY DEFINER, `search_path=public`, anon/PUBLIC revoked, atomic)
- P2-01 Visibility + permission helpers: `folder_is_visible`, `effective_folder_permission`, `_expand_folder_grants_for_node/folder`, `_revoke_folder_grants_for_node`.
- P2-02 `create_folder` (depth cap, per-owner colour, permission gate, live expansion), `move_folder`, `rename_folder`, `set_folder_details`.
- P2-03 `add_node_to_folder`, `remove_node_from_folder`, `move_node_to_folder` (gates + expansion/revocation + notifications).
- P2-04 `share_folder_v2`, `revoke_folder_grant`, `set_folder_grant_permission`; `share_node` (multi-target card share).
- P2-05 `trash_folder`, `restore_folder`, `hard_delete_folder`, `restore_node`, `empty_trash`.
- P2-06 `upsert_rating` (0–100, visibility gate), `rate_folder`.
- P2-07 `get_or_create_system_folder`; `import_url` / `create_node_with_metadata` system-folder routing + live expansion.
- P2-08 `create_organize_batch`, `set_organize_item_proposal`, `apply_organization_batch`.
- P2-09 Friends/groups: `invite_friend`, `remove_friend`, `block_user`, `backfill_friend_invites`, `add_group_member`, `remove_group_member`, `set_language`, `mark_notifications_read`, `set_youtube_import_consent`, tag RPCs.

### Phase 3 — Read RPCs
`get_folders`, `get_folder`, `get_folder_access`, `get_node_access`, `get_trash_items`, `list_notifications`, `get_organize_batch`, updated `get_folder_tree`.

### Phase 4 — New UIX foundation
Archive old UI; `next-intl` (en/fr/th); theme tokens; responsive shell; desktop header + mobile bottom bar (Home/Add/Me); friends-only rail + Me button; FAB (card/folder in context); breadcrumb; DnD move.

### Phase 5 — Home feed, views, search, filters, card detail
3 views over unchanged `get_feed`; folders section via `get_folders`; search; tag filter; friend filter; Me view; card detail.

### Phase 6 — Sharing and social UI
Share dialog (friends / groups / all friends, folder role), owner-only access list with permission edit + revoke, friends & groups management.

### Phase 7 — YouTube
Consent-gated import; YouTube system folder; auto-organize dialog (accept-all / unselect, re-run pending).

### Phase 8 — Web folder and Chrome extension
Extension saves → Web; Web auto-organize; popup i18n (en/fr/th); rebuild ZIP/CRX; no CWS.

### Phase 9 — Notifications UI
In-app list, unread badge, realtime, mark read.

### Phase 10 — Trash UI
Trash list (cards + folder batches), restore, permanent delete, empty trash.

### Phase 11 — Ratings UI
0–100 slider for cards and folders.

### Phase 12 — Cut-over
Drop superseded RPCs, invariant sweep, lint/tsc/unit/e2e/build, progress log, merge.

---

## 6. Sequencing
1. Phase 0 → Phase 1 → Phase 2 → Phase 3 (strict per feature: schema → write → read).
2. Phase 4 shell starts after Phase 3 so new UI consumes final RPCs.
3. Phases 5–11 on top of the shell.
4. Phase 12 last. `check-invariants-001.mjs` runs after each phase group.

## 7. Platform notes
- YouTube Data API v3 exposes liked videos (`videos.list?myRating=like`) but has **no endpoint to list comments authored by the user or comments the user liked** (N2 finding, re-verified). Liked videos are imported via the API; comment import is limited to what the platform exposes and is recorded as a deviation in the execution report.
- Migrations continue with numeric prefixes `111_…` and are applied only with `supabase db push`.
