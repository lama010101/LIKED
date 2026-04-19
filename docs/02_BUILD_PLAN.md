# LIKED — Phased Build Plan

**Version: 1.0**  
**Status: AUTHORITATIVE**  
**Companion to: 01_PRD.md v26.0**  
**Target environment: Windsurf Editor + Cascade AI agent**  
**Stack: Next.js 15 (App Router) · React · Tailwind CSS · Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)**

---

## HOW TO USE THIS DOCUMENT

### For the developer (you)
- Work **strictly in phase order**. Do not skip ahead. Later phases depend on earlier ones being correct.
- Each phase has a **Gate Condition** — the phase is not done until ALL gate conditions pass. Do not advance until they do.
- Each task has a **Task ID** (e.g., `P1-T01`). Always reference the Task ID in Cascade prompts and replies.
- When a phase is complete, check off its gate conditions and commit before starting the next phase.

### For Cascade
- Every Cascade session should begin by stating the active Task ID.
- Cascade must not implement features from future phases, even if it seems logical.
- Cascade must read `01_PRD.md` before starting any task that touches data models, visibility, or writes.
- All Cascade replies must include the Task ID they addressed.

### Non-negotiable constraints (repeat these to Cascade every session)
1. Visibility = edge existence only. No exceptions.
2. Every edge must have a non-null `cause_id`.
3. No `UNIQUE(node_id, user_id)` on the `edges` table.
4. All writes are atomic transactions with rollback on failure.
5. Soft delete never removes causes or edges.

---

## PHASE OVERVIEW

| Phase | Name | Scope | Complexity |
|-------|------|-------|------------|
| P1 | Foundation | Repo + Supabase + DB schema + auth + seed | High |
| P2 | Core Feed | Node creation, visibility query, basic card display | High |
| P3 | Sharing System | Causes + edges + friends + groups | Very High |
| P4 | Folders | Folder CRUD, folder sharing, breadcrumb nav | High |
| P5 | UI Shell | All bars, FAB, modals, view modes, layout | High |
| P6 | Tags & Ratings | Full tag system, rating system, sort | Medium |
| P7 | Advanced Interactions | Drag-and-drop, multi-select, long-press, trash | High |
| P8 | Media & Cards | Embeds, card detail modal, metadata extraction | Medium |
| P9 | Search & Filters | Search, multi-filter, clear filters | Medium |
| P10 | Realtime & Polish | Supabase subscriptions, notifications, activity log | Medium |
| P11 | Advanced Views | Infinite canvas, horizontal rows, multilingual | High |
| P12 | Admin & Permissions | Folder/group admins, admin grant flow | Medium |
| P13 | Chat | Deferred — last phase per PRD §28 | TBD |

**Estimated minimum viable product (MVP):** Phases P1–P5 complete = working app with creation, feed, sharing, folders, and full UI.

---

## PHASE 1 — Foundation

**Goal:** A running Next.js 15 app connected to a real Supabase project with the complete schema deployed, auth working, and seed data visible.

**PRD sections:** §4 (data model), §23 (auth), §35 (SQL schema), §4.9 (seed data)

---

### P1-T01 — Initialize Next.js 15 project

**Cascade prompt:**
> Project: LIKED · Task: P1-T01  
> Initialize a new Next.js 15 project using the App Router. Use TypeScript. Install and configure Tailwind CSS v3. Install the Supabase JS client (`@supabase/supabase-js`) and Supabase SSR helper (`@supabase/ssr`). Create a `.env.local` file with placeholder keys for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Create a `lib/supabase/` directory with: `client.ts` (browser client), `server.ts` (server client using cookies), and `middleware.ts` (session refresh middleware). Set up `middleware.ts` at project root to refresh sessions on all routes. Please include Task ID P1-T01 in your reply.

**Acceptance criteria:**
- [ ] `npm run dev` starts without errors
- [ ] Tailwind styles apply correctly on a test page
- [ ] Supabase client exports are importable without TypeScript errors
- [ ] Middleware runs on every route

---

### P1-T02 — Deploy complete database schema

**Cascade prompt:**
> Project: LIKED · Task: P1-T02  
> Using the complete SQL schema in §35 of `01_PRD.md`, create a Supabase migration file at `supabase/migrations/001_initial_schema.sql`. The file must include ALL tables exactly as specified: users, nodes, causes, edges, ratings, nodes_sort_cache, groups, group_nodes, group_members, group_admins, folders, folder_edges, folder_tree, folder_admins, tags, tag_translations, tag_edges, translations, blocks, external_sources, external_items_map, notifications, activity_log. Include all indexes (`edges_node_user_idx`, `edges_cause_idx`, `tag_translations_lookup_idx`). Do NOT add any columns or constraints beyond what is in §35. Specifically: edges must have NO UNIQUE(node_id, user_id) constraint. Also create `supabase/migrations/002_rls.sql` enabling Row Level Security on all tables but with permissive policies for now (allow all for authenticated users) — we will tighten these in P3. Please include Task ID P1-T02 in your reply.

**Acceptance criteria:**
- [ ] Migration applies cleanly via `supabase db push` with zero errors
- [ ] All 23 tables exist in Supabase dashboard
- [ ] `edges` table has no unique constraint on `(node_id, user_id)` — verify in schema inspector
- [ ] RLS is enabled on all tables
- [ ] `nodes_sort_cache` exists with `avg_rating`, `view_count`, `share_count`

---

### P1-T03 — Supabase Auth integration

**Cascade prompt:**
> Project: LIKED · Task: P1-T03  
> Implement Supabase Auth in the Next.js 15 App Router project. Requirements: (1) Create `/app/(auth)/login/page.tsx` with email+password login and Google OAuth button. (2) Create `/app/(auth)/signup/page.tsx` with email+password signup. On first OAuth login, the user's provider avatar must be downloaded server-side and stored in Supabase Storage bucket `avatars/` — NOT stored as an external URL. Set `users.avatar_key` to the internal storage path. (3) On any signup (OAuth or email), INSERT a row into the `users` table: set `display_name` from provider name or email prefix, compute `normalized_display_name` (lowercase + trim + NFKC normalize), set `language_code = 'en'`, set `origin_user_id` to the new user's id. (4) Create `/app/(auth)/callback/route.ts` to handle OAuth redirects. (5) Protect all routes under `/app/(app)/` — redirect to `/login` if no session. Per PRD §32, `normalized_display_name` must be UNIQUE — handle duplicate conflicts gracefully by appending a short suffix. Please include Task ID P1-T03 in your reply.

**Acceptance criteria:**
- [ ] Email signup creates a `users` row with all required fields
- [ ] Google OAuth login works end-to-end
- [ ] OAuth avatar is stored in Supabase Storage, not as external URL
- [ ] `users.avatar_key` references the internal storage path
- [ ] `normalized_display_name` is populated and unique
- [ ] Unauthenticated access to `/app/*` redirects to `/login`

---

### P1-T04 — Deterministic default avatar

**Cascade prompt:**
> Project: LIKED · Task: P1-T04  
> Create a utility `lib/avatar.ts` that generates a deterministic default avatar SVG when `users.avatar_key` is null. The generation must be seeded by `user_id` (UUID). Output: a colored square background (color derived from UUID hash, chosen from a palette of 20 colors) with the user's initials (up to 2 chars from `display_name`) centered in white text. The function signature should be `getAvatarUrl(userId: string, avatarKey: string | null, displayName: string): string` — returning either the Supabase Storage public URL for the stored avatar, or a base64-encoded SVG data URL for the default. Create a React component `components/Avatar.tsx` that uses this utility. Per PRD §32.4, this default is used everywhere an avatar is displayed when no upload exists. Please include Task ID P1-T04 in your reply.

**Acceptance criteria:**
- [ ] Same `user_id` always produces the same color and initials
- [ ] Component renders in all sizes without breaking layout
- [ ] Users with `avatar_key = null` show the generated default
- [ ] Users with a real `avatar_key` show the stored image

---

### P1-T05 — Seed data

**Cascade prompt:**
> Project: LIKED · Task: P1-T05  
> Create `supabase/seed.sql` that inserts the following per PRD §4.9: (1) 12 demo user accounts with realistic display names, normalized_display_names, language codes (mix of 'en', 'fr', 'th'), and null avatar_keys (default avatars apply). (2) 20 realistic nodes — mix of URL-based (YouTube links, Spotify links, articles) and text-only cards. Each node must have `origin_user_id` and `origin_created_at` set. Distribute ownership across demo users. (3) 4 demo groups with group_members rows. (4) 8–10 demo folders with realistic names. (5) Tags with distinct colors (min 10 tags) and English labels in `tag_translations`. (6) tag_edges connecting tags to nodes. (7) nodes_sort_cache rows for each node (avg_rating = null initially, view_count = 0). Do NOT create any edges or causes in seed data — visibility will be tested separately. Please include Task ID P1-T05 in your reply.

