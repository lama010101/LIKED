# PLAN-REC-001 — Recommendation data layer plan

**Project:** LIKED · **Task ID:** PLAN-REC-001 · **Task Title:** Plan the recommendation data layer (TMDB titles, share note, watch state, ranked lists)
**Date:** 2026-11-20 · **Status:** PLAN ONLY — no code, no migrations written. Next free migration number: **142**.
**Legend:** PROVEN = verified in repo/live schema · UNVERIFIED = could not confirm.

---

## 0. Verified schema baseline (evidence)

| Fact | Evidence |
|---|---|
| `node_type` allowed values are exactly `'text','link','image','video'` (CHECK constraint) | `supabase/migrations/098_add_node_type_and_parent_node_id.sql:66-70` |
| `nodes` columns include `thumbnail_key TEXT` (storage key); no general-purpose metadata JSONB on `nodes` | `supabase/migrations/001_initial_schema.sql:24-29` |
| `causes.cause_type` CHECK = `('direct_share','group_share','import')`; `causes.metadata JSONB` already exists | `001_initial_schema.sql:44,47` |
| `edges` columns: `id,node_id,user_id,cause_id,sender_id,direction,depth,permission,created_at` | `125_share_rpcs.sql:191-194` |
| `share_node(p_node_id, p_permission, p_target_user_ids[], p_all_friends)` — SECURITY DEFINER, per-recipient loop: INSERT cause (`direct_share`, metadata `{node_id,target_user_id,permission}`) → INSERT 2 edges (received+sent, same `cause_id`) → INSERT notification `share_received` payload `{node_id,node_title,sender_id,permission}` | `125_share_rpcs.sql:161-208` |
| `notifications(id,user_id,type,payload JSONB,read,created_at)` | `125_share_rpcs.sql:199-201` |
| `node_notes(node_id,user_id,content)` UNIQUE(node_id,user_id), RLS own-select — personal notes, NOT share notes | `065_create_node_notes.sql:16-40` |
| `ratings(node_id,user_id,score NUMERIC(3,1) 0–10 step .5, updated_at)` UNIQUE(node_id,user_id) — closest existing per-user-per-node state table | `001_initial_schema.sql:72-80` |
| `create_node_with_metadata` RPC params: `p_owner_id,p_url,p_text_content,p_title,p_thumbnail_key,p_language_code,p_tag_labels,p_node_type,p_description,p_auto_folder_name` (+`p_note` variant in `import_url`) | `lib/db/nodes.ts:139-149`, `094:1882`, `100:172` |
| Metadata extraction = Supabase Edge Function `extract-node-metadata` invoked via `extractNodeMetadata()` | `lib/edge/extract-metadata.ts:19,39` |
| YouTube search route uses the **user's OAuth token** (`getStoredYouTubeToken(user.id)` → `searchYouTubeVideos(accessToken,q)`), requires auth + connected account | `app/api/youtube/search/route.ts:14-33` |
| `rankedList` flag exists only in PRD prose (`docs/01_PRD.md:934,2287`); custom order exists via `p_custom_order_ids` feed param + migrations 032/086/101; `NEEDS-SPEC-N5` has **no repo hit** | grep: no matches outside PRD lines |
| `get_feed` signature + `feedParams` + `filterStore` semantics frozen per `docs/UIX-PORT-PLAN.md` | task constraint |

---

## 1. TITLES — TMDB movie/TV node representation

**Current state (PROVEN):** `node_type` is CHECK-limited to 4 values; nodes carry `url`, `title`, `thumbnail_key`, `text_content`, `description`, `language_code`. Dedupe today = `UNIQUE(url, owner_id)` per-owner (task states; consistent with `import_url`/`create_node` upsert behavior — exact constraint definition UNVERIFIED, not re-grepped this pass). `create_node_with_metadata` is the single write RPC for nodes+tags+auto-folder.

**Options:**

