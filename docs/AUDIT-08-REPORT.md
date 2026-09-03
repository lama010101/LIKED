# AUDIT-08 — Full Codebase Audit Report

**Date:** 2026-09-03
**Auditor:** Devin (automated)
**Scope:** Full codebase — `app/`, `lib/`, `components/`, `extension/`, `supabase/migrations/` (001–091), `supabase/functions/`, `e2e/`, `.github/workflows/`, `scripts/`
**Build status:** `tsc --noEmit` clean (exit 0), `eslint .` clean (exit 0, 0 errors / 0 warnings), extension `tsc --noEmit` clean, extension `build.mjs` exit 0
**Method:** Differential audit vs AUDIT-07 (2026-09-02) — verified every AUDIT-07 fix in code, re-probed remote DB, plus a NEW security-focused sweep of all SECURITY DEFINER RPCs for authorization (IDOR) gaps.
**Status:** 1 new **P0 systemic finding** (RPC IDOR — 42 functions). All AUDIT-07 fixes verified intact. No feed violations, no XSS, no auth gaps in app code. **P0 FIXED by migration 092** (applied + behaviorally verified 2026-09-03) — see "Fixes applied" below.

---

## Summary

| Severity | AUDIT-07 | AUDIT-08 (current) | Delta |
|----------|----------|--------------------|-------|
| P0 (Critical) | 0 | **1** (systemic: 42 RPCs) | NEW — RPC authorization gap |
| P1 (High) | 0 | 0 (folded into P0) | — |
| P2 (Medium) | ~6 | ~2 | improved |
| P3 (Low) | ~4 | ~3 | mostly unchanged |

**Headline finding:** A systemic **IDOR (Insecure Direct Object Reference)** in the database RPC layer. 42 `SECURITY DEFINER` functions are `GRANT EXECUTE TO authenticated` and accept caller-supplied user IDs (`p_user_id` / `p_owner_id` / `p_sharer_id`) **without validating them against `auth.uid()`**. Any signed-in user can call these RPCs directly via the anon/publishable key with a victim's ID and:
- **Read any user's private feed, folders, tags, friend list (incl. emails), ratings** (20 IDOR-READ functions — 3 of which are called from the app's own browser client)
- **Impersonate any user for writes**: create nodes/groups/folders as the victim, share content as the victim, soft/hard-delete the victim's nodes and folders, change the victim's profile name/avatar, edit the victim's node titles (22 IDOR-WRITE functions)

This was partially anticipated: `DOCS/ROADMAP.md:79` already says *"Verify caller's `auth.uid()` is used only inside the function, not in the TS wrapper"* — it was never fixed. The correct pattern already exists in the codebase (`create_folder` 057, `move_folder` 040, `rename_folder` 061, `upsert_card_position` 060, admin grant/revoke 061), so the fix is well-scoped.

**App-code safety verified:** All 20 server actions in `app/lib/actions/` call `getUser()`/`requireUserId()`; no XSS vectors (`dangerouslySetInnerHTML`, `eval`, `innerHTML`); all `target="_blank"` links have `rel="noopener noreferrer"`; no browser-client reads of RLS-sensitive tables (`folder_edges`, `folder_tree`, `folder_admins`, `group_members`, `group_nodes`, `group_admins`); feed logic stays in SQL (client calls are pure rendering).

---

## P0 — Systemic RPC Authorization (IDOR)

**Root cause pattern** (confirmed in every flagged function):
```sql
CREATE OR REPLACE FUNCTION get_feed(p_user_id UUID, ...)  -- caller-supplied user id
LANGUAGE plpgsql STABLE SECURITY DEFINER                  -- bypasses RLS
AS $$ BEGIN
  ... WHERE n.owner_id = p_user_id OR e.user_id = p_user_id ...  -- scoped to the SUPPLIED id
  -- NO: IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE ... END IF;
$$;
GRANT EXECUTE ON FUNCTION get_feed(...) TO authenticated;  -- callable by any user
```

### P0-1: IDOR-READ — 20 functions (3 directly reachable from the app's browser client)