**Acceptance criteria:**
- [ ] `supabase db seed` runs without errors
- [ ] 12 users, 20 nodes, 4 groups, 8+ folders, 10+ tags visible in Supabase dashboard
- [ ] No edges or causes in seed data
- [ ] All nodes have `origin_user_id` and `origin_created_at` populated

---

### P1 Gate Conditions

- [ ] App runs at `localhost:3000` with no console errors
- [ ] Login and signup both work
- [ ] All 23 tables exist in Supabase with correct schema
- [ ] Seed data is present
- [ ] No external avatar URLs stored anywhere
- [ ] RLS enabled on all tables

---

## PHASE 2 — Core Feed

**Goal:** A logged-in user can see their own nodes in a basic feed. Node creation works. Visibility model is correctly enforced.

**PRD sections:** §3 (core principle), §5 (visibility model), §6.8 (import/create), §7 (feed), §13 (card design), §22 (interaction contracts)

---

### P2-T01 — Visibility query function

**Cascade prompt:**
> Project: LIKED · Task: P2-T01  
> Create `lib/db/visibility.ts`. Implement a server-side function `getVisibleNodes(userId: string): Promise<Node[]>` that executes the exact visibility query from PRD §5:  
> ```sql  
> SELECT n.* FROM nodes n  
> WHERE n.deleted_at IS NULL  
> AND (  
>   n.owner_id = $userId  
>   OR EXISTS (  
>     SELECT 1 FROM edges e  
>     JOIN causes c ON e.cause_id = c.id  
>     WHERE e.node_id = n.id AND e.user_id = $userId  
>   )  
> )  
> AND NOT EXISTS (  
>   SELECT 1 FROM blocks b  
>   WHERE (b.blocker_id = $userId AND b.blocked_id = n.owner_id)  
>      OR (b.blocker_id = n.owner_id AND b.blocked_id = $userId)  
> )  
> ORDER BY n.created_at DESC  
> ```  
> This query is the ONLY mechanism for determining visibility. No other logic is permitted. Also implement `getVisibleNodeById(userId: string, nodeId: string)` for single-node access using the same predicate. Export TypeScript types for `Node` matching the `nodes` table schema from PRD §35. Please include Task ID P2-T01 in your reply.

**Acceptance criteria:**
- [ ] Function returns only nodes the user owns OR has an edge to
- [ ] Soft-deleted nodes (`deleted_at IS NOT NULL`) are never returned
- [ ] Blocked user nodes are excluded
- [ ] No other visibility mechanism exists in the codebase

---

### P2-T02 — Node creation (URL and text)

**Cascade prompt:**
> Project: LIKED · Task: P2-T02  
> Implement node creation in `lib/db/nodes.ts`. Function: `createNode(userId: string, input: { url?: string; textContent?: string }): Promise<Node>`. Rules from PRD §22 and §6.8: (1) If URL provided, check for existing node with same `(url, owner_id)` — if duplicate, throw a deduplification error. (2) INSERT into `nodes`: set `owner_id = userId`, `origin_user_id = userId`, `origin_created_at = now()`, `language_code = 'en'` (will be updated by metadata extraction in P8), `deleted_at = null`. URL cards: set `url`, leave `text_content` null. Text cards: set `text_content`, leave `url` null. (3) INSERT into `nodes_sort_cache`: `node_id`, all counters = 0, `avg_rating = null`. (4) Both INSERTs must be in ONE atomic transaction. Created nodes are private by default (no edges created). Return the created node. Please include Task ID P2-T02 in your reply.

**Acceptance criteria:**
- [ ] URL node creation works; duplicate URL for same owner is rejected
- [ ] Text-only node creation works
- [ ] `origin_user_id` and `origin_created_at` are set and match the creator
- [ ] `nodes_sort_cache` row created in same transaction
- [ ] No edges or causes created — node is private by default

---

### P2-T03 — Basic feed page

**Cascade prompt:**
> Project: LIKED · Task: P2-T03  
> Create the main feed page at `/app/(app)/feed/page.tsx` (Server Component). It must: (1) Fetch visible nodes for the current user using `getVisibleNodes()` from P2-T01. (2) Render nodes as a basic masonry grid (use CSS columns or a simple masonry library — do NOT use a heavy dependency; CSS columns is fine). (3) Each card displays: thumbnail (grey placeholder if none), title, created date. No ratings, no tags, no badges yet — those come in later phases. (4) Card click opens a placeholder detail panel (just a slide-over showing the title and URL for now — full modal comes in P8). (5) The page must be the default route: `/app/(app)/` should redirect to `/feed`. (6) Use Tailwind for all styling. Follow the PRD §11 Pinterest-style visual directive: light background, soft rounded cards, subtle shadows, minimal text, tight spacing. Please include Task ID P2-T03 in your reply.

**Acceptance criteria:**
- [ ] Feed loads and shows the current user's own nodes
- [ ] Masonry layout renders without layout thrash
- [ ] Empty state shown when user has no nodes
- [ ] Nodes owned by other users are NOT visible (since no edges exist yet)
- [ ] Page redirects correctly from root

---

### P2-T04 — Quick node creation (temporary input)

**Cascade prompt:**
> Project: LIKED · Task: P2-T04  
> Add a temporary node creation input to the feed page. This is a placeholder until the full FAB modal is built in P5. Place a simple input bar at the top of the feed: a text field that accepts a URL or plain text and a submit button. On submit: call `createNode()` from P2-T02, then refresh the feed to show the new card. Show an inline error if URL is duplicate. This input will be removed and replaced by the FAB in P5 — it's purely for testing. Please include Task ID P2-T04 in your reply.

**Acceptance criteria:**
- [ ] URL submission creates a node visible in the feed immediately
- [ ] Text submission creates a text-only node visible in the feed
- [ ] Duplicate URL shows an error without crashing
- [ ] New node appears without full page reload

---

### P2 Gate Conditions

- [ ] Feed shows only nodes the logged-in user owns
- [ ] Node creation (URL + text) persists to DB
- [ ] Visibility query correctly excludes nodes with no edge and different owner
- [ ] No other visibility mechanism in the codebase

---

## PHASE 3 — Sharing System

**Goal:** Users can share nodes to other users. The causal edge model works correctly. Friendships are derived from reciprocal edges.

**PRD sections:** §6.1–6.4 (write system), §9 (friend system), §4.1 (edges/causes), §29 (invariants)

---

### P3-T01 — Direct share (cause + edges)

**Cascade prompt:**
> Project: LIKED · Task: P3-T01  
> Implement `lib/db/sharing.ts`. Function: `directShare(sharerId: string, nodeId: string, targetUserId: string): Promise<void>`. This must implement the exact write sequence from PRD §6.2 in ONE atomic transaction: (1) INSERT into `causes`: `cause_type = 'direct_share'`, `created_by = sharerId`, `metadata = {node_id: nodeId, target_user_id: targetUserId}`. (2) INSERT into `edges`: `node_id = nodeId`, `user_id = targetUserId`, `cause_id = <new cause id>`, `sender_id = sharerId`, `direction = 'received'`, `depth = 1` (hardcode for now; parent_depth tracking comes later). (3) INSERT reciprocal edge for sender: same `cause_id`, `user_id = sharerId`, `direction = 'sent'`, `depth = 1`. Critical: this is NOT idempotent by design — sharing the same node to the same user twice creates two independent causes and two edge sets. Do NOT check for existing edges before inserting. Please include Task ID P3-T01 in your reply.

**Acceptance criteria:**
- [ ] Share creates exactly 1 cause and 2 edges (sent + received)
- [ ] Shared node becomes visible to recipient (P2-T01 query now returns it)
- [ ] Sharing same node twice creates 2 causes, 4 edges total — not an error
- [ ] Sender's feed shows the node with `direction = 'sent'`
- [ ] Recipient's feed shows the node with `direction = 'received'`
- [ ] All 3 inserts are atomic

---

### P3-T02 — Unshare (cause deletion + cascade)

**Cascade prompt:**
> Project: LIKED · Task: P3-T02  
> Implement `unshare(causeId: string, requestingUserId: string): Promise<void>` in `lib/db/sharing.ts`. Rules from PRD §6.4: (1) Verify the cause exists and `created_by = requestingUserId` (authorization check). (2) DELETE the cause row — `ON DELETE CASCADE` on `edges.cause_id` will automatically delete all associated edges. (3) No path checks, no "are there other edges remaining?" logic, no fallback. The deletion is deterministic and complete. Also implement `getShareCausesForNode(nodeId: string, userId: string): Promise<Cause[]>` — returns all `direct_share` causes where the requesting user is the sharer, for a given node. This enables the "unshare" UI to list share events. Please include Task ID P3-T02 in your reply.

**Acceptance criteria:**
- [ ] Deleting a cause removes all its edges automatically
- [ ] Node becomes invisible to recipient after unshare (if no other causes remain)
- [ ] If node was shared twice, deleting one cause leaves the other cause + edges intact
- [ ] No SELECT query runs before the DELETE — pure deterministic deletion
- [ ] Requesting user can only delete causes they created