- **A. `node_type='link'` + canonical TMDB URL** (`https://www.themoviedb.org/{movie|tv}/{id}`), metadata in a new `node_tmdb` table (`node_id PK→nodes, tmdb_id, media_type, title, year, poster_path, runtime, genres jsonb, overview`).
  - Pros: zero CHECK-constraint migration; canonical URL makes `UNIQUE(url,owner_id)` dedupe free; TMDB ids stable; `node_type='link'` already renders hostname/thumb correctly.
  - Cons: media_type must be parsed from URL or stored; "is this a TMDB title?" requires a lookup/join.
- **B. Extend CHECK to add `'movie'`,`'show'`** + same `node_tmdb` table.
  - Pros: explicit type in feed/filtering later; cleaner queries.
  - Cons: CHECK migration + audit of every `node_type` consumer (CardItem renders by type? UNVERIFIED — `visibility.ts:33` types it as union, `nodes.ts:21` lists allowed values; a 5th/6th value may break TS unions → cascading edits).
- **C. Metadata as jsonb column on `nodes`** — rejected: nodes has no metadata jsonb today; mixing TMDB shape into the core row couples every consumer to an optional payload.

**Recommendation: A** — `node_type='link'`, canonical TMDB URL, new `node_tmdb` table keyed by `node_id`. YouTube videos stay `node_type='video'` with their existing URL scheme (already unique per video). Dedup: same TMDB title saved twice by same owner → same canonical URL → existing unique constraint rejects/merges; different owners get separate nodes sharing the same `tmdb_id` (acceptable — edges model per-user items; a `tmdb_id` index enables future "friends also liked" joins).

**`create_node_with_metadata` / `extract-node-metadata` reuse:** bypass the Edge Function for TMDB (metadata comes from TMDB API at search time, not fetched post-hoc). Write path = new SECURITY DEFINER RPC `create_tmdb_node(p_tmdb_id, p_media_type, …)` that inserts node + `node_tmdb` row atomically (mirrors `import_url`'s transaction shape). `extract-node-metadata` remains for generic links only.

**Invariants touched:** write-system rule (single RPC transaction) — preserved by design; visibility/edges untouched; `get_feed` untouched (TMDB rows flow through as normal nodes).
**Effort:** M · **Risks:** `UNIQUE(url,owner_id)` semantics UNVERIFIED — confirm it is owner-scoped not global before relying on cross-owner dup behavior; canonical-URL normalization (trailing slash, locale prefixes like `/en/`) must be exact.

---

## 2. SEARCH — TMDB multi-search proxy + YouTube

**Current state (PROVEN):** `app/api/youtube/search/route.ts` — GET `?q=`, requires Supabase auth, then `getStoredYouTubeToken(user.id)`; calls `searchYouTubeVideos(accessToken, q)` (`lib/youtube/client`). Auth = **user OAuth token**, not an API key. The token's granted scopes come from the OAuth connect flow (`/api/youtube/connect`) — whether `youtube.readonly` is among them is **UNVERIFIED** (scope list lives in the connect route/OAuth config, not re-checked); search endpoint quota: `search.list` ≈ **100 units/call**, daily cap 10,000 units → ~100 searches/day/user-OAuth-quota (per-token project quota is shared across the OAuth client's project — effectively app-wide).

**Options:**

- **A. New `/api/search/tmdb` route** — server-side `fetch` to `api.themoviedb.org/3/search/multi` with `TMDB_API_READ_ACCESS_TOKEN` (v4 read token, env secret) or v3 `api_key`; returns normalized `{id,media_type,title,year,poster_path,overview}`.
  - Pros: no user OAuth needed; TMDB read token is free; multi-search covers movie+tv in one call; keeps key server-side (CSP `connect-src` already allows only self+supabase+googleapis — a same-origin proxy needs **no CSP change**).
  - Cons: new env secret; TMDB attribution requirements (logo/text) — product decision.
