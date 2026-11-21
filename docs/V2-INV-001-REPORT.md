# V2-INV-001 — Read-only investigation: can the LIKED v2 Recommendation Inbox be built on the existing engine?

**Project:** LIKED
**Task ID:** V2-INV-001
**Date:** 2026-11-21
**Mode:** READ-ONLY. No source code, migration, or config changes. No secrets printed.
**DB probes:** all SELECT-only via `psql` on the Supabase pooler (`postgres` role), except two explicitly-labelled `BEGIN … ROLLBACK` simulations (B2, A2-trigger). One permitted live auth probe (A1) — it created **no** user (HTTP 422), so there was nothing to delete.
**Live DB target:** project `lzkzfqshnjvlzosnntfx`, database `postgres`.
**Repo state investigated:** working tree on branch `devin/plan-v2-001-r1` (HEAD `665b193`, 2 commits ahead of `origin/main` `08af720`, plus uncommitted edits to `docs/05_PRD_V2_RECOMMENDATION_INBOX.md`). DB-live schema corresponds to migration 141 on both repo and `supabase_migrations.schema_migrations`.

---

## 1. Verdict table

| Q | Status | One-line answer |
|---|--------|-----------------|
| A1 | PROVEN | Anonymous sign-in is **DISABLED** — live `POST /auth/v1/signup {}` → HTTP 422 `anonymous_provider_disabled`. No test user created. |
| A2 | PROVEN | Trigger `ensure_user_profile_trigger` on `auth.users` → `public.ensure_user_profile()` creates a `public.users` row for every new auth user; anonymous users get `display_name='user'`. Only NOT-NULL-no-default columns are `display_name`, `normalized_display_name` (both supplied by the trigger). |
| A3 | PROVEN | Zero policies/functions distinguish `is_anonymous`. An anonymous JWT (role `authenticated`) gets the **entire** authenticated surface: all own-row RLS policies, edge-visibility policies, 4 `USING(true)` reference tables, and EXECUTE on ~91 app RPCs. `anon` role (no session) gets nothing. |
| A4 | PROVEN | `folder_grants.grantee_id`, `edges.user_id`, `edges.sender_id` all FK → `public.users(id)`. Anonymous users get a `users` row via trigger → valid grantees/edge endpoints. |
| B1 | PROVEN | `add_node_to_folder` requires `_node_visible(node,B)` (own **or any edge**) + folder permission rank ≥3 (`contribute`). It inserts `folder_edges`, expands grants → owner A receives `sent` edges on B's node, and inserts `folder_item_added` notification to A (+ folder-edge users). |
| B2 | PROVEN | Simulated A(laurent.martenot)→B(a@a.com) in `BEGIN…ROLLBACK`: B created a node, added it to A's folder; A then saw it via `get_feed` AND `get_folder` (`node_ids`), plus a `folder_item_added` notification. Rolled back; zero residue verified. |
| B3 | PROVEN | Only 2 RPCs insert into `nodes`: `create_node_with_metadata`, `import_url`. Both force `p_owner_id = auth.uid()` for `authenticated` callers (service_role exempt). No RPC lets an authenticated caller set a different owner. |
| B4 | PROVEN | `UNIQUE (url, owner_id)` — **owner-scoped**, not global. Two users may hold the same URL; same owner cannot (→ `DUPLICATE_NODE` in `import_url`). |
| B5 | PROVEN (refuted) | No link/token/redeem grant exists at HEAD. Grants only via `share_folder_v2` (explicit user ids / all-friends / group members) or `set_folder_grant_permission`; `friend_invites` is email-only (`invite_friend(p_email)`); `group_share` RPC was dropped (migration 132). `ShareSheet` "copy link" is a plain app URL — code comment: "public links need a share-token migration". |
| C1 | PROVEN | Groups = member/admin tables + management RPCs + **snapshot** share expansion (`share_folder_v2 p_group_id`, client-side expansion for `share_node`). `group_nodes` has **no live writer** → `get_feed p_group_id` filter is dead. UI exposes create/delete/add-member (`/friends`) and group share targets (`ShareSheet`); no remove-member/admin-grant/group-feed UI. |
| C2 | PROVEN | `get_group_access_users` **exists** (SECURITY DEFINER, member-gated, authenticated EXECUTE). `get_folder_access_users` does **not** exist; the folder equivalent is `get_folder_access` (owner-only). |
| D1 | PROVEN | Live: `ratings.score numeric(3,1)` CHECK `0–100 AND score=trunc(score)` (integer-valued), `UNIQUE(node_id,user_id)`; `folder_ratings.score integer` CHECK `0–100`, `UNIQUE(folder_id,user_id)`. Matches migration 118. |
| D2 | PROVEN | `get_feed` has 17 params; friend filter = edge counterpart (`p_friend_id`, `p_filter_friend_ids`), tag filter = `p_filter_tag_ids` (+`p_search_query` matches tag labels). **No `node_type` filter. No seen/unseen concept anywhere** (only `notifications.read`, `categorization_suggestions.reviewed_at`, `users.onboarding_dismissed_at`). |
| E1 | PROVEN | `searchYouTubeVideos(accessToken,q)` → `GET youtube/v3/search` (`part=snippet&type=video&maxResults=10`) + batched `GET /videos`. Uses the **user's OAuth bearer token** — no API key, no cache, no quota guard. Route requires auth + stored YouTube token → guests get 401 `not_connected`. Guests **cannot** search today. |
| E2 | PARTIAL/UNVERIFIED | Only an OAuth client (`GOOGLE_CLIENT_ID/SECRET`) exists — **no YouTube API key anywhere**. GCP project name is not derivable from the client ID; quota usage not visible → UNVERIFIED. |
| E3 | PROVEN | YouTube API data persisted in `nodes` (title/url/thumbnail→`thumbnails` bucket), `translations.description`, `tags`/`tag_translations` ("YouTube", channel name, category), `youtube_connections` (encrypted tokens, channel id/title, email, scopes). Cron `/api/youtube/sync` 2×/day only **adds** new likes; nothing refreshes or deletes stored metadata → no 30-day refresh/delete mechanism exists. |
| E4 | PROVEN (code) / UNVERIFIED (console) | `login/page.tsx:35` and `signup/page.tsx:23` still request `youtube.readonly` + offline + consent at HEAD; only 2 `signInWithOAuth` call sites exist; no basic-scope-only path; no `signInAnonymously`/`linkIdentity` anywhere. Google consent-screen status: UNVERIFIED (needs Cloud Console). |
| F1 | PROVEN | No PWA manifest, no service worker, no Capacitor/Cordova/Expo, no android/ios project. Only a Chrome MV3 extension (`extension/manifest.json`). |
| F2 | PROVEN | Installed: `next@16.3.8`, `react@19.2.4`, `@supabase/ssr@0.10.2`, `next-intl@4.14.7`. `next.config.ts` has **no** `output` key (no static export). |
| F3 | PROVEN | Cookie/session-dependent: `proxy.ts` (every request), `getSupabaseServerClient` (all server components, all server actions via `sessionRpc`, all API routes except `/api/extension/*` bearer + cron), `/callback` OAuth exchange, `yt_oauth_state/next` cookies, next-intl locale cookie. Bearer-token precedent exists (`lib/supabase/bearer.ts`). |
| G1 | PROVEN | Repo `supabase/migrations` = 137 files; live `schema_migrations` = 137 rows — **identical sets, zero mismatches**. Latest = 141 both sides. Numbering gaps (030,050,052,053) absent on both. |
| G2 | PROVEN | `docs/01_PRD.md` = **v28.0**. v2 Recommendation Inbox PRD = `docs/05_PRD_V2_RECOMMENDATION_INBOX.md` **v2.1** — present on branch `devin/plan-v2-001-r1` only (not on `origin/main`). |
| G3 | PROVEN | P1-1 card-click: **not fixed** (no code change since audit). P1-2 extract-node-metadata: **not fixed** (last change 2026-09-03). P1-3 avatars CSP: **fixed** (`lh3.googleusercontent.com` in `img-src`, commit `0947b1c`). P1-4 Realtime CSP: **fixed** (`wss://lzkzfqshnjvlzosnntfx.supabase.co` in `connect-src`, same commit). |