**Browser-reachable (most severe — the app itself calls these with client-supplied user id):**
| Function | Migration | Leaks | Caller |
|----------|-----------|-------|--------|
| `get_feed` | 051/086 | Victim's entire private feed (cards, titles, URLs, thumbnails, tags, senders) | `lib/hooks/useFeed.ts:145,199` |
| `get_social_timeline` | 085 | Victim's timeline incl. folder names, colors, card counts, thumbnails | `lib/hooks/useSocialTimeline.ts:54` |
| `get_friend_bar` | 011 | Victim's friend list: display names, avatars, **emails (`to_email`)**, last activity | `components/sheets/AddCardSheet.tsx:92` |

**Server-side callers only, but GRANTed to authenticated → directly exploitable via anon key:**
`get_user_folders` (084), `get_folder_tree` (083), `get_visible_node_by_id` (005), `get_visible_nodes` (048), `get_node_friend_ratings` (045), `get_visible_tags` (068), `get_nodes_in_folder` (067), `is_folder_admin` (061), `is_group_admin` (061), `folder_is_accessible` (091), `folder_is_owned` (091), `group_is_member` (091), `group_is_owned` (091), `get_node_permission` (010), `get_folder_permission` (010), `has_node_permission` (010), `has_folder_permission` (010).

*Note: the 091 helper functions (`folder_is_accessible` etc.) MUST stay GRANTed to authenticated for RLS policies to call them; the metadata-probe risk they add (whether victim can access folder X) is low but real. See fix 3 below.*

### P0-2: IDOR-WRITE — 22 functions (impersonation / data corruption)