- **B. Client-direct TMDB call** — rejected: would require `connect-src https://api.themoviedb.org` CSP change + exposes key or needs a public token.
- **YouTube side:** reuse existing `/api/youtube/search` unchanged. If product wants search without requiring YouTube connect, alternative = server-side YouTube Data API key (`YOUTUBE_API_KEY`) — but that introduces a second quota pool and a new secret; **recommend keeping user-OAuth path** and marking "connect YouTube to search videos" as the UX.

**Recommendation:** A for TMDB + keep existing YouTube route. One aggregate `/api/search?q=` could wrap both later; not required for v1.
**Invariants touched:** none (read-only routes).
**Effort:** S (TMDB proxy) · **Risks:** env secret provisioning; TMDB ToS attribution; `youtube.readonly` scope presence UNVERIFIED — confirm before promising video search to non-connected users.

---

## 3. SHARE NOTE — optional ≤280-char note on share

**Current state (PROVEN):** `share_node` (125:161-208) writes cause `metadata` JSONB `{node_id,target_user_id,permission}` + notification `payload` `{node_id,node_title,sender_id,permission}`. `causes.metadata` is free-form JSONB — a `note` key fits with **zero schema change**. `node_notes` is per-user personal annotation — wrong place (recipient ≠ author).

**Options:**

- **A. `p_note` param on `share_node` → `causes.metadata.note` + notification `payload.note`.**
  - Pros: smallest diff; note lives with the cause (immutable, per-recipient — two recipients can get different notes? No — `share_node` loops recipients inside one call with ONE note → same note to all targets of that call; per-recipient notes would need per-recipient calls — acceptable v1).
  - Cons: `get_feed` does NOT return cause metadata → recipient feed can't show the note without a second fetch (see below); notification payload already carries per-recipient fields so `note` slots in cleanly.
- **B. New `share_notes(cause_id, note)` table or `edges.note` column.**
  - Pros: queryable per edge; survives cause metadata semantics.
  - Cons: new table/RLS for data that is 1:1 with the cause; `edges` is hot — column add is cheap but every edge row pays for a mostly-null text field; still invisible to `get_feed`.
- **C. Extend `get_feed` to return the note** — **rejected**: get_feed signature is frozen; changing its return shape breaks feedParams/filterStore contract.

**Recommendation: A** — `share_node(p_node_id, p_permission, p_target_user_ids, p_all_friends, p_note TEXT DEFAULT NULL)`, `CHECK char_length<=280` enforced in SQL (`left(p_note,280)` or raise), store in `causes.metadata->>'note'` and mirror into `notifications.payload.note`. Feed display: new batched RPC `get_share_notes(p_node_ids UUID[])` → returns `{node_id, note, sender_name}` for `direction='received'` edges joined to their cause — called lazily by FeedHome exactly like `getNodeFoldersAction` (`FeedHome.tsx:86-92` pattern). CardItem renders note when present.

**Callers/tests affected:** `share_node` callers — `app/lib/actions/*` share action(s) (UNVERIFIED exact file — grep `share_node` in `app/lib` needed at implementation), `ShareSheet.tsx` UI (add textarea), `e2e` share specs, migration authz tests (`verify-rpc-authz` scripts pattern), notification rendering (`NotificationsView`). `get_share_notes` is additive — no existing caller breaks.
**Invariants touched:** write-system rule preserved (still one RPC, cause+edges+notification in one transaction per recipient); visibility untouched; `get_feed` untouched.
**Effort:** M · **Risks:** notes are per-share-call not per-recipient (document); 280 limit must be enforced DB-side not just UI.

---

## 4. WATCH STATE — want/watched per user per node

**Current state (PROVEN):** `ratings(node_id,user_id,score,updated_at)` UNIQUE(node_id,user_id) is the exact shape needed minus the score semantics; `node_notes` proves the per-user-per-node table+RLS pattern. No watch/status table exists (UNVERIFIED exhaustively — grep `watch|watched|want_to` returned nothing relevant).