---

## 2. Evidence

### A. Guests (anonymous users)

#### A1 — Is anonymous sign-in enabled?

**Method:** live probe permitted by the task (Management API auth-config not exposed by available tooling). `POST /auth/v1/signup` with empty JSON body is the anonymous sign-in endpoint; a disabled provider rejects without creating a user.

Command (keys loaded from `.env.local` into shell vars, never printed):

```bash
SUPA_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
ANON_K=$(grep -E '^ANON_KEY=' .env.local | cut -d= -f2-)
curl -s -X POST "$SUPA_URL/auth/v1/signup" \
  -H "apikey: $ANON_K" -H "Authorization: Bearer $ANON_K" \
  -H "Content-Type: application/json" -d '{}'
```

Verbatim output:

```json
{"code":422,"error_code":"anonymous_provider_disabled","msg":"Anonymous sign-ins are disabled"}
```

HTTP status: `422`. **No user was created** — `auth.users.is_anonymous` count verified `0` before and after (see A2 output). Nothing to delete. This is definitive live evidence, stronger than docs.

#### A2 — users-row trigger + NOT NULL columns

Live trigger (pg_trigger → pg_get_functiondef):

```
auth.users | ensure_user_profile_trigger | ensure_user_profile | SECURITY DEFINER
```

Function body (verbatim, trimmed):

```sql
v_display_name := COALESCE(
  NEW.raw_user_meta_data->>'full_name',
  NEW.raw_user_meta_data->>'name',
  split_part(NEW.email, '@', 1),
  'user'
);
...
INSERT INTO public.users (id, display_name, normalized_display_name, language_code,
                          avatar_key, avatar_change_count_today, created_at)
VALUES (NEW.id, v_display_name, v_base_name, 'en', v_avatar, 0, NOW())
ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN unique_violation THEN
  -- retry with normalized_display_name || '_' || left(NEW.id::text,4)
...
IF NEW.email IS NOT NULL THEN
  UPDATE public.friend_invites SET to_user_id = NEW.id
   WHERE lower(to_email) = lower(NEW.email) AND to_user_id IS NULL;
END IF;
```

For an anonymous user (`email=NULL`, `raw_user_meta_data={}`): display_name falls through to `'user'`; the friend_invites block is skipped. A `public.users` row **is** created.

Empirical proof — simulation inside `BEGIN … ROLLBACK` (SELECT/INSERT probe, rolled back):

```sql
BEGIN;
INSERT INTO auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('99999999-0000-4000-8000-00000000aa01', 'authenticated', 'authenticated', true, '{}'::jsonb, '{}'::jsonb, now(), now());
SELECT id, display_name, normalized_display_name, language_code, avatar_key FROM public.users WHERE id = '99999999-0000-4000-8000-00000000aa01';
ROLLBACK;
```