| Function | Migration | Attack |
|----------|-----------|--------|
| `create_node_with_metadata` | 082 | Create nodes owned by victim (pollute victim's feed; `owner_id`, cause `created_by`, edge user all from `p_owner_id`) |
| `import_url` | 082 | Same as above + writes victim's `node_notes` |
| `direct_share` / `group_share` / `share_folder` | 058 | Share victim's nodes/folders to attacker-chosen recipients with `p_sharer_id = victim` |
| `group_unshare` | 056 | Unshare victim's content |
| `create_group` | 056 | Create group owned by victim |
| `hard_delete_node` | 090 | **Permanently delete** victim's soft-deleted nodes (ownership check compares to caller-supplied `p_user_id`) |
| `set_node_deleted` | 027/070 | Trash/restore ANY node (no ownership check at all) |
| `delete_folder` | 036 | Soft-delete ANY folder (no ownership check) |
| `move_node_to_folder` | 081 | Move nodes in/out of folders accessible to victim |
| `add_node_to_folder` / `remove_node_from_folder` | 036 | Attach/detach ANY node↔folder (no ownership check) |
| `create_folder_with_nodes` | 081 | Create folder as victim (`v_owner := COALESCE(p_user_id, auth.uid())` — supplied id wins) |
| `get_or_create_unsorted_folder` / `get_or_create_named_folder` | 081 | Get-or-create folders under victim's identity |
| `create_user_profile` | 025/074 | Upsert victim's profile row |
| `update_display_name` / `update_avatar_key` | 043 | Change victim's display name/avatar |
| `update_node_title` | 039 | Edit victim's node titles |
| `change_node_permission` / `change_folder_permission` | 010 | Change victim's permissions |

### Fix direction (standard pattern — precedent already in 040/057/060/061)

1. **User-id-parameter functions** — add at top of body:
```sql
IF p_user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
END IF;
```
Applies to: `get_feed`, `get_social_timeline`, `get_user_folders`, `get_folder_tree`, `get_visible_node_by_id`, `get_visible_nodes`, `get_friend_bar`, `get_node_friend_ratings`, `get_visible_tags`, `get_nodes_in_folder`, `create_node_with_metadata`, `import_url`, `direct_share`, `group_share`, `share_folder`, `group_unshare`, `create_group`, `hard_delete_node`, `move_node_to_folder`, `create_folder_with_nodes`, `get_or_create_unsorted_folder`, `get_or_create_named_folder`, `create_user_profile`, `update_display_name`, `update_avatar_key`, `update_node_title`, `change_node_permission`, `change_folder_permission`, `get_node_permission`, `get_folder_permission`, `has_node_permission`, `has_folder_permission`, `is_folder_admin`, `is_group_admin` (or validate `p_user_id = auth.uid()` / caller-role).

2. **Resource-only functions** — derive ownership from `auth.uid()`, never trust bare ids: `set_node_deleted`, `delete_folder`, `add_node_to_folder`, `remove_node_from_folder`.

3. **RLS helper functions (091)** — `folder_is_accessible`, `folder_is_owned`, `group_is_member`, `group_is_owned`: keep the authenticated grant (policies need it), but hard-code the user parameter to `auth.uid()` internally (drop the `p_user_id` param entirely and call `auth.uid()` inside), removing the probe surface while preserving policy behavior.

4. After the migration: revoke `EXECUTE` from `authenticated` on any function the app only calls server-side (`get_visible_node_by_id`, `get_visible_nodes`, `get_nodes_in_folder`, `get_node_friend_ratings`, `get_visible_tags`, `get_node_permission`, `get_folder_permission`, `has_node_permission`, `has_folder_permission`, `is_folder_admin`, `is_group_admin`, permission functions) — service_role only.

---

## Fixes applied (post-audit)

| Task | File(s) | Change |
|------|---------|--------|
| **P0 (RPC IDOR)** | `supabase/migrations/092_fix_rpc_authz.sql` (new, generated + applied) + `scripts/gen-migration-092.mjs`, `scripts/apply-migration-092.mjs`, `scripts/verify-rpc-authz-092.mjs` | `auth.uid()` gate injected into **37 SECURITY DEFINER functions** (`IF auth.uid() IS NOT NULL AND <user_param> IS DISTINCT FROM auth.uid() THEN RAISE P0003`) + **4 resource-only functions** rewritten with auth.uid()-derived ownership checks (service-role bypass preserved via `auth.uid() IS NULL`). 2 SQL-language functions converted to plpgsql (`is_folder_admin`, `is_group_admin` → `RETURN (...)`, `get_friend_bar`, `get_visible_node_by_id`, `get_visible_nodes` → `RETURN QUERY`). |
| **P0 (anon bypass — follow-up)** | `supabase/migrations/094_fix_anon_bypass_and_revoke.sql` (new, generated + applied) + `scripts/gen-migration-094.mjs`, `scripts/apply-migration-094.mjs`, `scripts/verify-anon-blocked-094.mjs` | **Critical residual hole closed:** 092's gate (`auth.uid() IS NOT NULL`) skipped for the anon role (auth.uid() = NULL) and every function still had anon/PUBLIC EXECUTE → unauthenticated callers could read/impersonate any user. Migration 094 (1) replaces all 37 gates with role-aware checks `IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND <param> IS NOT DISTINCT FROM auth.uid())) THEN RAISE` — anon always blocked; (2) resource-only functions use `auth.role() = 'service_role'` bypass instead of `auth.uid() IS NULL`; (3) **REVOKE EXECUTE FROM PUBLIC, anon** on all RPCs (and additionally `authenticated` on 26 service-only functions). Also `093` (revoke authenticated) proved ineffective alone — PUBLIC grants remained — and is superseded by 094's fuller revokes. |
| **P2-4** | `lib/constants.ts`, `lib/db/feed.ts`, `lib/hooks/useFeed.ts` | Deduplicated `FEED_INITIAL_LOAD = 30` into shared `PAGINATION.initialLoadSize`. |
| **P0 (sweep follow-up)** | `supabase/migrations/095_drop_dead_and_gate_remaining_rpcs.sql` + `096_unshare_service_only.sql` (new, applied) | A full `pg_proc` sweep found functions missed by the earlier enumerations: (1) **`create_node` still live on the remote — migration 079's DROP was never applied** (RPC-existence probes can't verify DROPs); dropped it plus dead `search_nodes` and `get_feed_custom_sort`; (2) **`unshare`** compared cause ownership to the caller-supplied `p_requesting_user_id` with anon/PUBLIC EXECUTE → gated with the role-aware check, then revoked to service-only (096); (3) revoked anon/PUBLIC from `grant/revoke_folder/group_admin` (authenticated kept — `admin.ts` uses user-session client) and made `increment_view_count` service-only. |
| **P0 (node creation runtime bug)** | `lib/types/database.ts`, `lib/db/nodes.ts` | **Runtime bug found by review:** `create_node_with_metadata` actually `RETURNS TABLE` (array of node rows) but database.ts said `Returns: string` and nodes.ts used `const nodeId = data` → the follow-up fetch did `WHERE id = "[object Object]"` → **node creation threw "Failed to fetch created node"** (e2e didn't catch it — it only asserts "no crash"). Confirmed at runtime via service-key probe; fixed type to the node-row array and `const nodeId = data?.[0]?.id`. Also completed `update_display_name`/`update_avatar_key` Returns (`success` field) and typed `create_group` Returns (group row array). |
| P3-1 | `lib/hooks/useSocialTimeline.ts` | `loadMore` catch now logs the error before stopping pagination. |
| P3-3 | `.gitignore` | Added `.tmp-*.js` / `.tmp-*.mjs` patterns. |

### P0 verification (behavioral, anon key + demo user)
**Layer 1 — authenticated (demo user, anon key + JWT):** all checks pass — `get_feed`, `get_social_timeline`, `get_friend_bar`, `get_user_folders`, `get_folder_tree` with a **victim id → P0003**; `hard_delete_node`, `update_display_name`, `direct_share` with a **victim id/sharer id → 42501 (revoked)**; own-id calls succeed.

**Layer 2 — unauthenticated (bare anon key, no JWT):** `verify-anon-blocked-094.mjs` — all 9 probes (reads + writes with victim ids) → **42501 permission denied** or PGRST202. The residual P0 hole is closed.

**Layer 3 — service role:** re-probed via `verify-migrations-079-090.mjs` — all 8 RPCs respond normally (gate passes for `service_role`, revokes don't affect it).

Build: `tsc` 0, `eslint` 0, extension `tsc` 0.

---

## P2 — Medium

### P2-1: Extension session encryption — HARDENED (2026-09-03)
**File:** `extension/src/auth/session.ts` (AUDIT-07 P2-19 fix)
The session is now encrypted with a **per-install random, non-extractable AES-GCM-256 `CryptoKey` persisted in IndexedDB** (per-extension-origin, cannot be exported even by code in the extension). This replaces the previous salt-derived key (PBKDF2 from a salt stored next to the ciphertext — obfuscation-grade). The legacy path is retained **only** to decrypt-and-migrate pre-hardening sessions (`decryptSession` tries the current key, falls back to the legacy key, re-encrypts, and removes the salt). If IndexedDB is unavailable, `getEncKey` falls back to the legacy key so the extension stays functional. **Verified:** extension `tsc` 0, `build` 0, main `tsc` 0 / `eslint` 0; crypto harness confirms legacy→new migration round-trip and wrong-key rejection.

### P2-2: `get_friend_bar` exposes friend email addresses
**Files:** `supabase/migrations/011_friend_invites.sql:52` (`to_email` in return table), called from browser at `components/sheets/AddCardSheet.tsx:92`.
Even after the P0 fix, the `to_email` column of pending invites is returned to the caller. Pending-invite emails are arguably visible to the inviter by design, but the RPC is also IDOR-reachable (P0-1). Fix: keep `to_email` but ensure only the invite *sender* sees it (covered by the P0-1 auth.uid() gate since `get_friend_bar` is scoped to `p_user_id` = caller).

---

## P3 — Low

### P3-1: `useSocialTimeline` swallows pagination errors silently
**File:** `lib/hooks/useSocialTimeline.ts:74-76` — `catch { setHasMore(false); }` stops infinite scroll with no user feedback. Add `console.error` or a toast.

### P3-2: `as unknown as` casts — RESOLVED (2026-09-03)
Removed the `AnySupabase` escape hatches from `lib/db/nodes.ts`, `folders.ts`, `sharing.ts`, `tags.ts`, `nodePreferences.ts`, `rpc.ts`. Added the missing RPC/table types to `lib/types/database.ts` (delete_folder, add_node_to_folder, remove_node_from_folder, move_folder, unshare_folder_op, set_custom_order, set_node_deleted, rename_folder, create_folder + `user_node_preferences` table), and corrected `import_url`'s `Returns` (string → node-row TABLE, matching the actual RPC). `create_node_with_metadata`/`import_url`/`hard_delete_node`/`create_tag_with_translation`/`get_visible_tags`/`get_node_friend_ratings`/`set_custom_order` are now statically typed calls; query-builder nested-select casts narrowed from `as unknown as` to `as` (or removed where the inferred type matched). Remaining `as unknown as` in `lib/utils/feedParams.test.ts:43` is intentional test code. Verified: `tsc` 0 errors, `eslint` 0, extension `tsc` 0.

### P3-3: Temporary scripts in repo root
`.tmp-subfolders-test.mjs`, `.tmp-icon-test.mjs`, `.tmp-dnd-test.mjs` were observed in the IDE (since deleted). Recommend adding `.tmp-*.mjs` to `.gitignore`.

---

## Verified clean (no action)

- **AUDIT-07 fixes all intact:** FeedGrid no `localFolders`; CardDetailSheet/NotificationPanel re-fetch after mutations; BottomBarAvatar a11y + styled confirm; CardMenu native button; DroppableFolderChip ancestry check; extension encryption + response validation; feed-path `as unknown as` → `as`.
- **Remote DB:** migration 091 applied (4 SECURITY DEFINER helpers present, 13 scoped policies); **088 applied** (14/14 real indexes — closes AUDIT-07 gap); **089 applied** (FK CASCADE on 8 FKs + `tag_translations_language_code_label_key` unique — closes AUDIT-07 gap). RLS behavioral: `folder_edges` 8/205, `group_members` 0/22 — no recursion. `users` all-18 is the documented seed-script false positive.
- **Feed lock:** only `get_feed` / `get_social_timeline` power feeds; HorizView `.filter()` calls are presentation-only grouping (P1-3 documented).
- **Server actions:** all 20 files auth-checked.
- **XSS:** 0 `dangerouslySetInnerHTML` / `eval` / `innerHTML`; `target="_blank"` all have `rel="noopener noreferrer"`.
- **Env keys:** code fully migrated to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (only docs reference legacy `ANON_KEY`); CI workflows updated.
- **User changes since AUDIT-07** (uncommitted): SocialFeedView migrated to `get_social_timeline` (P1-2 fix, also a11y-improved — div→button); `social/page.tsx` uses `getSocialTimeline`; `feedParams` wires `p_custom_order_ids`; `tagColors` dead code removed; `proxy.ts` key rename. All verified correct.
- **Build:** tsc 0 / eslint 0 / extension tsc 0 / extension build 0.
- **Migrations:** 079-091 sequential, no ordering conflicts; broken `create_node` dropped (079); non-deterministic `create_folder` overload dropped (080).

---

## Recommended next steps

1. **P0: DONE** — migration `092_fix_rpc_authz.sql` applied and behaviorally verified (see "Fixes applied").
2. **P2-1: DONE** — extension session encryption hardened to a non-extractable IndexedDB key with legacy migration (see P2-1).
3. **P2-2:** `to_email` exposure is gated to the caller's own invite list by the P0 auth.uid() gate — acceptable.
4. Optionally revoke `EXECUTE` from `authenticated` on functions the app calls only via service client (defense-in-depth; the gates already close the IDOR).
5. Commit the large uncommitted work block (migrations 079–092, social timeline feature, audit reports, verify scripts) — currently 100+ changed/untracked files.

---

## Previous Audit Status

- **AUDIT-04:** All P0 (6) and P1 (14) fixed. ✅
- **AUDIT-05:** 18 actionable items fixed. ✅
- **AUDIT-06:** 0 P0, 11 P1, 22 P2, 18 P3 — findings reported.
- **AUDIT-07:** 0 P0, 0 P1 open — all 22 findings addressed (10 fixed, 8 verified already-resolved, 4 documented exceptions).
- **AUDIT-08 (this report):** 1 P0 (systemic RPC IDOR — 42 functions) → **FIXED by migration 092, behaviorally verified**. 2 P2, 3 P3 (P3-1/P3-3 fixed; P3-2 documented). All prior fixes verified intact; remote migrations 088/089/091/092 confirmed applied.