**Options:**

- **A. New `node_watch_state(node_id,user_id,status TEXT CHECK IN('want','watched'),updated_at)` UNIQUE(node_id,user_id), RLS own-row, SECURITY DEFINER RPCs `set_watch_state(node_id,status)` / `clear_watch_state(node_id)`.**
  - Pros: mirrors `ratings` exactly; tiny; status is enum-safe; timestamp = `updated_at` (add `watched_at` only if product needs first-watched vs last-toggled — recommend single `updated_at` v1).
  - Cons: new table + 2 RPCs + grants/revokes boilerplate (follow migration 094/125 authz pattern: `auth.uid()` check, revoke PUBLIC/anon).
- **B. Reuse `ratings` with sentinel scores** — rejected: corrupts rating semantics (`avg_rating` aggregates).
- **C. `node_notes`-style content column** — rejected: status is structured, not prose.

**Feed read without touching `get_feed`:** batched RPC `get_watch_states(p_node_ids UUID[])` → `{node_id,status}` for `auth.uid()` — same lazy-batch pattern as `getNodeFoldersAction`; FeedHome merges into card props; CardItem shows Want/Watched pill + toggle. Optimistic UI via server action + `router.refresh()` is NOT needed — local state + revalidate (existing action pattern).
**Invariants touched:** new table is user-private state (RLS own-row) — does NOT create visibility; edges/causes untouched; `get_feed` untouched.
**Effort:** S–M · **Risks:** status transitions (want→watched→want) — decide whether re-marking updates `updated_at` (recommend yes); whether 'watched' should also write a rating prompt (product decision, out of scope).

---

## 5. RANKED LISTS — ordered folders with positions + per-item note

**Current state (PROVEN):** PRD defines `rankedList: true` flag on folder node driving a ranked rendering (`docs/01_PRD.md:934,2287` — checkbox unchecked). Custom ordering exists: `p_custom_order_ids` feed param (`lib/db/feed.ts:71`), migrations 032/086/101, `lib/db/nodePreferences.ts`. `NEEDS-SPEC-N5` — **no repo/doc hit; UNVERIFIED** what it specifies (likely a pending spec id for ranked lists — owner must supply).

**What's missing for "ranked folder with explicit positions + per-item note":**
1. A `ranked` flag on folders — `folders` table has no such column today (UNVERIFIED exact columns; `get_folders`/`create_folder` RPCs exist in mvp2 actions). Needs `folders.ranked BOOLEAN` or a `folder_kind` — migration 142+.
2. Explicit positions — today ordering is `p_custom_order_ids` array per user-view, not a stored per-folder rank. Options:
   - **A. `folder_positions(folder_id,node_id,position INT)`** — explicit, shareable, simple; UNIQUE(folder_id,node_id); positions reassigned on reorder (fractional indexing optional later).
   - **B. Reuse `card_positions`-style existing table** — `card_positions` table EXISTS (seen in PostgREST error hint earlier: "Perhaps you meant 'public.card_positions'") — **UNVERIFIED** whether it already stores per-folder ordering; CHECK FIRST at implementation — if it does, extend it rather than add a table.
3. Per-item note on a ranked list — reuse `node_notes`? It's per-(node,user) global, not per-folder — a note "why #3" on a list item needs `(folder_id,node_id,user_id)` → new `folder_item_notes` or extend positions table with `note TEXT`. Recommend folding note into the positions table (one row per list item anyway).
4. Friend viewing a shared ranked folder — folder share already creates edges via folder-share RPCs (031/036); recipient sees folder via `get_folders p_friend_id`; items resolve through existing feed/folder queries — the ranked flag + positions ride along in `get_folder` detail payload (additive fields, not get_feed).