---

### P3-T03 — Friend derivation

**Cascade prompt:**
> Project: LIKED · Task: P3-T03  
> Implement `lib/db/friends.ts`. Per PRD §9.1–9.3, there is NO friends table. Friendship is defined by the `friend_invites` table (PRD §9.2): a user appears in your Friends bar as soon as you invite them OR they invite you — no reciprocal acceptance required (WhatsApp model). Implement:
> 1. `getFriendBar(userId: string): Promise<FriendBarEntry[]>` — returns all users/pending invites that should appear in the Friends Strip for user A. A user X appears if: (a) A has a `friend_invites` row where `from_user_id = A AND to_user_id = X`, OR (b) a `friend_invites` row exists where `from_user_id = X AND to_user_id = A`. Include pending invites where `to_user_id IS NULL` (shown as dimmed with clock icon). Sort by last activity (most recent edge involving that friend first).
> 2. `sendFriendInvite(fromUserId: string, toEmail: string): Promise<void>` — INSERT into `friend_invites`. One active invite per (from_user_id, to_email). Subsequent attempts silently ignored (duplicate check before INSERT).
> 3. `backfillFriendInvites(newUserId: string, email: string): Promise<void>` — on signup, scan `friend_invites WHERE to_email = email AND to_user_id IS NULL` and UPDATE each row to set `to_user_id = newUserId`.
> 4. `removeFriend(fromUserId: string, targetUserId: string): Promise<void>` — DELETE the `friend_invites` row.
> These functions are the ONLY friend derivation mechanism. Do NOT query `edges` to determine friendship. Please include Task ID P3-T03 in your reply.

**Acceptance criteria:**
- [ ] A invites B → B appears in A's Friends bar immediately (pending state)
- [ ] B signs up → `to_user_id` backfill runs, B's avatar activates
- [ ] B invites A → A appears in B's bar AND B appears in A's bar
- [ ] No `friends` table exists or is queried
- [ ] Duplicate invite silently ignored
- [ ] `removeFriend` removes the invite row

---

### P3-T04 — Group share and unshare

**Cascade prompt:**
> Project: LIKED · Task: P3-T04  
> Implement `groupShare(sharerId: string, nodeId: string, groupId: string): Promise<void>` and `groupUnshare(sharerId: string, nodeId: string, groupId: string): Promise<void>` in `lib/db/sharing.ts`. Group share (PRD §6.3) — ONE atomic transaction: (1) INSERT into `causes`: `cause_type = 'group_share'`, `metadata = {node_id, group_id}`. (2) INSERT into `group_nodes`. (3) For EACH member in `group_members` for this group: INSERT an edge with `direction = 'received'`, `cause_id = above`, `sender_id = sharerId`. Group unshare (PRD §6.4): (1) DELETE `group_nodes` row. (2) DELETE the `group_share` cause — edges cascade automatically. NO path checks before deletion. Also implement `createGroup(ownerId: string, name: string, memberIds: string[]): Promise<Group>` — creates the group and inserts all initial members in one transaction. Please include Task ID P3-T04 in your reply.

**Acceptance criteria:**
- [ ] Group share creates 1 cause + N edges (one per member)
- [ ] All group members see the shared node immediately
- [ ] Group unshare deletes cause; all member edges cascade-deleted
- [ ] Members no longer see the node after group unshare
- [ ] Group creation is atomic

---

### P3-T05 — RLS policies (tightening)

**Cascade prompt:**
> Project: LIKED · Task: P3-T05  
> Create `supabase/migrations/003_rls_policies.sql`. Replace the permissive RLS policies from P1-T02 with proper policies implementing the visibility model from PRD §5. Key policies: (1) `nodes` SELECT: user is owner OR EXISTS an edge for (node_id, user_id) AND deleted_at IS NULL AND no block. (2) `edges` SELECT: user_id = auth.uid() OR sender_id = auth.uid(). (3) `causes` SELECT: created_by = auth.uid(). (4) `nodes` INSERT: owner_id = auth.uid(), origin_user_id = auth.uid(). (5) `edges` INSERT/DELETE: only via service role (all edge writes go through server-side functions, not direct client calls). (6) All other tables: authenticated users can SELECT their own rows; INSERT/UPDATE/DELETE restricted to owner. Use `auth.uid()` for all policies. Please include Task ID P3-T05 in your reply.