Verbatim output:

```
                  id                  | display_name | normalized_display_name | language_code | avatar_key 
--------------------------------------+--------------+-------------------------+---------------+------------
 99999999-0000-4000-8000-00000000aa01 | user         | user                    | en            | 
(1 row)
```

`public.users` columns — NOT NULL **without** default (information_schema):

```
 display_name             | text | NO | (no default)
 normalized_display_name  | text | NO | (no default)
```

(`id` has `gen_random_uuid()` default but the trigger supplies `NEW.id`; `created_at`→`now()`, `language_code`→`'en'`, `avatar_change_count_today`→`0`.) The trigger supplies both required columns → anonymous insert cannot fail on NOT NULL.

#### A3 — RLS policies + RPC EXECUTE grants for `is_anonymous=true`

Live `pg_policies` dump (public schema): **64 policies across all 39 tables; every table has `relrowsecurity=t`; zero RESTRICTIVE policies; zero policies whose qual/check mentions `anonymous`, `is_anonymous`, or `auth.jwt`** (grep of full dump: no matches). Policy roles are only `{authenticated}` and `{service_role}` — no `anon` policies exist.

Consequences for a JWT with `is_anonymous=true` (PostgREST role = `authenticated`, `auth.uid()` = the anonymous user's id):

- **Admitted identically to any authenticated user:** every `TO authenticated` policy applies — all own-row policies (`*_own`: users can't read others' rows except via edge-scoped `users_select_scoped`), edge-visibility policies (`nodes_select_visible`, `edges_select_policy`, `ratings_select_visible`, `tag_edges_select_visible`, `external_items_map_select_visible`, `nodes_sort_cache_select_visible`, `node_messages_select_scoped`), folder/group-scoped policies (`folder_is_accessible`, `folder_is_visible`-family, `group_is_member`-family), and write policies (`friend_invites_insert`, `node_notes_insert_own`, `unp_*`, `youtube_connections_*_own`, `node_classifications_*`, `blocks_*`, `card_positions_*`, etc.).
- **`USING(true)` reference tables readable by ALL authenticated users (incl. anonymous): exactly 4** — `tags`, `tag_translations`, `translations`, `external_sources` (all `SELECT TO authenticated USING (true)`). Note: the "8 reference tables" figure in `docs/plans` item N8 is **stale** — `ratings`, `nodes_sort_cache`, `tag_edges`, `external_items_map` now carry visibility-scoped policies (live dump above), leaving 4. (4 additional `USING(true)` policies exist `TO service_role` only: `folder_admins`/`group_admins` DELETE+INSERT, `notifications` INSERT.)
- **Tables with RLS on but zero policies** (deny-all for authenticated): `categorization_suggestions_backup_20260927`.
- **RPC EXECUTE:** 142 public functions. ACLs show ~31 revoked from `authenticated` (all `_`-prefixed helpers plus `change_folder_permission`, `change_node_permission`, `create_group`, `effective_*_permission`, `folder_is_*`, `get_folder_permission`, `get_node_permission`, `hard_delete_node`, `has_*_permission`, `increment_view_count`, `set_custom_order`, `unshare`, `update_avatar_key`, `update_display_name`, `update_node_title`, `create_tag_with_translation`, `nodes_guard_immutable_columns`). The remaining **~91 app functions are EXECUTE-granted to `authenticated`** — including `create_folder`, `create_node_with_metadata`, `import_url`, `add_node_to_folder`, `share_folder_v2`, `share_node`, `get_feed`, `get_folder`, `upsert_rating`, `rate_folder`, `invite_friend`, `remove_friend`, `hard_delete_folder`, `trash_folder`, `restore_*`, `set_*`, `move_*`, group member/admin RPCs, etc. **No function body references `anonymous`, `is_anonymous`, or `auth.jwt`** (pg_proc scan: 0 hits) → nothing rejects an anonymous caller internally; each RPC's own `auth.uid()`/permission logic is the only gate.
- **`anon` role (unauthenticated):** table-level GRANTs exist (Supabase defaults, 273 grant rows) but **zero RLS policies target `anon`** → all tables deny. Function EXECUTE for `anon`: only `ensure_user_profile` (trigger fn) + pg_trgm support functions — no app RPC.

#### A4 — anonymous user as grantee / edge endpoint

```
 folder_grants | folder_grants_grantee_id_fkey  | FOREIGN KEY (grantee_id) REFERENCES users(id) ON DELETE CASCADE
 folder_grants | folder_grants_granted_by_fkey  | FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
 edges         | edges_user_id_fkey             | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
 edges         | edges_sender_id_fkey           | FOREIGN KEY (sender_id) REFERENCES users(id)
 folder_edges  | folder_edges_added_by_fkey     | FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
 group_members | group_members_user_id_fkey     | FOREIGN KEY (user_id) REFERENCES users(id)
 notifications | notifications_user_id_fkey     | FOREIGN KEY (user_id) REFERENCES users(id)
 ratings       | ratings_user_id_fkey           | FOREIGN KEY (user_id) REFERENCES users(id)
 nodes         | nodes_owner_id_fkey            | FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
```

`public.users.id` itself has **no FK to `auth.users`** (0 FK constraints on `public.users`) — profile rows are trigger-created, not cascade-linked. Since every auth user (anonymous included) gets a `public.users` row (A2), an anonymous user id is a valid `grantee_id`/`user_id`/`sender_id` everywhere. Caveat: `users_select_scoped` lets a user see only their own row or edge-connected users' profiles.

---

### B. Folder contribute path

#### B1 — trace of `add_node_to_folder` by contributor B on A's folder F

Live definitions (pg_get_functiondef, verbatim essentials):

`add_node_to_folder(p_node_id uuid, p_folder_id uuid)` — SECURITY DEFINER:

```sql
v_uid UUID := auth.uid();
IF auth.role() <> 'service_role' THEN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._node_visible(p_node_id, v_uid) THEN
    RAISE EXCEPTION 'node not accessible'; END IF;
  IF public._perm_rank(public.effective_folder_permission(p_folder_id, v_uid)) < 3 THEN
    RAISE EXCEPTION 'folder not accessible (need contribute)'; END IF;
END IF;
INSERT INTO folder_edges (node_id, folder_id, added_by) VALUES (p_node_id, p_folder_id, ...) ON CONFLICT DO NOTHING;
-- if inserted:
PERFORM public._expand_folder_grants_for_node(p_node_id, p_folder_id, v_uid);
PERFORM public._notify_folder_item_added(p_folder_id, p_node_id, v_uid);
```

`_node_visible(node,user)` — node must be `deleted_at IS NULL` AND (`owner_id=user` OR `EXISTS edges e WHERE e.node_id=node AND e.user_id=user`) AND no `blocks` row either direction. **Any edge counts** (sent or received) — B need not own the node, only see it.

`effective_folder_permission(folder,user)` — owner→`'admin'`; else `MAX(_perm_rank(e.permission))` over `edges WHERE folder_id=F AND user_id=B` mapped via `_perm_name` (view=1, comment=2, **contribute=3**, edit=4, reshare=5, admin=6). Grants materialize as folder-level edges via `_expand_grant_on_scope` at share time.

`_expand_folder_grants_for_node(node, folder, actor)` — for every `folder_grants` row on the folder **or its ancestors** (`folder_tree`), skipping self-grants and blocked pairs: inserts a `causes` row (`cause_type='folder_grant_expand'`, `created_by=granted_by`, `folder_grant_id=grant`, metadata `{node_id,in_folder_id,added_by}`) then **two edges**: `(node_id, grantee_id, 'received', sender_id=granted_by, permission=grant.permission)` and `(node_id, granted_by, 'sent', sender_id=granted_by, permission=grant.permission)`.

`_notify_folder_item_added(folder,node,actor)` — `v_owner = folders.owner_id`; early-returns only when `v_owner = actor` AND no grants exist. Otherwise inserts `notifications(type='folder_item_added', payload={folder_id,node_id,actor_id}, read=false)` for `v_owner` UNION all `edges.user_id WHERE folder_id=F`, excluding actor and blocked pairs.

**Answers:**
- **(a)** B may add **any node `_node_visible` to B** — own nodes AND nodes shared to B (any edge). Not restricted to B-owned nodes.
- **(b)** YES — A gains visibility: for B's own grant row (`grantee=B, granted_by=A`), the expansion writes a `sent` edge `(node, user_id=A)` → `_node_visible(node,A)` becomes true; every *other* grantee on F/ancestors also gets a `received` edge → they see B's contribution too, with their own grant permission.
- **(c)** Notification `folder_item_added` to folder owner A (and any other folder-edge holders), payload `{"folder_id","node_id","actor_id":B}`, `read=false`.

#### B2 — BEGIN…ROLLBACK simulation (verbatim)

Accounts: A = `laurent.martenot@gmail.com` → `5355c879-a734-40be-9699-1cb1b2572cff`; B = `a@a.com` → `8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7` (from `auth.users`). Method: single psql session, `BEGIN`, `SET LOCAL ROLE authenticated`, `set_config('request.jwt.claims', '{"sub":..,"role":"authenticated","is_anonymous":false}', true)` per actor — `auth.uid()`/`auth.role()` read these GUCs (defs verified). Full script at `$TEMP/v2inv001_b2.sql`; key output:

```
a_folder_id = c19d5d61-cfb8-4ba7-9324-cab29bc935fb        (create_folder as A)
a_share_count = 1                                          (share_folder_v2 'contribute' → B)
b_node_id     = 3d32cd3a-c7a0-4ea9-ae02-d28e71aa01a0       (create_node_with_metadata as B, owner=B)
b_add_result  = (void)                                      (add_node_to_folder OK)
```

Edges on the node as seen by A after switching claims back to A:

```
 node_id                | user_id(A)              | direction | sender_id(A)            | permission
 3d32cd3a-…              | 5355c879-…(A)           | sent      | 5355c879-…(A)           | contribute
 3d32cd3a-…              | 8d10c9d1-…(B)           | received  | 5355c879-…(A)           | contribute
```

`get_feed` as A (`p_user_id=A, p_limit=200`, filtered to node):

```
 node_id | title 'V2INV001 Probe Node' | owner_id=B | direction='sent' | sender_id=A
```

`get_folder(F)` as A:

```
 id=c19d5d61… | name='V2INV001 Probe Folder' | my_permission='admin' | is_shared=t
 node_ids = {3d32cd3a-c7a0-4ea9-ae02-d28e71aa01a0}   ← B's node IS listed
```

Notification as A:

```
 user_id=A | type='folder_item_added' | read=f
 payload={"node_id":"3d32cd3a-…","actor_id":"8d10c9d1-…(B)","folder_id":"c19d5d61-…"}
```

`folder_grants`: `(F, grantee=B, 'contribute', granted_by=A)`; `folder_edges`: `(node, F, added_by=B)`. Then `ROLLBACK`. Post-checks: `folders`/`nodes`/`notifications` residue counts for the probe objects = **0**; `auth.users.is_anonymous` count = **0** (unchanged).

**Conclusion:** the contribute path works end-to-end at HEAD — a contributor's node lands in the owner's folder, the owner sees it in feed + folder, and gets a notification. Proven, not inferred.

#### B3 — RPCs that create nodes

pg_proc scan for `INSERT INTO nodes`: **exactly two** — `create_node_with_metadata`, `import_url`. Both begin:

```sql
IF NOT (auth.role() = 'service_role'
        OR (auth.role() = 'authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid())) THEN
  RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
END IF;
```

→ for `authenticated` callers the node owner **cannot** differ from `auth.uid()`. (`create_folder_with_nodes`, `create_group`, `is_group_admin`, `get_friend_bar`, `move_node_everywhere`, `move_node_to_folder` carry the same guard pattern for their owner/user params.) App-level writers all pass the session user's id through the **service client** (`lib/db/nodes.ts:94,139,213` — `getSupabaseServiceClient()`), where `auth.role()='service_role'` exempts the check; the cron sync (`lib/youtube/sync.ts`) does the same. No authenticated-callable RPC creates a node owned by someone else.

#### B4 — UNIQUE constraints on `nodes.url`

```
 nodes_url_owner_id_key | UNIQUE CONSTRAINT, btree (url, owner_id)
```

Owner-scoped, **not global**. `import_url` maps the violation to `DUPLICATE_NODE`; `create_node_with_metadata` has no handler → raw `unique_violation`. Two different users may save the same URL.

#### B5 — link-based folder grant?

**Refuted.** Evidence:
- `folder_grants` columns: `id, folder_id, grantee_id, permission, granted_by, created_at, updated_at` — no token/key column.
- Grant-creating RPCs: `share_folder_v2` (recipients = explicit `uuid[]`, `p_all_friends` via `friend_invites`, or `p_group_id` members — all resolved to **existing user ids** by `_share_recipients`), `set_folder_grant_permission`, `grant_folder_admin`. No token/redeem/invite-link function exists (pg_proc name scan: only `_share_recipients`, `invite_friend`, `share_folder_v2`, `share_node`, `unshare`).
- `invite_friend(p_email)` → `friend_invites(to_email, to_user_id)` — email-only; `to_user_id` backfilled by the auth trigger on signup.
- `ShareSheet.tsx:28-31` comment: *"External link for copy / native share … public links need a share-token migration (flagged to user)."* — the share URL is the plain app URL.
- `group_share(UUID,UUID,UUID,TEXT)` was `DROP FUNCTION`'d in `supabase/migrations/132_drop_superseded_rpcs.sql:37`.

---

### C. Groups

#### C1 — end to end

**Tables:** `groups(id,name,owner_id,deleted_at,created_at)`, `group_members(group_id,user_id)`, `group_admins(group_id,user_id,granted_by)`, `group_nodes(group_id,node_id)`, `group_messages` (+ legacy `direct_chats`,`messages`,`node_messages` — types only, no writers found).

**RPCs (live):**
- `create_group(p_owner_id,p_name,p_member_ids)` — EXECUTE **service_role only**; called via service client `lib/db/friends.ts:136-143` (`createGroup`).
- `add_group_member`, `remove_group_member`, `delete_group`, `grant_group_admin`, `get_group_access_users`, `group_is_member`, `group_is_owned`, `is_group_admin` — authenticated EXECUTE with internal checks.
- Sharing: `share_folder_v2(...,p_group_id)` → `_share_recipients` expands **current** `group_members` → snapshot `folder_grants`+edges (`app/lib/actions/mvp2.ts:246-264`, comments "snapshot edges Q3/Q4"). `share_node` has **no** group param — UI expands groups via `get_group_access_users` then calls `share_node` with user ids (`mvp2.ts:268-281`).
- `get_feed(p_group_id)` filters `group_nodes` — **but no live function writes `group_nodes`** (pg_proc scan: only `get_feed` references it; `group_share` RPC dropped in migration 132). Live `group_nodes` count = **1** (legacy row). → group-context feed is dead code.

**UI exposure:**
- `/friends` → `FriendsView.tsx`: create group (`createGroupAction`), delete (`deleteGroupAction`), add member (`addGroupMemberAction`) — lines 74-115.
- `ShareSheet.tsx:128-134`: groups listed as share-target checkboxes; wired from `CardView.tsx:184`, `FolderTile.tsx:152`, `FolderView.tsx:233`, `CardItem.tsx:161`, `FolderRail.tsx:229`.
- **Unreachable from UI:** `removeGroupMemberAction` (`mvp2.ts:510`, zero callers), `grant_group_admin` (zero callers), group feed filter (`filterStore.setContext` has **zero callers** in app/components; `?group=<uuid>` URL param does reach `p_group_id` via `feedParams.ts:182,260` but `group_nodes` is empty), `group_messages` (no writers/UI).

#### C2 — access-users functions

```
 get_group_access_users | t | {postgres=X,authenticated=X,service_role=X}   ← EXISTS
 get_folder_access      | t | {postgres=X,authenticated=X,service_role=X}   ← exists (owner-only)
 get_folder_access_users| — | NOT FOUND
```

`get_group_access_users(p_group_id)` — member-gated, returns member display fields. `get_folder_access(p_folder_id)` — owner-only, returns grantee list. The reported "missing" `get_folder_access_users` is confirmed absent; `get_group_access_users` is **present** (contrary to the audit note).

---

### D. Ratings and feed

#### D1 — live schema (post-118)

```
 ratings.score        numeric(3,1) NOT NULL, CHECK (score>=0 AND score<=100 AND score=trunc(score))
 ratings              UNIQUE (node_id, user_id)  [ratings_node_id_user_id_key]
 ratings_user_id_fkey → users(id); ratings_node_id_fkey → nodes(id) ON DELETE CASCADE
 folder_ratings.score integer NOT NULL, CHECK (score>=0 AND score<=100)
 folder_ratings       UNIQUE (folder_id, user_id) [folder_ratings_folder_user_uniq]
```

`upsert_rating(p_node_id,p_score integer)` enforces 0–100 + `_node_visible`; `rate_folder` same range on `folder_is_visible`. Migration `118_ratings_0_100.sql` is the live source. PROVEN live via `\d`, not just files.

#### D2 — `get_feed` live signature + filters

```
get_feed(p_user_id uuid, p_language_code text='en', p_view text='all',
         p_friend_id uuid, p_folder_id uuid, p_group_id uuid,
         p_filter_tag_ids uuid[], p_filter_friend_ids uuid[], p_filter_folder_ids uuid[],
         p_search_query text, p_sort text='newest',
         p_cursor_created_at timestamptz, p_cursor_node_id uuid,
         p_limit int=20, p_exclude_foldered bool=false, p_custom_order_ids uuid[])
RETURNS TABLE(node_id,url,text_content,title,thumbnail_key,owner_id,language_code,
               origin_user_id,origin_created_at,created_at,avg_rating,view_count,
               share_count,direction,sender_id,sender_name,sender_avatar_key,tags,total_count)
```

- **Friend/contributor:** `p_friend_id` (single counterpart) + `p_filter_friend_ids uuid[]` — both filter by **edge sender/user pairs**, i.e. sharing counterpart, *not* folder-contributor. Folder-scoped filtering exists via `p_folder_id`/`p_filter_folder_ids` (folder_edges membership).
- **Tag:** `p_filter_tag_ids` (exact-set match on tag_edges) + `p_search_query` also matches tag labels.
- **node_type:** **no parameter exists** — cannot filter by node_type through get_feed.
- **Sorts:** newest/oldest/most_shared/highest_rated/alpha/custom (+cursor pagination, p_limit, total_count).
- **Seen/unseen:** schema-wide column scan (`%seen%|%read%|%viewed%|%watched%|%dismiss%`) → only `notifications.read`, `categorization_suggestions.reviewed_at`, `categorization_suggestions_backup_20260927.reviewed_at`, `users.onboarding_dismissed_at`. **No per-node/per-item seen state exists** (confirms PORTFOLIO-AUDIT-001 P2-6).

`get_node_friend_ratings(p_node_id,p_user_id)` returns ratings **only from `friend_invites`-linked users** (or self) — guests/contributors without a `friend_invites` row would NOT appear in that rail even though their `ratings` rows exist.

---

### E. YouTube

#### E1 — `searchYouTubeVideos` (lib/youtube/client.ts:390-462)

```ts
const searchParams = new URLSearchParams({
  part: "snippet", type: "video", maxResults: "10", q: query,
});
const res = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
// then batched:
const vidsRes = await fetch(`${YOUTUBE_API_BASE}/videos?${videosParams}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

- Endpoint `https://www.googleapis.com/youtube/v3`; `search.list` (100 quota units/call) + one `videos.list`.
- Credential: **user OAuth access token** (parameter `accessToken`). No API key, no `key=` param anywhere (grep: zero `YOUTUBE_API_KEY` hits).
- **No caching, no rate limiting, no quota guard** — only 403/429 → error-string mapping.
- Caller `app/api/youtube/search/route.ts:16-30`: `supabase.auth.getUser()` → 401 if none; `getStoredYouTubeToken(user.id)` → 401 `{code:"not_connected"}` if no `youtube_connections` row; then `searchYouTubeVideos(auth.token.accessToken, q)`.
- **A user with no stored YouTube token (e.g., a guest) cannot search today** — both gates fail before any Google call.

#### E2 — Google Cloud project / quota

- Only `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars exist (OAuth client for both Supabase Google sign-in scopes and the standalone `/api/youtube/connect` flow, `connect/route.ts:45-52` scope `youtube.readonly`). **No API key exists in repo or env names.**
- GCP **project name is not derivable** from a client ID → UNVERIFIED. Quota usage dashboards → UNVERIFIED (no Google Cloud access).

#### E3 — persisted YouTube API data

| Data | Where | Evidence |
|---|---|---|
| Video title, watch URL, `node_type='video'` | `nodes` (1,680 rows match `youtube.com`/`youtu.be`) | `lib/youtube/sync.ts` → `importUrl` → `import_url` RPC |
| Video description | `translations.description` | `import_url` §8 |
| Thumbnail image | Supabase Storage bucket `thumbnails` (public) via `downloadAndUploadThumbnail` → `nodes.thumbnail_key` | `sync.ts:79-83`, storage.buckets = `thumbnails` only |
| Channel name, "YouTube", category name | `tags`/`tag_translations`/`tag_edges` labels | `sync.ts:74-78` `tagLabels` |
| OAuth tokens (encrypted), `channel_id`, `channel_title`, `google_account_email`, `scopes` | `youtube_connections` (2 rows live) | `\d` + `persist-connection.ts`, `callback/route.ts:162` |

**Refresh/delete jobs:** Vercel Cron `GET /api/youtube/sync` twice daily (`vercel.json`, CRON_SECRET-gated, `app/api/youtube/sync/route.ts`) — pages `likes.list` and imports **new** videos only; duplicates skipped by `(url,owner)` unique. **No job updates or deletes stored titles/descriptions/thumbnails/tags.** Disconnect (`app/api/youtube/disconnect/route.ts:53-62`) nulls tokens + sets `revoked_at` — imported nodes/tags/thumbs persist. → **No 30-day refresh-or-delete mechanism exists** for stored YouTube API data (Google ToS gap, already live in prod data).

#### E4 — OAuth scopes at HEAD

- `app/(auth)/login/page.tsx:35`: `scopes: "https://www.googleapis.com/auth/youtube.readonly"` — confirmed.
- `app/(auth)/signup/page.tsx:23`: same — confirmed.
- Both also `access_type:"offline"`, `prompt:"consent"`.
- Only **two** `signInWithOAuth` call sites in the entire codebase; no email/password, magic-link, OTP, `signInAnonymously`, or `linkIdentity` anywhere (grep-verified). `/api/youtube/connect` also requests `youtube.readonly` — a second YouTube-grant path, same scope.
- **No basic-scope-only sign-in path exists.**
- Google OAuth consent-screen status (Testing vs Production): **UNVERIFIED** — requires Google Cloud Console.

---

### F. Packaging

#### F1 — PWA / native

- `public/` contains only images + `liked-extension.crx`/`.zip` — **no `manifest.json`, no `sw.js`**.
- Grep for `rel="manifest"`, `serviceWorker`, `workbox`, `navigator.serviceWorker` across `app/ components/ lib/` → **zero hits** (only the word "manifest" in unrelated comments + `extension/manifest.json`).
- `extension/manifest.json` = **Chrome extension MV3** (`"manifest_version": 3`, popup action) — browser extension, not app packaging.
- No `android/`, `ios/`, `capacitor.config.*`, `cordova`, `expo`, `app.json`, `eas.json` → **no native project of any kind.**

#### F2 — versions + export

Installed (`node_modules/*/package.json`): `next 16.3.8`, `react 19.2.4`, `react-dom 19.2.4`, `@supabase/ssr 0.10.2`, `@supabase/supabase-js 2.103.2`, `next-intl 4.14.7`.
`next.config.ts`: `allowedDevOrigins`, `outputFileTracingIncludes`, `headers()` (CSP etc.), `images.remotePatterns` — **no `output` key** → no `output:'export'`/static export.

#### F3 — cookie/session-dependent features (would differ inside a native WebView shell)

| Feature | Mechanism | Evidence |
|---|---|---|
| Every page request | `proxy.ts` middleware: `createServerClient` + `request.cookies` → session refresh + redirects to `/login`/`/feed` | `proxy.ts:11-55` |
| All server components + server actions | `getSupabaseServerClient()` → `next/headers` `cookies()` | `lib/supabase/server.ts:4-26`; `sessionRpc` `app/lib/actions/mvp2.ts:18-27` |
| Nearly all API routes | same cookie client + `auth.getUser()` (`/api/youtube/*`, `/api/import`, `/api/categorize`, `/api/classify`, `/api/nodes`, `/api/users`, `/api/folders`) | e.g. `app/api/youtube/search/route.ts:16-20` |
| Google sign-in + YouTube connect | `/callback` code exchange sets session cookies; `yt_oauth_state`/`yt_oauth_next` httpOnly cookies | `app/api/youtube/connect/route.ts:33-43`, `app/(auth)/callback/` |
| Locale | `LOCALE_COOKIE` read server-side by next-intl | `i18n/request.ts` |
| Exceptions already cookieless | `/api/extension/*` via `Authorization: Bearer` (`lib/supabase/bearer.ts`); `/api/youtube/sync` via `CRON_SECRET` | `bearer.ts:19-46`, `sync/route.ts:18-22` |

In a WebView wrapper pointed at the hosted URL these are first-party cookies and mostly work, **but**: (a) OAuth redirects navigate the WebView to `accounts.google.com` — the shell must permit that navigation and return; (b) there is **no static export** — the app cannot be bundled as static assets; it requires the Next.js server (RSC, server actions, route handlers, `proxy.ts`) and Vercel Cron; (c) session persistence depends on the shell preserving the WebView cookie jar across restarts.

---

### G. Housekeeping

#### G1 — migration drift

Repo `supabase/migrations/`: 137 files (numbers 001–141 with gaps 030,050,052,053).
Live `supabase_migrations.schema_migrations`: 137 rows.
Normalized comparison: **identical sets — zero mismatches.** Latest = `141` (`node_classifications`) on both sides.

#### G2 — PRD versions

- `docs/01_PRD.md` header: **"Version: 28.0 … Status: AUTHORITATIVE"** (v28.0 adds §41 YouTube-core pivot).
- v2 Recommendation Inbox PRD: `docs/05_PRD_V2_RECOMMENDATION_INBOX.md` — **"Version: 2.1"**, v2.0 APPROVED 2026-11-20, v2.1 amendments 2026-11-21 pending sign-off. **Present only on branch `devin/plan-v2-001-r1`** (commits `4444833`, `665b193`) — `git ls-tree origin/main docs/` shows it is **not on main**. `docs/PLAN-V2-001.md` (implementation plan) is on the same branch.

#### G3 — PORTFOLIO-AUDIT-001 section F, P1 items 1–4 at HEAD

| # | Item | Status at HEAD | Code evidence |
|---|---|---|---|
| 1 | Feed card clicks dead for `a@a.com` | **NOT FIXED** | No commits touching `app/(app)`/`components` since the audit (only `0947b1c`, CSP/flow-only). `FeedHome.tsx:337,371` still `<Link className="card-link">`; root cause (hydration #418) unaddressed. Runtime repro not re-attempted → fix-status by code evidence only. |
| 2 | `extract-node-metadata` unreliable (YouTube/IMDb/Netflix) | **NOT FIXED** | Last change `af1a2d4` (2026-09-03), predates audit; no reliability commit since. |
| 3 | Google avatars blocked by CSP | **FIXED** | `0947b1c` (ancestor of HEAD) added `https://lh3.googleusercontent.com` to `img-src`; present in `next.config.ts` at HEAD. |
| 4 | Supabase Realtime blocked by CSP | **FIXED** | Same commit added `wss://lzkzfqshnjvlzosnntfx.supabase.co` to `connect-src`; present at HEAD. |

---

## 3. Blocks the reuse approach?

Items that would **prevent** building the Recommendation Inbox on the existing engine as-is, each with evidence:

1. **A1 — Guests cannot authenticate at all.** Anonymous sign-in is disabled on `lzkzfqshnjvlzosnntfx` (live 422 `anonymous_provider_disabled`). Until the dashboard toggle is enabled there is no guest identity to build on. *Config blocker, not code.*

2. **B5/A4-flow — No link→grant primitive exists.** `folder_grants.grantee_id` must be an existing `public.users` id; `share_folder_v2`/`_share_recipients` resolve recipients only from explicit user ids, `friend_invites` (email-bound), or group members. An "Ask link" opened by a no-account guest cannot create or attach a grant with any existing RPC — the guest's user id does not exist until after anonymous sign-in, and nothing maps link→grant. The contribute machinery (B1/B2) only works **after** a grant exists. *Requires a new mechanism regardless of reuse vs. new tables.*

3. **E1 — Guests cannot use YouTube search on the existing path.** `/api/youtube/search` requires `auth.getUser()` + a per-user `youtube_connections` token (401 `not_connected` otherwise); `searchYouTubeVideos` needs a user OAuth bearer — no API-key path, no cache/quota guard; `search.list` ≈100 units/call against a project-wide daily quota shared by all users' tokens. No TMDB code exists anywhere (grep: docs only). *Guest recommendation search needs a new server-side path or a different quota model.*

4. **A3 — Nothing isolates anonymous users.** Zero `is_anonymous` checks in any of 64 RLS policies or 142 function bodies. An anonymous JWT gets the full `authenticated` surface (~91 app RPCs incl. folder/share/trash/rating/youtube-connection writes + own-row table access + 4 `USING(true)` reference tables). PRD v2 §13 ("no guest can read any table directly") is currently false and no restrictive policies exist. *Guests cannot be exposed to prod without new RLS — a precondition for any reuse design.*

5. **D2 — No seen/unseen state exists.** Schema-wide scan finds no per-node seen/read state (only `notifications.read`, `categorization_suggestions.reviewed_at`, `users.onboarding_dismissed_at`). Inbox "unseen count"/seen tracking cannot reuse existing state — new state is unavoidable.

**Not blocks (verified reusable):** the contribute path itself (B1/B2 proven — guest node → owner folder → owner feed/folder/notification), 0–100 integer ratings (`upsert_rating`/`rate_folder`, though `get_node_friend_ratings` is `friend_invites`-scoped so non-friend contributors won't appear in that rail), edge-based visibility, `get_feed`/`get_folder` reads, folder grants/permissions model, notifications.

## 4. Could not verify

| Item | Why |
|---|---|
| E2 GCP project name owning the OAuth client / any API key | Client ID does not encode project name; no Google Cloud access. No API key exists in repo/env names (verified absence, not presence). |
| YouTube Data API quota usage | No Google Cloud/quota console access; only 403/429 error strings exist in code. |
| E4 Google OAuth consent-screen status (Testing vs Production) | Requires Google Cloud Console; not in repo/Vercel env. |
| A1 via Management API auth config | MCP Supabase toolset exposes no auth-settings endpoint; used the task-permitted live `signInAnonymously`-equivalent probe instead (created no user). |
| P1-1 card-click runtime behavior | Audit was runtime/hydration (#418); no fix commit exists since — status reported by code evidence only, no live repro attempted (read-only scope). |
| Whether `a@a.com`-class dead clicks affect other accounts | Same as audit — only code-level evidence available. |
| Exact PostgREST behavior for `is_anonymous` JWT claim name | Docs-verified claim is `is_anonymous`; no live anonymous user exists to probe (sign-in disabled). RLS relevance is nil anyway — nothing reads the claim. |

---

*End of report — V2-INV-001. All DB access was SELECT-only or BEGIN…ROLLBACK; the single live auth probe returned 422 and created no user; zero residue verified post-simulation.*