**Recommendation:** verify `card_positions` semantics first; else option A + `note` column; `folders.ranked` flag; expose via `get_folder`/`get_folders` additive fields only.
**Invariants touched:** positions/notes are folder-scoped metadata — must NOT leak into `get_feed` ordering (feed order stays SQL-owned); visibility still edges-only.
**Effort:** M–L · **Risks:** NEEDS-SPEC-N5 undefined — blocked on owner spec; position-reassignment write volume; whether ranked lists are shareable or owner-only (product decision).

---

## 6. TASK BREAKDOWN (ordered; IDs follow repo P#/named style)

| # | Task | Depends on | Acceptance criteria | Tests | Secret? |
|---|---|---|---|---|---|
| T1 | `PLAN-REC-002`: verify `UNIQUE(url,owner_id)` semantics + `card_positions` schema + `extract-node-metadata` contract + YouTube OAuth scopes (`youtube.readonly`) | — | written findings doc; all UNVERIFIED items resolved | — | no |
| T2 | Migration 142: `node_tmdb` table + `create_tmdb_node` RPC (+ grants/revokes per 094 pattern) | T1 | node+tmdb row atomic; authz enforced; tsc/lint clean | vitest RPC-shape test; manual create via action | no |
| T3 | `/api/search/tmdb` route (multi-search proxy, env `TMDB_API_READ_ACCESS_TOKEN`) | T1 | returns normalized results; 401 unauth; key never client-side | route test w/ mocked fetch | **YES** |
| T4 | Share note: `share_node` +`p_note` (≤280 SQL-enforced) → cause metadata + notification payload; `get_share_notes` batched RPC; ShareSheet textarea + CardItem note render | T2(optional) | note round-trips sender→recipient feed+notification; no get_feed change | e2e share-with-note; vitest param guard | no |
| T5 | Migration 143: `node_watch_state` + `set_watch_state`/`clear_watch_state`/`get_watch_states` RPCs | T1 | status persists per user; RLS own-row; feed batch read | vitest + manual toggle on 2 accounts | no |
| T6 | Watch-state UI: pill + toggle in CardItem, batch load in FeedHome | T5 | want/watched toggles persist across reload; no feed signature change | e2e toggle flow | no |
| T7 | Ranked lists: `folders.ranked` + positions table (or `card_positions` extension) + `folder_item_notes`; `get_folder` additive fields | T1 (spec), owner spec N5 | friend sees ranked order + notes on shared folder | e2e 2-account folder share | no |
| T8 | TMDB node UI: search→pick→`create_tmdb_node`; card renders poster/overview via `node_tmdb` join in card detail (NOT get_feed) | T2,T3 | TMDB title save+share works end-to-end | e2e add-TMDB-title flow | no |

**Env secrets needed:** `TMDB_API_READ_ACCESS_TOKEN` (T3) — Vercel env, server-only. Optional later: `YOUTUBE_API_KEY` only if product wants keyless YouTube search (not recommended v1).

---

## Open questions for the owner (product decisions)

1. **NEEDS-SPEC-N5 content** — the ranked-list spec reference has no repo artifact; supply it or confirm scope above.
2. Are ranked lists **shareable** to friends, or owner-private?
3. Share note: same note to all recipients of one share action acceptable, or must notes be per-recipient (implies per-recipient share calls/UI)?
4. Watch state: should marking "watched" prompt a rating, and should "want" items appear in a dedicated view?
5. TMDB attribution/legal display requirements for posters/metadata?
6. YouTube video recommendations: is user-OAuth search (requires prior YouTube connect) acceptable, or must video search work for users who never connected?
7. Should a TMDB title shared to a friend create a **new node per recipient** (current edges model) or reference a canonical node — affects dedup design?
8. Does `node_type='link'` for TMDB titles need a distinct card visual (poster vs link thumb) — i.e., is a `media_type` badge required?

---

*End of plan — PLAN-REC-001*