**Acceptance criteria:**
- [ ] User cannot SELECT nodes they have no edge to (and don't own)
- [ ] User cannot directly INSERT edges from the client
- [ ] User can see their own causes
- [ ] Policies tested via Supabase SQL editor with test user IDs

---

### P3 Gate Conditions

- [ ] Direct share creates correct cause + 2 edges atomically
- [ ] Shared node is visible to recipient via P2-T01 query
- [ ] Unshare is deterministic (no path checks)
- [ ] Group share and unshare work correctly
- [ ] Friendship is derived from edges with no friends table
- [ ] RLS prevents unauthorized data access

---

## PHASE 4 — Folders

**Goal:** Folders exist, nodes can be organized into them, folder sharing creates the correct causes+edges, and the breadcrumb navigation works.

**PRD sections:** §6.5 (folder share), §8 (context system), §11.5 (folders bar), §11.8 (breadcrumb), §21.1 (folder admins)

---

### P4-T01 — Folder CRUD

**Cascade prompt:**
> Project: LIKED · Task: P4-T01  
> Implement `lib/db/folders.ts` with: `createFolder(ownerId, name, parentFolderId?)`, `renameFolder(folderId, newName, requestingUserId)`, `deleteFolder(folderId, requestingUserId)` (soft delete — sets `deleted_at`), `getFolderTree(userId)` (returns acyclic tree of folders owned by user or shared with user), `addNodeToFolder(nodeId, folderId, requestingUserId)` (inserts `folder_edges` row — organizational only, NO edge creation), `removeNodeFromFolder(nodeId, folderId, requestingUserId)`. Folder creation must also insert a `folder_tree` row with `depth = 0` (self-reference) and rows for all ancestors. Cycle detection: before inserting a parent, verify the target folder is not already an ancestor. Per PRD §6.5, folders are acyclic trees with unlimited depth; max configurable depth default = 5 (enforce this). Please include Task ID P4-T01 in your reply.

**Acceptance criteria:**
- [ ] Folder creation with parent populates `folder_tree` correctly
- [ ] Cycle detection prevents invalid parent assignments
- [ ] Soft delete sets `deleted_at`; folder disappears from tree queries
- [ ] `addNodeToFolder` creates only a `folder_edges` row — no edges/causes

---

### P4-T02 — Folder share (write expansion)

**Cascade prompt:**
> Project: LIKED · Task: P4-T02  
> Implement `shareFolder(sharerId, folderId, targetUserIds: string[]): Promise<string>` (returns `folder_share_op_id`) in `lib/db/folders.ts`. Per PRD §6.5, this must run in ONE atomic transaction: (1) Generate a UUID `folder_share_op_id`. (2) Resolve all nodes in the folder subtree (via `folder_tree` + `folder_edges`). (3) For each `(node, targetUser)` combination: INSERT a `causes` row with `cause_type = 'direct_share'` and `metadata = {node_id, user_id: targetUser, folder_id, folder_share_op_id}`, then INSERT sent + received `edges` rows. Also implement `unshareFolderOp(folder_share_op_id, requestingUserId): Promise<void>`: DELETE all `causes` WHERE `metadata->>'folder_share_op_id' = $op_id` AND `created_by = requestingUserId` — edges cascade automatically. NO path checks, NO "remaining causes" analysis. Please include Task ID P4-T02 in your reply.

**Acceptance criteria:**
- [ ] Folder share creates N causes (one per node per target user)
- [ ] All causes share the same `folder_share_op_id` in metadata
- [ ] Target users see all folder nodes after share
- [ ] `unshareFolderOp` deletes all causes for that op — edges cascade
- [ ] Independent shares (not from this op) are unaffected by unshare
- [ ] Entire operation is atomic

---

### P4-T03 — Breadcrumb navigation

**Cascade prompt:**
> Project: LIKED · Task: P4-T03  
> Implement the top breadcrumb navigation component per PRD §11.8. Component: `components/BreadcrumbNav.tsx`. It must: (1) Only render when the user is inside a folder context. (2) Display the full path using `folder_tree`: e.g., "Home > Work > Marketing > Q2 Assets". Each segment is a clickable link that navigates to that folder's context. (3) Support unlimited depth (scroll horizontally if too many segments on mobile; show all on desktop). (4) Auto-update when folder context changes. (5) Use the same font weight/style as card titles per PRD §11. Place it at the very top of the workspace, always visible when in a folder context, hidden otherwise. Please include Task ID P4-T03 in your reply.

**Acceptance criteria:**
- [ ] Breadcrumb appears when folder is selected, hidden otherwise
- [ ] Full path displayed correctly for deeply nested folders
- [ ] Each segment is clickable and navigates correctly
- [ ] Mobile scrolls horizontally; desktop shows all segments
- [ ] Updates immediately on folder change

---

### P4-T04 — Nested folder feed (recursive subtree)

**Cascade prompt:**
> Project: LIKED · Task: P4-T04
> Fix get_feed() and related functions so that selecting a folder context shows cards from ALL nested subfolders, not just the top-level folder.
>
> In supabase/migrations/005_feed_function.sql:
>
> 1. get_feed() — in the folder context filter stage, replace the direct equality filter:
>      folder_edges.folder_id = p_folder_id
>    with a subtree expansion:
>      folder_edges.folder_id IN (
>        SELECT ft.folder_id FROM folder_tree ft WHERE ft.ancestor_id = p_folder_id
>      )
>    folder_tree already contains a self-reference row (depth = 0) for every folder, so the root folder itself is included automatically. Only apply this expansion when p_folder_id IS NOT NULL.
>
> 2. get_feed_custom_sort() — apply the same subtree expansion to its folder context filter.
>
> 3. get_user_folders() — update item_count so it counts nodes across the full subtree of each folder, not just direct folder_edges for f.id:
>      COUNT(DISTINCT fe.node_id) where fe.folder_id IN (
>        SELECT ft2.folder_id FROM folder_tree ft2 WHERE ft2.ancestor_id = f.id
>      )
>
> 4. In 04_FEED_SQL_SPEC.md, remove the known limitation row:
>      "Nested folder feed not recursive | Folder context = single folder only | ..."
>    Replace it with:
>      "Nested folder feed | Resolved in P4-T04 | Subtree expanded via folder_tree in get_feed, get_feed_custom_sort, and get_user_folders"
>
> Do not change any function signatures or return shapes. Do not touch visibility, edge, or cause logic.
>
> Please include Task ID P4-T04 in your reply.

**Acceptance criteria:**
- [ ] Selecting a parent folder in the feed shows cards from all descendant folders
- [ ] Selecting a leaf folder shows only that folder's cards (unchanged behavior)
- [ ] item_count on folder chips reflects total nodes across the full subtree
- [ ] get_feed_custom_sort applies the same subtree logic
- [ ] No function signatures or return shapes changed
- [ ] Known limitation row removed from 04_FEED_SQL_SPEC.md

---

### P4 Gate Conditions

- [ ] Folder creation, nesting, and cycle detection all work
- [ ] Folder share creates correct causes with `folder_share_op_id`
- [ ] Folder unshare is deterministic via op_id
- [ ] Breadcrumb shows correct path
- [ ] `addNodeToFolder` never creates edges/causes
- [ ] Nested folder feed shows cards from all descendant subfolders (P4-T04)

---

## PHASE 5 — UI Shell

**Goal:** The complete UI structure is in place: all bars, the FAB modal, all 5 view modes (basic), profile modal. The app looks like LIKED.

**PRD sections:** §11 (UI system), §11.1–11.8, §13 (card design), §24 (styling)

---

### P5-T01 — App layout with bars

**Cascade prompt:**
> Project: LIKED · Task: P5-T01  
> Reference: LIKED_Prototype (React multi-file). Folder view header replaces top bar when inside folder (Amendment F). Friends strip expand handle has drag-up gesture (Amendment H).  
> Create the main app layout at `app/(app)/layout.tsx` per PRD §11.1, §11.3, §11.4. It must render:
> (1) **Top Bar** (§11.1) — always visible, exactly 1 permanent row: Logo `liked.` (left) · Tags icon-btn (right of logo, `tag` feather icon, badge when tags active, tap toggles Tags Strip §11.3f) · Search icon-btn (`search` feather icon, tap opens search — wired at P9) · Notification bell (right, badge) · Profile avatar (far right, opens Profile modal). No Sliders icon. No Filter Feed sheet. No Row 2. Sort button + view mode icons sit in a separate **Sort/View Row** between the feed filter tabs and the feed content.
> (2) **Feed Filter Tabs** (§11.2a) — 3 tabs immediately below top bar: All · Mine · Received. No Sent tab. Mine tab has sub-filter: All Mine / Not shared / Shared.
> (3) **Sort/View Row** — between feed filter tabs and feed content. Sort button (dropdown: Newest/Oldest/Rating/Most Shared/Custom) + 5 view mode icons (Icon Grid · Masonry · List · Horizontal Rows · Free View). Active icon highlighted amber.
> (4) **Context Strip** (§11.3c) — conditional strip between feed tabs and sort row; hidden when no filters active.
> (5) **Main content area** — feed cards.
> (6) **Friends & Groups Strip** (§11.4) — **permanently docked at the BOTTOM** of the screen, above the system home indicator. "Me" avatar pinned first (never scrolls). Friends as circles, Groups as rounded squares (~10 px radius). 5 avatars visible at mobile width. Sorted by last activity. Background: `--color-bar` (opaque). An **expand handle** (pill + chevron + 'FRIENDS' label) sits centered above the strip; tapping or drag-up >40px opens Friends Panel (§11.4a).
> (7) **FAB** (§11.3) — floating amber circle, `+` icon only, no text. Mobile: horizontally centered, 20 px above Friends Strip. Desktop: fixed bottom-right, 18 px from edges.
> (8) **Folder View Header** (§11.5a) — when inside a folder, replaces top bar: folder color dot + name left, view toggles + tags icon right; breadcrumb row below.
> **No Folders Bar.** Folders are accessed via breadcrumb or drag panel (PRD §11.5). No Filter Feed sheet. All tap targets minimum 44×44 px. Please include Task ID P5-T01 in your reply.

**Acceptance criteria:**
- [ ] Top bar is exactly 1 row with Logo · Tags icon · Search icon · Bell · Avatar
- [ ] Tags icon has badge showing active tag count when ≥1 tag selected
- [ ] No Sliders icon in the layout
- [ ] Feed filter tabs are All · Mine · Received (no Sent tab)
- [ ] Sort/View Row appears between feed tabs and content
- [ ] Friends & Groups Strip is at the BOTTOM, never at the top
- [ ] "Me" avatar is always first and pinned left
- [ ] FAB is a circle (not pill), centered 20 px above strip on mobile, bottom-right on desktop
- [ ] No Folders Bar in the layout
- [ ] No Filter Feed bottom sheet in the layout
- [ ] No Bottom Navigation Bar anywhere in the layout
- [ ] Expand chevron above strip opens Friends Panel

---

### P5-T02 — Floating Create Modal (FAB)

**Cascade prompt:**
> Project: LIKED · Task: P5-T02 · Amendment: UIX v27.1
> Implement the FAB Speed-Dial and Friends & Groups Strip 3-state model per PRD §11.3 and §11.4 (UIX Amendment v27.1).
>
> **Part A — FAB Speed-Dial:**
> (1) On FAB tap: `+` icon rotates 45° to `×` (200ms ease). Four action buttons (36 px circles) fan out vertically above the FAB. Semi-transparent scrim over feed. Tapping scrim or `×` collapses.
> (2) Speed-dial actions bottom to top: Tag (§11.3b) · Card (§11.3c) · Folder (New Folder sheet) · Template (§11.3d).
> (3) New Folder sheet: name input + 7-color swatch row (from system palette) + Save. On save: calls `createFolder()` (P4 dependency — show "Coming soon" toast until P4 complete).
> (4) Template Picker sheet: preset list rows (icon + name + description) + optional name input + "Add to workspace" amber button. Presets: Read Later, Watch List, Trip Planner (3 sub-folders), Book Notes. Wired at P4 completion — show "Coming soon" toast until then.
> (5) Tag Mode (§11.3b): floating Tag Pill at FAB position + half-height Tag Sheet with tag list + new tag input. On tag select: sheet collapses, pill updates. Card/folder tap in feed assigns tag (150ms accent ring). `×` on pill exits Tag Mode. Wired at P6 completion — show "Coming soon" toast until then.
> (6) Card action: opens existing Add Card bottom sheet (§11.3c — unchanged).
>
> **Part B — Friends & Groups Strip 3-state model:**
> (1) Implement three states: `hidden` | `strip` | `expanded`. Persist to localStorage key `liked.friendsStripState`. Default: `strip`.
> (2) Hidden state: render only the 28 px handle (pill + chevron-up + `Friends (N) & Groups (N)` label with live counts). FAB floats 20 px above handle.
> (3) Strip state: full avatar row (existing spec) + handle above it. FAB floats 20 px above handle.
> (4) State transitions via swipe gestures (threshold > 40 px velocity): swipe down on strip → hidden; swipe up on handle → strip; swipe up on strip → expanded panel; swipe down on panel or `×` → strip.
> (5) Expanded Panel (§11.4a): add group management drag-drop per §11.4a Group Management section: friend drag onto group chip calls `addMemberToGroup()`; drag member out calls `removeMemberFromGroup()` + Undo toast; group chip long-press → delete popover; group chips reorderable (localStorage key `liked.groupOrder`).
>
> Please include Task ID P5-T02 in your reply.

**Acceptance criteria:**
- [ ] FAB speed-dial opens with 4 actions: Tag · Card · Folder · Template
- [ ] `+` rotates to `×` on open; scrim dismisses on outside tap
- [ ] New Folder sheet: name input + color swatches + Save
- [ ] Template Picker: preset list + optional name + "Add to workspace"
- [ ] Tag Mode: Tag Pill + Tag Sheet; card tap assigns tag with accent ring; `×` exits
- [ ] Unwired actions (pre-P4, pre-P6) show "Coming soon" toast
- [ ] Strip state persisted to localStorage `liked.friendsStripState` 
- [ ] Hidden state renders only 28 px handle with live counts label
- [ ] Swipe transitions between all 3 states work on mobile touch
- [ ] Expanded Panel group drag-drop: add/remove members, reorder groups, delete group
- [ ] FAB position correct in all 3 strip states (always 20 px above handle)

---

### P5-T03 — Five view modes

**Cascade prompt:**
> Project: LIKED · Task: P5-T03  
> Replace free view description with Amendment D. Replace icon grid column description with Amendment E.  
> Implement all 5 view modes for the feed per PRD §11.2. Each mode must be selectable from the top bar view toggle and persist the preference to `users` table (add a `view_preference` column via migration if not present). Modes: (A) **Masonry** — CSS columns, variable card height, desktop default. (B) **Icon Grid** — user-adjustable column count via zoom pill (− · N col · +), range 2–6 columns, default 2, persisted to localStorage ('liked.zoom'). Large square thumbnails, title below. (C) **List** — full-width rows, thumbnail left, metadata right. (D) **Horizontal Rows** — multiple rows by context (folder name, tag, sender, recency bucket), each row scrolls horizontally. Row grouping logic: group by folder if in folder context, else by tag if tags active, else by sender, else by recency bucket. (E) **Free View** — CSS grid with `grid-auto-flow: dense`, cards can be resized by dragging bottom-right handle, snapping to grid units, sizes persisted per scope in `sizes[scopeKey][cardId] = {w, h}`. NOT free absolute positioning — all cards remain in grid flow. Pan and pinch-to-zoom removed. Please include Task ID P5-T03 in your reply.

**Acceptance criteria:**
- [ ] All 5 modes render without layout errors
- [ ] View preference persists across sessions
- [ ] Icon Grid has zoom pill adjusting columns 2–6, default 2, persisted to localStorage
- [ ] Masonry is default on desktop
- [ ] Free View has grid-snap resize, no pan, no pinch-to-zoom
- [ ] Horizontal rows group cards correctly

---

### P5-T04 — Profile modal

**Cascade prompt:**
> Project: LIKED · Task: P5-T04  
> Implement the Profile Modal per PRD §11.7. Triggered by clicking the user's own avatar in the Unified bar. Modal contains: (1) User avatar (from internal storage or deterministic default) + display_name. (2) Light/Dark theme toggle — persisted to `localStorage` and applied via Tailwind `dark:` classes. (3) Log out button — calls Supabase `auth.signOut()` + redirects to `/login`. (4) Username change input — inline edit, shows current display_name, on save: validate 3–32 chars, normalize to `normalized_display_name`, check UNIQUE, enforce 1 change per 24h (check `username_changed_at`), INSERT to `activity_log` on change. (5) Avatar change — file upload (image only), store to Supabase Storage `avatars/`, update `users.avatar_key`, enforce max 5 per day (`avatar_change_count_today`), log to `activity_log`. All rate limits per PRD §32. Please include Task ID P5-T04 in your reply.

**Acceptance criteria:**
- [ ] Theme toggle works and persists
- [ ] Username change enforces 24h rate limit
- [ ] Avatar upload stores internally; no external URL saved
- [ ] Rate limits enforced for both username and avatar
- [ ] All changes logged to `activity_log`
- [ ] Logout redirects to login

---

### P5-T05 — Tags Strip

**Cascade prompt:**
> Project: LIKED · Task: P5-T05
> Implement the Tags Strip per PRD §11.3f.
> (1) Add `getVisibleTags(userId: string, languageCode: string): Promise<Tag[]>` to `lib/db/tags.ts`. This function returns DISTINCT tags present on nodes visible to the user — JOIN `tag_edges` → `tags` → `tag_translations` → `nodes` → `edges` WHERE `e.user_id = userId AND n.deleted_at IS NULL`. Do NOT call `getAllTags()`. Language fallback: if no translation for `languageCode`, fall back to `en`, then to tag_id prefix per PRD §33.4.
> (2) Create `components/bars/TagsStrip.tsx` — Client Component. Props: `userId`, `languageCode`, `activeTags: string[]`, `onToggle(tagId: string): void`, `onClose(): void`. Layout: search input row (auto-focused on mount, `×` clear button) above horizontally scrollable chip row. Selected chips pinned to left of row. Chips filtered in real time by search input. Chip colors from `tags.color_hex`.
> (3) In `app/(app)/layout.tsx`, wire the Tags icon-btn in the top bar to toggle a `tagsStripOpen` boolean in local state. Render `<TagsStrip>` between top bar and feed filter tabs when `tagsStripOpen = true`. Slide-down animation: `max-height` transition 200ms ease. Tags icon badge = count of `activeTags.length` when > 0.
> (4) Active tags feed into the existing feed filter state (same mechanism as P9-T03 multi-filter). For now, pass active tags down to `FeedContainer` as `tagFilter: string[]`. Feed re-queries on change.
> (5) When last active tag is removed via context strip `×`, set `tagsStripOpen = false`.
> Please include Task ID P5-T05 in your reply.

**Acceptance criteria:**
- [ ] `getVisibleTags()` only returns tags on nodes visible to the user — verified by checking a tag assigned only to a non-visible node does not appear
- [ ] Tags Strip hidden by default; slides down on Tags icon tap
- [ ] Search input auto-focused on open; filters chips in real time
- [ ] Selected chips pinned to left of chip row
- [ ] Multi-select works; each selection triggers immediate feed re-query
- [ ] Tags icon badge count matches active tag count
- [ ] Removing last tag via context strip auto-collapses strip
- [ ] `getAllTags()` is never called from this component

---

### P5 Gate Conditions

- [ ] App layout looks like a polished Pinterest-style product
- [ ] All 5 view modes functional
- [ ] FAB is the only node creation entry point
- [ ] Profile modal works with all rate limits
- [ ] No Bottom Navigation Bar
- [ ] Both bars have correct labels, chevrons, backgrounds, and scroll behavior
- [ ] Tags Strip functional with visible-only tag scope
- [ ] No Filter Feed bottom sheet exists anywhere in the codebase
- [ ] Search icon present in top bar (may show "coming soon" toast until P9)

---

## PHASE 6 — Tags & Ratings

**Goal:** Full tag system works (create, assign, filter). Rating system works (input, display, aggregation).

**PRD sections:** §18 (ratings), §19 (tags), §6.6 (tags write), §6.7 (ratings write)

---

### P6-T01 — Tag creation and assignment

**Cascade prompt:**
> Project: LIKED · Task: P6-T01  
> Implement the full tag system per PRD §19. In `lib/db/tags.ts`: (1) `createOrGetTag(label: string, languageCode: string): Promise<Tag>` — implements the EXACT deterministic flow from §19.3: normalize (lowercase + trim + NFKC) → lookup `tag_translations` WHERE `language_code = languageCode AND label = normalized` → if found, return existing `tag_id` → if not found, INSERT new `tags` row (assign next color from 20-color palette, cycling) + INSERT `tag_translations` row. (2) `addTagToNode(tagId, nodeId)` — INSERT `tag_edges`. (3) `removeTagFromNode(tagId, nodeId)` — DELETE `tag_edges`. (4) `getTagsForNode(nodeId, languageCode)` — returns tags with translated labels for the given language, using fallback chain from PRD §33.4. (5) `getAllTags(languageCode)` — for the tag filter chips in the top bar. Please include Task ID P6-T01 in your reply.

**Acceptance criteria:**
- [ ] Same label in same language always returns same tag_id
- [ ] Two different labels in same language create two different tags
- [ ] Tag colors are unique and cycle correctly after 20
- [ ] Tag filter chips in top bar display with correct colors
- [ ] `tags` table has no `name` column

---

### P6-T02 — Rating system

**Cascade prompt:**
> Project: LIKED · Task: P6-T02  
> Implement the rating system per PRD §18. In `lib/db/ratings.ts`: `upsertRating(userId, nodeId, score): Promise<void>` — must run in ONE atomic transaction: (1) UPSERT into `ratings` (score column: numeric(3,1), must be 0–10, step 0.5 — validate). (2) UPDATE `nodes_sort_cache.avg_rating` (column: numeric(3,1)) = (SELECT AVG(score) FROM ratings WHERE node_id = $nodeId). Both operations in same transaction. Implement `getRatingsForNode(nodeId): Promise<{userId, score, displayName, avatarKey}[]>` for the friend breakdown view. Update the Card component from P2-T03 to show `avg_rating` on the card face as "★ N.N" (hidden when 0 or null). Update `nodes_sort_cache` query in the feed to JOIN and show ratings. **UI:** Slider input, 0–10, step 0.5. Displays current value numerically. Please include Task ID P6-T02 in your reply.

**Acceptance criteria:**
- [ ] Rating UPSERT and cache update are in one transaction
- [ ] DB columns use numeric(3,1) for ratings.score and nodes_sort_cache.avg_rating
- [ ] Score must be 0–10 with step 0.5 (reject 0.3, accept 7.5)
- [ ] `avg_rating` on cards shows "★ N.N" (hidden when 0 or null)
- [ ] Rating a node twice replaces the first rating (UPSERT)
- [ ] Slider input UI with numeric display

---

### P6-T03 — Sort system

**Cascade prompt:**
> Project: LIKED · Task: P6-T03  
> Add "Rating" sort option per Amendment B (replaces "Highest Rated").  
> Implement the sort dropdown behavior per PRD §7.2. The sort dropdown in the top bar must support: Newest (default, `ORDER BY n.created_at DESC`), Oldest (`ORDER BY n.created_at ASC`), Rating (`ORDER BY nsc.avg_rating DESC NULLS LAST`), Most Shared (`ORDER BY nsc.share_count DESC`), Custom (user-defined order). Persist selected sort to `users` table or `localStorage`. For **Custom sort**: add a `custom_sort_position` column to a `user_node_preferences` table (or add JSONB to users) to store per-user card ordering. When user reorders cards via drag-and-drop (implemented in P7), the sort automatically switches to "Custom" and persists position. For now, implement all sorts except Custom drag behavior (that comes in P7). Please include Task ID P6-T03 in your reply.

**Acceptance criteria:**
- [ ] All 4 non-custom sorts work correctly
- [ ] Sort selection persists across sessions
- [ ] "Custom" option appears in dropdown but does nothing destructive until P7

---

### P6 Gate Conditions

- [ ] Tags can be created, assigned, removed, and filtered
- [ ] Tag colors are consistent everywhere they appear
- [ ] Ratings UPSERT and avg_rating update are always in one transaction
- [ ] Sort dropdown works for all options
- [ ] `tags` table has no `name` column

---

## PHASE 7 — Advanced Interactions

**Goal:** Drag-and-drop, multi-select, long-press, and trash all work completely.

**PRD sections:** §12 (drag-and-drop), §17 (long-press/multi-select), §20 (trash)

---

### P7-T01 — Drag-and-drop (core targets)

**Cascade prompt:**
> Project: LIKED · Task: P7-T01  
> Implement drag-and-drop per PRD §12 using a library compatible with Next.js 15 App Router (recommend `@dnd-kit/core`). Implement these drop targets first: (1) **Node → Friend avatar** = call `directShare(currentUser, nodeId, friendId)`. (2) **Node → Folder chip** = call `addNodeToFolder(nodeId, folderId)`. (3) **Node → Tag chip** = call `addTagToNode(tagId, nodeId)`. (4) **Tag chip dragged off node** = call `removeTagFromNode(tagId, nodeId)`. (5) **Node → Trash icon** = soft delete (set `deleted_at`). (6) **Drag-pause over collapsed bar → auto-expand**: if dragging and hovering over a collapsed bar for >500ms, auto-expand it with smooth height animation (~200ms). All drops persisted to DB. Show visual feedback on valid drop targets (highlight). Mobile: use touch events (dnd-kit handles this). Please include Task ID P7-T01 in your reply.

**Acceptance criteria:**
- [ ] All 5 drop targets work and persist to DB
- [ ] Auto-expand on drag-pause works on both bars
- [ ] Mobile touch drag works reliably
- [ ] No browser context menu on long-press drag (mobile)

---

### P7-T02 — Drag-and-drop (auto-create + custom sort)

**Cascade prompt:**
> Project: LIKED · Task: P7-T02  
> Implement the remaining drag-and-drop actions per PRD §12: (1) **Card → Card** = auto-create Folder: show inline name input at the folder's position in the Folders bar, auto-focused, with explicit cancel (Escape or tap outside). On confirm: create folder, add both cards to it. On cancel: discard, remove placeholder. (2) **Friend avatar → Friend avatar** = auto-create Group: same inline name prompt flow in the Unified bar. (3) **Friend avatar ↔ Folder chip** (bidirectional) = call `shareFolder()`. (4) **Card reorder** (drag within feed in any view mode): on drop, save new position to `user_node_preferences`, switch sort dropdown to "Custom" automatically. Implement the Custom sort position persistence from P6-T03. Per PRD §6.10, new items appear immediately after naming. Please include Task ID P7-T02 in your reply.

**Acceptance criteria:**
- [ ] Card→Card creates folder with name prompt; cancel discards cleanly
- [ ] Friend→Friend creates group with name prompt; cancel discards cleanly
- [ ] Name prompt is auto-focused with cancel option (Escape)
- [ ] Card reorder switches sort to Custom and persists
- [ ] New folder/group appears in bar immediately after naming

---

### P7-T03 — Long-press and multi-select

**Cascade prompt:**
> Project: LIKED · Task: P7-T03  
> Implement long-press multi-select per PRD §17. (1) Long-press (>500ms) on any card, folder chip, friend avatar, or group chip activates multi-select mode. (2) Selected items enter **wobble animation** (CSS keyframe: ±2° rotation, 0.3s period). (3) An **(×) close icon** appears on each selected item. (4) Subsequent taps add to the selection set. (5) A **context action menu** appears as Bottom-sheet (mobile) / Side drawer (desktop) with actions per §17.2: Edit (single only), Move to folder, Add to folder, Add to group, Share with, Remove tag, Give admin rights (friend in folder/group context), Move to trash, Remove from folder, Cancel. (6) Tapping **(×)** on a single item → soft delete + Undo toast (5-second window, restores `deleted_at = null` on Undo). (7) Exit: tap outside, Cancel button, or Escape. Please include Task ID P7-T03 in your reply.

**Acceptance criteria:**
- [ ] Wobble animation triggers correctly on long-press
- [ ] Multi-select adds items correctly
- [ ] Bottom-sheet on mobile, side drawer on desktop
- [ ] (×) tap soft-deletes with Undo toast
- [ ] Escape exits multi-select on desktop

---

### P7-T04 — Trash view

**Cascade prompt:**
> Project: LIKED · Task: P7-T04  
> Implement the Trash system per PRD §20. (1) Trash icon in top bar: clicking opens a Trash modal/full-screen view listing all items with `deleted_at IS NOT NULL` owned by current user. Show: thumbnail, name, date trashed. (2) Badge count on icon = count of trashed items. (3) **Restore**: clears `deleted_at` — item returns to feed. Critically: causes and edges are NOT removed on soft delete, so restoring restores visibility for all users with edges automatically. (4) **Permanent delete**: hard DELETE from `nodes` table (cascades to edges/causes/etc). Requires a confirmation dialog before executing. (5) **Direct drag to Trash icon**: dragging any card/folder/group onto the trash icon calls soft delete immediately. Please include Task ID P7-T04 in your reply.

**Acceptance criteria:**
- [ ] Soft delete sets `deleted_at` only — causes/edges remain
- [ ] Restoring a node restores visibility for users with existing edges
- [ ] Permanent delete requires confirmation and is irreversible
- [ ] Trash badge count is accurate
- [ ] Drag to trash icon works

---

### P7 Gate Conditions

- [ ] All drag targets from PRD §12 table are functional
- [ ] Auto-create folder/group name prompt has working cancel
- [ ] Long-press wobble animation works on mobile and desktop
- [ ] Trash restore correctly uses existing edges
- [ ] Permanent delete is behind a confirmation

---

## PHASE 8 — Media & Cards

**Goal:** Card detail modal is fully implemented. Media embeds work. Metadata extraction Edge Function is deployed.

**PRD sections:** §14 (card detail modal), §15 (media viewing), §15.1 (metadata + auto-tagging Edge Function)

---

### P8-T01 — Metadata extraction Edge Function

**Cascade prompt:**
> Project: LIKED · Task: P8-T01  
> Create the Supabase Edge Function `supabase/functions/extract-node-metadata/index.ts` per the EXACT contract in PRD §15.1. Input: `{url?, text_content?, user_language_code}`. Processing: (1) For URL cards: fetch page, parse Open Graph tags first (`og:title`, `og:description`, `og:image`, `og:type`, `og:video:tag`, `og:article:tag`), fallback to `<title>` + `<meta name="description">` + twitter tags. Upload discovered image to Supabase Storage bucket `thumbnails/` → return `thumbnail_key`. Extract `suggested_tags` (max 8): from og:type, URL path keywords, title/description keywords (normalize + remove stop-words for English + user_language_code). (2) For text-only cards: use first 120 chars as title, simple keyword extraction for tags. (3) Error handling: if any step fails, return sensible defaults — never throw. (4) Log every invocation to `activity_log`. (5) Rate limit: 30 calls per user per minute. Deploy via `supabase functions deploy extract-node-metadata`. Please include Task ID P8-T01 in your reply.

**Acceptance criteria:**
- [ ] Function deploys without error
- [ ] YouTube URL returns correct title, thumbnail, and tags like "video"
- [ ] Spotify URL returns correct metadata
- [ ] Text-only card returns title + empty tags gracefully
- [ ] Network errors return defaults, not crashes
- [ ] Every call logged to `activity_log`

---

### P8-T02 — Node creation with metadata

**Cascade prompt:**
> Project: LIKED · Task: P8-T02  
> Update `createNode()` from P2-T02 to call `extract-node-metadata` Edge Function and process its output. The Edge Function call must happen INSIDE the same atomic transaction as the node INSERT (use Supabase RPC or a Postgres function wrapper). After Edge Function returns: (1) Update the node row with `title`, `thumbnail_key`, `language_code` from the response. (2) For each string in `suggested_tags`: run the deterministic tag creation process (§19.3) and call `addTagToNode()`. All operations (node INSERT + tag creates + tag_edges) are in ONE transaction. If Edge Function times out or errors: still create the node with defaults (`title = url or first 120 chars of text`, no tags, no thumbnail). Remove the temporary test input from P2-T04 and replace with the FAB as the sole creation path. Please include Task ID P8-T02 in your reply.

**Acceptance criteria:**
- [ ] Pasting a YouTube URL creates a node with title, thumbnail, and auto-tags
- [ ] Edge Function failure still creates the node (with defaults)
- [ ] All operations in one transaction
- [ ] Temporary P2-T04 input is removed

---

### P8-T03 — Card detail modal

**Cascade prompt:**
> Project: LIKED · Task: P8-T03  
> Implement the full Card Detail Modal per PRD §14. Opens on single card tap (not during long-press). Layout: near-full-screen, two panels side-by-side on desktop, stacked on mobile. **Left panel**: embedded player — YouTube iframe for youtube.com URLs, Suno embed for suno.com, Spotify embed for spotify.com, generic iframe for others, thumbnail fallback. Full-screen button expands player to true fullscreen. **Right panel**: title (inline editable by owner), URL (tappable), Added by (avatar + name), Date added, Tags (colored chips), Folders (this card belongs to), Shared with (avatars, names on hover), Views + Share count, Average rating (tap to expand rating UI), Your rating (tap to edit). **Rating UI**: slider 0–10 step 0.5, 44px handle, shows Your Rating + Average + friend breakdown (avatar + score list). Auto-saves on slide end. **Actions**: Share with, Move to folder, Add to group, Edit tags, Copy link, Open externally, Move to trash. Context menu = Bottom-sheet (mobile) / Side drawer (desktop). Please include Task ID P8-T03 in your reply.

**Acceptance criteria:**
- [ ] YouTube, Suno, Spotify embeds work correctly
- [ ] Full-screen button works for all embed types
- [ ] Rating slider auto-saves on slide end (UPSERT + cache update in one tx)
- [ ] All metadata fields are populated
- [ ] Context menu is bottom-sheet on mobile, side drawer on desktop
- [ ] Title editable inline by owner only

---

### P8 Gate Conditions

- [ ] Edge Function deployed and working
- [ ] Node creation fills title, thumbnail, tags automatically
- [ ] Card detail modal shows all fields
- [ ] Media embeds work for all 3 services
- [ ] Rating in modal triggers correct UPSERT + cache update

---

## PHASE 9 — Search & Filters

**Goal:** Search works (translation-aware). Multi-filter AND logic works. Feed toggle (All/Received/Sent) works.

**PRD sections:** §7.1 (feed toggle), §11.1 (search), §16 (selection + filtering), §33.5 (search behavior)

---

### P9-T01 — Feed 3-state toggle

**Cascade prompt:**
> Project: LIKED · Task: P9-T01  
> Add Mine sub-filter per Amendment A.  
> Implement the 3-state feed filter tabs per PRD §11.2a: **All / Mine / Received**. These are tab buttons sitting directly below the top bar (not a toggle in the top bar — they are in the feed filter tab row).
> - **All** (`p_view = 'all'`): default — all visible nodes for current user (own + received).
> - **Mine** (`p_view = 'mine'`): cards where `origin_user_id = current_user`. Includes shared-out and unshared own cards. Color: `--color-mine` = `--color-accent` (amber). **When Mine is active, show sub-filter row**: All Mine (default) / Not shared (no outbound edges) / Shared (has outbound edges). Stored in local UI state, resets to All Mine on tab switch.
> - **Received** (`p_view = 'received'`): cards where `edges.direction = 'received'`. Color: `--color-received` (blue).
> The **Sent tab is removed** per PRD §11.2a. To see cards shared with a specific person: Mine tab + tap that friend in the Friends Strip.
> Tab colors: All = neutral grey · Mine = amber · Received = blue. Active tab shows `bg4` background + colored label. Update `filterStore.ts` `feedView` type to `'all' | 'mine' | 'received'`. Update the `get_feed()` RPC call to pass the correct `p_view` value — note: the SQL function accepts `'all' | 'mine' | 'received'` (update if needed). **Card direction badge**: small direction circle on card bottom-right — blue (`--color-received`) for received, amber (`--color-mine`) for own. Use the EXACT same CSS tokens for both tabs and badges. Please include Task ID P9-T01 in your reply.

**Acceptance criteria:**
- [ ] 3 tabs render: All · Mine · Received (no Sent tab)
- [ ] All / Mine / Received return correct node sets
- [ ] Mine tab shows sub-filter: All Mine / Not shared / Shared
- [ ] Card badges use the exact same CSS tokens as the tab colors
- [ ] "All" is the default state on app load
- [ ] `filterStore.ts` `feedView` type is `'all' | 'mine' | 'received'`

---

### P9-T02 — Search

**Cascade prompt:**
> Project: LIKED · Task: P9-T02  
> Implement search per PRD §11.1 and §33.5. Search must query (using `ILIKE` or `pg_trgm`): (1) `translations.title` and `translations.description` WHERE `language_code = user.language_code`. (2) `tag_translations.label` WHERE `language_code = user.language_code`. (3) `nodes.title` as final fallback. No cross-language blending. All results still filtered through the visibility model (only nodes user can see). Search input in top bar: icon-only when space is limited, expands to full input on tap/click. Results update the feed in real-time as user types (debounce 300ms). Per PRD §39, search icon-only behavior is required. Please include Task ID P9-T02 in your reply.

**Acceptance criteria:**
- [ ] Search returns only nodes the user can see
- [ ] Tag label search works (finding nodes by tag name)
- [ ] Results update with 300ms debounce
- [ ] Search icon is icon-only until tapped/clicked
- [ ] No cross-language blending

---

### P9-T02.5 — UI Alignment with Prototype (BLOCKING)

**Goal:**
Align production UI with HTML prototype (single source of truth)

**Rule (MANDATORY):**
- Blocks P9-T03 execution until completed

**Scope:**
- Extract UI rules from prototype
- Perform gap analysis (visual / structural / behavioral)
- Fix UI component-by-component
- No backend or logic changes allowed

**Constraints:**
- Prototype overrides PRD and code (UI only)
- No heuristic interpretation
- No redesign

**Output:**
- UI fully matches prototype
- No regressions

**Failure Conditions:**
- Missing states in prototype
- Requires backend change
- Ambiguity in interaction

---

### P9-T03 — Multi-filter system

**Cascade prompt:**
> Project: LIKED · Task: P9-T03  
> Implement multi-filter per PRD §16. (1) Clicking a friend avatar = activate friend filter (highlight state). Clicking again deactivates. (2) Clicking a folder chip = activate folder filter. (3) Clicking a tag chip = activate tag filter. (4) Multiple selections are AND logic: all active filters must match. (5) **Clear Filters button**: visible in top bar ONLY when any filter is active; single tap clears all. (6) Clicking "Me" avatar: clear all filters + load personal feed (own nodes only). (7) When folder/group is selected: highlight (glow) all friends with access in the Unified bar. Show a scrollable row of access avatars directly above the bars with a "View all" icon opening a full list modal. (8) Active selections show colored border / filled state. Please include Task ID P9-T03 in your reply.

**Acceptance criteria:**
- [ ] AND logic: friend + folder = intersection
- [ ] Clear Filters only visible when a filter is active
- [ ] "Me" avatar clears everything and shows only own nodes
- [ ] Folder/group selection highlights friends with access
- [ ] "View all" modal shows complete access list

---

### P9 Gate Conditions

- [ ] Feed toggle shows correct node sets for All/Received/Sent
- [ ] Card badges match toggle button colors exactly
- [ ] Search queries translations and tags in user's language
- [ ] Multi-filter AND logic is correct
- [ ] Clear Filters behaves correctly

---

## PHASE 10 — Realtime & Notifications

**Goal:** Supabase subscriptions push updates in real time. Notification system works.

**PRD sections:** §22 (real-time sync), §23 (auth + persistence), §25 (notifications), §26 (activity log), §32.5 (profile propagation)

---

### P10-T01 — Supabase Realtime subscriptions

**Cascade prompt:**
> Project: LIKED · Task: P10-T01  
> Implement Supabase Realtime subscriptions per PRD §22 and §32.5. Subscribe to the following channels: (1) `edges` INSERT for current user's `user_id` → refresh visible nodes feed when a new share arrives. (2) `notifications` INSERT for current user → increment notification bell badge, show toast. (3) `ratings` INSERT/UPDATE for nodes in current user's feed → update displayed avg_rating without full reload. (4) `users` UPDATE for any user in current user's feed (avatar or display_name changes) → update all avatar/name displays. (5) `nodes` UPDATE for nodes current user can see (title change) → update card titles. Use Supabase `channel().on('postgres_changes', ...)` API. Subscriptions must be set up in a client component and cleaned up on unmount. Please include Task ID P10-T01 in your reply.

**Acceptance criteria:**
- [ ] Receiving a share causes the new node to appear in feed without page refresh
- [ ] Notification bell increments when a new share is sent to current user
- [ ] Rating change updates avg_rating on card face in real time
- [ ] Username/avatar change propagates to all visible cards
- [ ] Subscriptions clean up on component unmount

---

### P10-T02 — Notification view

**Cascade prompt:**
> Project: LIKED · Task: P10-T02  
> Implement the notification bell and notification list per PRD §25. (1) Bell icon in top bar with unread count badge. (2) Clicking opens a notification list (dropdown or panel): shows all notifications for current user from `notifications` table, newest first. Notification types to display: new share received (with node thumbnail + sender avatar), group membership change, folder share. (3) Marking as read: clicking any notification sets `read = true`. Clicking "Mark all read" bulk-updates. (4) Badge clears when all are read. Please include Task ID P10-T02 in your reply.

**Acceptance criteria:**
- [ ] Badge count is accurate
- [ ] Notification list shows correct content per type
- [ ] Read status updates correctly
- [ ] Real-time badge increment from P10-T01 works

---

### P10 Gate Conditions

- [ ] Receiving a share updates feed in real time
- [ ] Notification bell works with accurate count
- [ ] Profile changes propagate in real time
- [ ] No memory leaks from subscriptions

---

## PHASE 11 — Advanced Views & Multilingual

**Goal:** Infinite canvas is polished. Horizontal rows work completely. Multilingual system is fully functional.

**PRD sections:** §11.2 E (infinite canvas), §11.2 D (horizontal rows), §33 (multilingual)

---

### P11-T01 — Infinite canvas polish

**Cascade prompt:**
> Project: LIKED · Task: P11-T01  
> Polish the Infinite Canvas view from P5-T03. Requirements per PRD §11.2 E: (1) Free card positioning — drag cards anywhere on the canvas and persist position to DB. (2) **Pinch-to-zoom is REMOVED** (PRD §39) — do not implement it. Pan with mouse drag or touch drag. (3) Folders open as sub-canvases (clicking a folder chip while in canvas mode zooms into that folder's card collection). (4) Smart auto-arrange: button to auto-arrange all cards in a tidy grid layout. (5) Real-time sync: card position changes sync via Supabase subscriptions for users viewing the same folder context. (6) All drag-and-drop, multi-select, and context actions work identically in canvas mode. Please include Task ID P11-T01 in your reply.

**Acceptance criteria:**
- [ ] Card positions persist to DB and survive refresh
- [ ] No pinch-to-zoom anywhere
- [ ] Folder sub-canvas navigation works
- [ ] Position changes sync in real time
- [ ] Auto-arrange produces clean layout

---

### P11-T02 — Multilingual support

**Cascade prompt:**
> Project: LIKED · Task: P11-T02  
> Implement the multilingual system per PRD §33. (1) Add language selector to Profile Modal — sets `users.language_code`. Supported languages: `en`, `fr`, `th` (matching seed data). (2) Implement the deterministic fallback chain for node title/description (§33.3): user language → node language → `nodes.title`. (3) Tag labels use fallback chain (§33.4): user language → English → tag_id suffix. (4) Search queries translations in user's language (already done in P9-T02 — verify). (5) The `extract-node-metadata` Edge Function from P8-T01 already accepts `user_language_code` — verify it stores `language_code` on the node correctly. (6) Add translated content to a few seed nodes (INSERT rows into `translations` table for French and Thai) to test the fallback chain. Please include Task ID P11-T02 in your reply.

**Acceptance criteria:**
- [ ] Changing language in Profile Modal changes displayed content immediately
- [ ] Fallback chain works: if no translation in user's language, shows node language, then raw title
- [ ] Tag labels use translated versions
- [ ] No runtime translation API calls anywhere

---

### P11 Gate Conditions

- [ ] Infinite canvas: positions persist, no pinch-to-zoom, sub-folder navigation works
- [ ] Multilingual fallback chain works for titles, descriptions, and tags
- [ ] No AI or external translation service called at read time

---

## PHASE 12 — Admin & Permissions

**Goal:** Folder and group admins can be granted. Admin capabilities work fully.

**PRD sections:** §21 (admin permissions), §17.2 (grant via long-press)

---

### P12-T01 — Admin grant and capabilities

**Cascade prompt:**
> Project: LIKED · Task: P12-T01  
> Implement the admin permissions system per PRD §21. (1) `grantFolderAdmin(granterId, folderId, targetUserId)` — verify granter is owner or admin of folder, INSERT into `folder_admins`. (2) `grantGroupAdmin(granterId, groupId, targetUserId)` — same for groups. (3) Enforce admin capabilities: folder admins can rename, add/remove nodes, share/unshare folder, grant admin to others. Group admins can rename, add/remove members, share nodes to group, delete group. (4) UI: in long-press context menu (P7-T03), when a friend avatar is selected in the context of a folder/group the current user owns/admins, show "Give admin rights" action. (5) In folder/group detail view: member list with admin toggle per member. Please include Task ID P12-T01 in your reply.

**Acceptance criteria:**
- [ ] Admin grant is visible in long-press menu only in correct context
- [ ] Admin can perform all listed actions
- [ ] Non-admins cannot perform admin actions (server-side check)
- [ ] Admin status shows correctly in member list

---

### P12 Gate Conditions

- [ ] Admin grant works via long-press and member list
- [ ] Admin capabilities are enforced server-side
- [ ] Non-admins are blocked from admin actions

---

## PHASE 13 — Chat (DEFERRED)

Per PRD §28: do not implement until all P1–P12 gate conditions pass.

Tables exist in schema (`direct_chats`, `messages`, `group_messages`, `node_messages`) but are not activated.

---

## VALIDATION AGAINST PRD §30 CHECKLIST

This build plan maps to the full §30 validation checklist as follows:

| PRD §30 Category | Phase(s) that satisfy it |
|---|---|
| Edge-based visibility | P1-T02, P2-T01, P3-T05 |
| Cause + edge writes | P3-T01, P3-T02, P3-T04, P4-T02 |
| Rating atomicity | P6-T02 |
| Soft delete preserves edges | P7-T04 |
| Folder share/unshare | P4-T02 |
| Block system | P2-T01 (included in query), P3-T05 |
| Provenance fields | P1-T02, P2-T02 |
| Profile identity rules | P1-T03, P5-T04 |
| Multilingual | P11-T02 |
| Tag system | P6-T01 |
| Feed toggle | P9-T01 |
| Multi-filter | P9-T03 |
| View modes | P5-T03 |
| Card detail modal | P8-T03 |
| Long-press / multi-select | P7-T03 |
| Drag and drop (all targets) | P7-T01, P7-T02 |
| Trash | P7-T04 |
| Admin | P12-T01 |
| Bars & navigation | P5-T01 |
| Breadcrumb | P4-T03 |
| Nested folder feed | P4-T04 |
| Realtime | P10-T01 |
| Auto-tagging Edge Function | P8-T01, P8-T02 |
| Seed data | P1-T05 |

---

## APPENDIX: CASCADE SESSION STARTER TEMPLATE

Use this at the start of every new Cascade session:

```
I am building LIKED — a content-sharing web app.
Stack: Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase.
Active task: [TASK ID e.g. P3-T01]

Non-negotiable constraints:
1. Visibility = edge existence only. No other mechanism.
2. Every edge must have a non-null cause_id.
3. No UNIQUE(node_id, user_id) on the edges table.
4. All writes are atomic transactions; rollback on failure.
5. Soft delete never removes causes or edges.

Reference document: 01_PRD.md (authoritative — read before modifying any data model or write path).

Task description: [paste task description from this document]

Please include task ID [TASK ID] in your reply.
```

---

*End of LIKED Build Plan v1.0*
