# LIKED v2 — Recommendation Inbox

**Version:** 2.6
**Status:** v2.0 APPROVED by Lolo — 2026-11-20. UI design APPROVED by Lolo — 2026-11-21 (boards v2.4). v2.5 = decisions of 2026-11-21 after investigation V2-INV-001 (hybrid architecture, server-mediated guests, YouTube search in P0, stores, shared folders). **Plan: PLAN-V2-002 (accepted 2026-11-21, PR #37).** v2.6 = CTO decisions after review of PLAN-V2-002 (2026-11-21).
**Date:** 2026-11-21
**Authority:** This document supersedes `01_PRD.md` (v28.0) for ALL product scope and UI of v2. It supersedes PRD v2.1–v2.4 and `06_V2_DECISIONS_2026-11-21.md` (merged here). The legacy engine (nodes, edges, folders, grants, groups, ratings) is REUSED, not deleted; legacy Tier-0 invariants still bind it.

### Change log
| Version | Date | Changes |
|---|---|---|
| 2.6 | 2026-11-21 | CTO decisions after review of PLAN-V2-002: (1) TMDB posters are hotlinked from image.tmdb.org and never copied; (2) `users` is not extended, preferences live in a new `user_prefs` table; (3) `owner_item_state.library_node_id` removed, "In library" is derived from a `node_items` lookup; (4) guest retention: contributors inactive 18 months with no claim are purged (P1); (5) account-deletion sheet must also list owned groups, chat messages and direct chats; (6) additional support tables are defined in PLAN-V2-002 §1.4. |
| 2.5 | 2026-11-21 | (1) **Hybrid architecture**: the inbox has its own tables; the Library (folders, nested folders, groups, permissions, sharing, ratings) is the EXISTING engine, reused as-is (§6.6, §8, D23). (2) **Shared folders are collaborative by design**: every member of a shared folder sees what any member adds (§6.6). The Ask-link inbox stays one-way and private. (3) **Guests are server-mediated** (signed cookie + `contributors` table), NOT Supabase anonymous auth (§4, §9.1, D24). (4) **Sign-in uses basic scopes only**; YouTube access moves to the incremental connect path (§9.3, D25). (5) **YouTube search is in P0** with server key, cache and budgets (§5.2, §9.4, D26). (6) **Generic `items` model** (kinds movie / series / video / channel) so "any like" fits later (§8, D27). (7) **Store release (iOS first) is a product requirement after the web MVP**, driven by the iOS share-sheet "share to LIKED" (§10.3, §12, D28). (8) Account deletion must also remove Library data (§10.2). |
| 2.4 | 2026-11-21 | Language switcher + EN/FR/ES/TH translations in P0; default-language algorithm; TMDB language sync; orange default; Settings screen (sign out, delete account); store/legal checklist. |
| 2.3 | 2026-11-21 | Rating UI in the TMDB pattern with own visuals/wording; theme and primary color specified. |
| 2.2 | 2026-11-21 | Friend rating 0–100%; per-friend unseen counts; free text + genre picker. |
| 2.1 | 2026-11-21 | Reusable Stitch ideas applied. |
| 2.0 | 2026-11-20 | Initial approved PRD. |

---

## 1. One-line product

A personal inbox for "what should I watch?". Friends open a link, recommend titles in under 30 seconds with no account, and the owner sees everything merged, enriched (where to watch, rating, year, language, genre) and filterable by friend. What the owner keeps lives in a full personal Library (nested folders, groups, role-based sharing) that already exists in LIKED.

## 2. Problem and the one risk that matters

Recommendations arrive by WhatsApp, Instagram and in person. They get lost, duplicated, and never say where the title can be watched.

**Why a friend would use a link instead of texting "watch Severance":** no signup, poster search (no typos), three taps, and the reward of seeing the owner's own picks. If the friend flow takes longer than typing a text message, the product fails. Every friend-side decision is judged against that.

## 3. Scope lock

### In scope (v1)
Ask link, friend submission (guest), owner inbox, merge, enrichment, friend rail, filters, notifications, **YouTube and TMDB search**, guest → Google upgrade, settings and preferences (language, theme, primary color), sign out, account deletion, legal pages, **promote-to-Library bridge**, **owner picks with visibility tiers**, and **sharing of Library folders/cards with friends and groups through the existing engine**.

### Reused, not rebuilt
Nested folders (depth 5), folder/card permissions (`view < comment < contribute < edit < reshare < admin`), groups, share RPCs, 0–100 ratings, trash, notifications, en/fr/th catalogs, Chrome extension. **No new folder, group or permission system is built for v2.** Library screens use the existing UI in P1; a restyle is P2 and not yet designed.

### Explicit non-goals (v1)
Drag-and-drop in the inbox, user-managed tags (the owner's taste selector uses a fixed genre list only, §6.1), multiple view modes in the inbox, infinite canvas, chat, semantic/AI search, YouTube liked-video import in the v2 flow (the legacy import keeps working), follow/feed model, content other than movies / series / documentaries / YouTube videos & channels (no books, music, podcasts, products, brands, places, arbitrary links — these come in the next version), multi-dimension ratings, a separate translations table, blended/composite scores, per-friend sharing of *inbox* entries.

Deliberately rejected: **prices** on availability (no reliable free source); **third-party scores** such as Rotten Tomatoes or "friend-match %"; showing other contributors' recommendations to an Ask-link guest (privacy — see §6.6 for the difference with shared folders).

Also out of scope in v1: **owner-branded friend pages** (a friend sees the app in their OWN theme, color and language); **machine translation of user-written text**; **data export** (P2).

**Rule:** anything not described in this document requires a written PRD amendment before any task is issued.

## 4. Actors

| Actor | Identity | Notes |
|---|---|---|
| **Owner** | Google sign-in (basic scopes) | Has an Ask link, an inbox, a Library, optional picks |
| **Contributor (guest)** | **No Supabase session.** A signed httpOnly cookie + a row in `contributors` (display name only) | No email, no Google, no password. All guest actions go through server routes (§9.1) |
| **Contributor (upgraded)** | Google | The guest's rows are re-attributed to the user by a claim RPC; history preserved |

Any user can be an Owner. A contributor who signs in with Google gets their own Ask link by default. Multi-tenant from day one.

## 5. Friend flow — `/r/{token}`

| # | Screen | Behavior |
|---|---|---|
| 5.1 | **Landing** | Owner name + avatar + owner's prompt (default: "What's the last movie, show or documentary you recommend?" — localized; a custom prompt is shown as written). If the owner set a note (§6.1) it is shown under the prompt; if the owner selected genres, they appear as read-only tags after "{owner} likes". One field: *your name* (required, ≥2 chars, remembered). One button: **Start**. No sign-in wall. Top-right: **language/appearance button** (globe + code, e.g. "EN") opening the preferences sheet (§6.8). Page language per §6.8, never by redirect. |
| 5.2 | **Add** | One search box. Results: **TMDB movies + series** (multi-search, in the viewer's language) and **YouTube videos** (guarded search, §9.4), each with poster/thumbnail, year, type. Tap = added to the "Your picks" tray. A visible **"Or add a YouTube or IMDb link" row with a Paste button** accepts a YouTube video/channel URL, IMDb URL or TMDB URL (resolved deterministically). If the YouTube search budget is exhausted the search shows "Search is busy — paste a link instead" and TMDB search keeps working. |
| 5.3 | **Details (optional, collapsed)** | Per item: **score 0–100%** · "Where did you watch it?" (free text + chips) · comment (≤280 chars) labelled **"Why {owner} will love it"**. Never required. See "Score control". |
| 5.4 | **Submit** | **Send to {owner} (N titles)**, enabled with ≥1 item. One submission = one batch. |
| 5.5 | **After submit (single screen)** | (1) "Sent to {owner}"; (2) **receipt** card listing each title with the friend's own score and one-line note; (3) **"Want to see {owner}'s picks?"** with **Yes, show me** / **No thanks** (Yes → read-only list of owner picks with visibility `contributors` or `public`; omitted entirely if none); (4) **"Make your own list"** with **Continue with Google** — the guest identity is claimed in place (past submissions stay attached); (5) **Add more titles**. The receipt shows only the friend's own data. |

### Score control (5.3)
- Slider 0–100, steps of 5, tick labels 0/20/40/60/80/100, filled track, draggable thumb, **tooltip above the thumb with a word and the number** ("Great · 80%"). Accessible (`role="slider"`, `aria-valuetext` "80 percent, Great").
- **Untouched = no score (null). 0% is a real score.** "Clear score" resets to null.
- Word bands (localized): 0–19 Skip it · 20–39 Weak · 40–59 Mixed · 60–74 Good · 75–89 Great · 90–100 Unmissable.
- **IP rule:** the pattern (percent ring, percent slider) follows TMDB's convention; visuals, colors, wording and band labels are LIKED's own. No TMDB logo, color scheme or text ("User Score", TMDB's word labels); nothing implies endorsement.

Rules:
- Same title added twice by the same contributor to the same owner = one recommendation (latest values win).
- Caps: 20 titles per submission; 100 titles per day per contributor.
- A returning visitor on the same browser (same cookie) sees what they already sent and can add more. Edit/remove own recommendations is P1.
- **Contributors via an Ask link never see each other or each other's recommendations.**

## 6. Owner flow

### 6.1 Setup
Google sign-in → Ask link created automatically. Owner can: edit the prompt; edit an optional **"What you like"** section (free-text note ≤140 chars **and** a genre picker, multi-select from the fixed TMDB genre list, **max 5**; no custom tags); copy/share the link (native share sheet on mobile), disable or regenerate it. One link per owner in v1.

### 6.2 Inbox ("To watch")
**One list.** Cards. **Top bar: logo · Share link · Settings (gear) · Notifications (bell).**

**Status tabs:** **To watch · Watched · Dismissed**, each with a count, plus a **filter icon button** (badge = number of active filter categories) opening §6.4. Default = To watch.

**Card shows:** poster · title · year · type chip (Movie / Series / Documentary / YouTube) · friend avatar stack (up to 3 + "+N") · **friends' average score as a percentage ring with the number of raters, e.g. "87%" + "(3)"** (omitted if nobody scored) · up to 2 platform labels available in the owner's region · **a one-line quote** (selected friend's comment when a friend is selected in the rail; otherwise the most recent comment among the recommenders; omitted if none). A card whose title was promoted shows an **"In library"** marker.

**Detail sheet:** overview · runtime · original language · genres · **two percentage rings: "Friends" (accent) and "TMDB" (neutral)** · **Trailer** link · availability grouped **Stream / Rent / Buy** (no prices, "via JustWatch") · friends' average (%) and one row per recommending friend (avatar, name, score %, platform, comment, date) · actions: **Watched**, **Not interested**, **Open**, and **Add to my library** (promote, §6.6; not yet designed).

**Status:** To watch (default) · Watched · Dismissed. A new recommendation of a Dismissed title does NOT resurrect it automatically (a "recommended again" marker appears in the Dismissed tab only).

### 6.3 Friend rail (Instagram-style)
- First item **All**, then one avatar per contributor, ordered by most recent submission.
- **Unseen = recommendations whose submission has `seen_by_owner_at` null.**
- Each friend avatar shows a **count badge = that friend's unseen recommendations** (hidden at 0) plus the **ring**. **All shows the sum.** Accessible names "{Friend}, N unseen" / "All, N unseen".
- Tap avatar = filter; tap again = clear. **Single-select.**
- Opening a friend's filtered view marks that friend's submissions as seen (ring and badge disappear; All decreases by exactly that count). Viewing All marks nothing.

### 6.4 Filters (one sheet)
Platform (owner's region; includes "YouTube") · Type · Release year (decade chips) · Original language · Genre · "Recommended by 2+ friends". **Sort lives inside this sheet**: Recently recommended (default) · Most recommended · Friend score · Release date · TMDB score. Removable chips; "Clear all". Within a category = OR; across = AND; the friend-rail selection ANDs with filters.

### 6.5 Merge rules
- Canonical identity of an item = `(source, kind, external_id)`, e.g. `(tmdb, movie, 603)`, `(youtube, video, dQw4…)`.
- Same item from N friends = **one card**, N recommendation rows.
- Friend scores are integers 0–100. **Friends' average = mean of non-null scores, rounded, with n.** The **TMDB score** (`round(vote_average × 10)`) is shown separately, labelled TMDB. **Never blended.**
- A TMDB title and a YouTube upload of the "same" documentary are not merged in v1.
- Comments are never merged; each stays attributed.

### 6.6 Library and sharing (existing engine) — owner picks
**Promote:** the owner can **add any inbox item to the Library**: choose or create a folder (nested folders to depth 5), which creates a normal Library card (TMDB title or YouTube video) filed there; the inbox card shows "In library". Marking something *Watched* offers "Add to my library".

**Sharing (existing engine, unchanged):** the owner shares Library folders and cards with friends (accounts) and groups at a permission level `view / comment / contribute / edit / reshare / admin`. Ratings 0–100, trash and notifications work as today.

**Shared folders are collaborative by design (decided 2026-11-21):** when a member with `contribute` (or higher) adds an item to a shared folder, **every other member of that folder sees it**. This is the intended behavior for friend-to-friend shared lists, not a leak. It applies to account holders and folders only.

**Contrast with the Ask-link inbox:** the inbox is a one-way, private channel. Ask-link guests are not folder members, never gain access to any folder, and never see each other's recommendations.

**Owner picks (what a guest or friend can browse after submitting):** the owner designates picks in the Library with a visibility tier: `private` (default) · `contributors` (anyone who has submitted to this owner, including guests, via a server route) · `public` (anyone with a read-only share link — **one new small primitive: a share token**). Friends who have accounts can additionally be given folders through normal engine sharing.

**Library UI:** P1 uses the existing UI screens (legacy chrome) reached from the v2 app; the restyled Library is P2 and not yet designed. **Not yet designed:** the "Add to my library" sheet.

### 6.7 Notifications
One notification per **submission**: "{Friend} recommended N titles." Channels: in-app unread count (existing `notifications` table, type `recommendation_received`) + email (owner toggle). Web push is P2 (on iOS it requires an installed PWA or the native app).

### 6.8 Language, theme, primary color (all users)
**Entry points:** owner → Settings (§6.9); guest → the globe + code button on the landing opening **"Language and appearance"**. Same three controls everywhere.

| Control | Options | Behavior |
|---|---|---|
| **Language** | English · Français · Español · ไทย | Radio list with native names; instant switch, no reload. Hint: "Set from your browser. Titles, genres and descriptions follow this language too." |
| **Theme** | Light · Dark · System | Default System. |
| **Primary color** | 6 presets (**Orange default**, Blue, Violet, Teal, Green, Pink) + Custom | Each preset has a light-theme and a dark-theme tone; Custom colors are auto-adjusted to keep ≥ 4.5:1 contrast. |

**One `LANGUAGES` config synced with TMDB (D18):**

| UI code | Native name | TMDB `language` tag |
|---|---|---|
| `en` | English | `en-US` |
| `fr` | Français | `fr-FR` |
| `es` | Español | `es-ES` (Spain) or `es-MX` (any Latin-American locale) — one Spanish UI catalog |
| `th` | ไทย | `th-TH` |

- Only **UI strings** are translated by us. Titles, overviews, genre names and taglines come from TMDB in the selected language.
- **Guard:** every tag in the config must exist in TMDB's `GET /configuration/primary_translations`; a CI check fails otherwise. **Not yet verified:** that `th-TH` and `es-MX` are listed, and how complete Thai metadata is.
- **Fallback:** selected language → English (en-US) → original title; never empty. Images: `include_image_language=<ui>,en,null`.

**Default language (D17), first match wins:** (1) saved choice (profile for signed-in; cookie + localStorage for guests); (2) browser preference (`Accept-Language` on first server render, `navigator.languages` on the client; first supported primary subtag, respecting q-values); (3) English. **IP geolocation is never used for language** (IP only suggests the streaming region).

Other rules: switcher always visible; `<html lang>` follows the selection; server-rendered pages vary on language; no automatic redirects. **Per-viewer, never per-owner.** Guests persist preferences on the device; signed-in users on their profile; an upgraded guest's choices are copied. Not translated: the owner's prompt/note, friend comments, names, platform names. The owner's inbox content is stored in the owner's language (`items.localized`, keyed by TMDB tag) with background re-enrichment on language change. Theme uses CSS-variable design tokens; no hard-coded colors or strings; text on the primary color is white or near-black, whichever passes 4.5:1.

### 6.9 Settings (owner) — merged with Preferences
Full-screen **Settings** from the gear. One scrolling screen: **Account** (avatar, name, email, "Signed in with Google", Display name row) · **Preferences** (language, theme, color) · **Notifications and region** (streaming region suggested from IP country at first run; email toggle) · **About** (Privacy policy, Terms of use, Credits, Help and contact) · **Session** (Sign out) · **Danger zone** (Delete account, separated, "Permanently deletes your account and all your data.") · footer "LIKED · version x.y".

**Credits screen:** official TMDB logo + "This product uses the TMDB API but is not endorsed or certified by TMDB."; official JustWatch logo + "Streaming availability data is provided by JustWatch."; open-source licenses.

**Sign out:** ends the session on this device; deletes nothing. **Delete account:** §10.2.

## 7. Enrichment

Asynchronous at write time, never in the read path, never blocks submission. Cards render immediately with skeleton fields (`enrichment_status`: pending → partial → complete | failed).

| Field | Source | Notes |
|---|---|---|
| Title, poster, overview, runtime | TMDB details / YouTube `videos.list` | Posters are hotlinked from TMDB's image CDN (image.tmdb.org) and never copied. TMDB text stored per language tag in `items.localized`. **YouTube: store only the video id; title/thumbnail/channel are fetched at read time or cached ≤ 30 days with refresh/delete (§9.4).** |
| Release date | TMDB / YouTube `publishedAt` | |
| Original language | TMDB `original_language` / YouTube `defaultAudioLanguage` | May be null on YouTube → LLM fallback |
| Genres | TMDB genres / YouTube category | Names from TMDB's list in the selected language |
| Documentary flag | TMDB genre "Documentary" | Drives the Type chip |
| Public score | TMDB `vote_average` + votes | `round(vote_average × 10)`%, separate from friend scores |
| Where to watch | TMDB watch providers (JustWatch), per region | Stream / Rent / Buy, no prices; cache per (item, region), TTL 7 days |
| Trailer link | TMDB videos / YouTube | Link out only |

**LLM role (narrow):** last-resort gap filling in the enrichment worker only; output stored, never computed at read time.

**Region:** owner `region_code` (suggested at onboarding, editable). "Not available in {region}" is an explicit state.

**Attribution (mandatory):** Credits screen with TMDB's official logo and the required wording; JustWatch credited. TMDB terms require a written agreement for commercial use — fine for a portfolio project, a blocker if monetized.

## 8. Data model (proposed; exact DDL is produced by PLAN-V2-002-R1 and audited before any migration)

**Hybrid:** new inbox tables beside the existing engine. Existing tables used as-is: `users`, `nodes`, `edges`, `folders`, `folder_edges`, `folder_grants`, `groups`, `group_members`, `ratings`, `notifications`, `causes`.

| Table | Key fields |
|---|---|
| `users` (existing, NOT extended) + new `user_prefs` | region, email toggle, theme, accent, language fields; exact columns in PLAN-V2-002 §1.4 |
| `contributors` | id, display_name, session secret hash, created_at, last_seen_at, `claimed_by_user_id` (null until the guest signs in with Google) |
| `asks` | id, owner_id → users, token (unguessable, unique), prompt, note (≤140), liked_genres (int[] of TMDB genre ids, ≤5), is_active |
| `items` | id, `source`, `kind` CHECK IN ('movie','series','video','channel'), `external_id`, **UNIQUE(source, kind, external_id)**, name, release_date, original_language, genres, is_documentary, overview, runtime_min, trailer_url, tmdb_rating, tmdb_votes, `localized` jsonb, `fetched_at` (cache freshness for YouTube display data), enrichment_status |
| `item_availability` | item_id, region_code, provider, offer_type (flatrate/rent/buy), link, fetched_at |
| `submissions` | id, ask_id, contributor_id, created_at, `seen_by_owner_at` |
| `recommendations` | id, owner_id, item_id, contributor_id, submission_id, rating smallint (0–100, null = none), platform_text, comment, created_at, updated_at; **UNIQUE(owner_id, item_id, contributor_id)** |
| `owner_item_state` | owner_id, item_id, status (to_watch/watched/dismissed), updated_at ("In library" is derived from `node_items`, PLAN-V2-002 DV-9) |
| `share_links` (P1) | token, owner_id, scope (picks), read-only, is_active |
| `youtube_search_cache`, `youtube_search_budget` | cached query results with TTL; daily counters (global and per contributor) |
| `deletion_requests` | id, email, status, created_at, completed_at (public web deletion requests, §10.2) |

Support tables (enrichment queue, email outbox, rate limits, deletion jobs, etc.) are specified in PLAN-V2-002 §1.4.

**Rules for new tables:** RLS enabled; **no policy for `anon` or `authenticated` unless the plan justifies it** — access only through SECURITY DEFINER RPCs and server routes. Guests never touch tables. The legacy Tier-0 invariants keep binding the legacy tables; the plan must state which invariants apply to the new tables and why edge-only visibility is not violated for legacy nodes.

**Write path:** guest submission = one server route → one atomic SECURITY DEFINER RPC (validates the Ask token, enforces caps and ranges, upserts `items`, inserts `submissions` + `recommendations`, creates the notification, enqueues enrichment). **Promote** = one RPC `promote_recommendation(recommendation_id, folder_id)` creating the owner's Library node (TMDB representation per `PLAN-REC-001` option A: `node_type='link'` + canonical URL + `node_tmdb`; YouTube = video node) and filing it, atomically.

**Derived, not stored:** quote line, friends' average, per-friend unseen counts, All count.

## 9. Technical constraints (verified 2026-11-20/21; "V2-INV" = investigation V2-INV-001, PROVEN against live DB)

1. **Guest identity is server-mediated (D24).** Supabase anonymous sign-in is **disabled** on the project and no code uses it (V2-INV A1/E4); an anonymous session would also get the full authenticated surface because **no RLS policy or function checks `is_anonymous`** (A3). Therefore: guest = signed httpOnly cookie (Secure, SameSite=Lax) + `contributors` row; every guest action goes through `/api/ask/*` route handlers using the service client **after server-side Ask-token validation**; per-IP/per-cookie rate limits and a CAPTCHA-or-equivalent abuse control live in those routes; a guest has no Supabase session and cannot call any RPC directly. Reads for guests (receipt, owner picks) are token-scoped server routes. **A threat model is mandatory in the plan.**
2. **Upgrade by claim.** After Google sign-in, a claim RPC re-attributes the guest's submissions and recommendations to the signed-in user (also covers "the Google account already exists in LIKED": claim into the existing user — no special case).
3. **Sign-in uses basic scopes only (D25): openid, email, profile.** Today `login` and `signup` still request `youtube.readonly` (V2-INV E4); that is a sensitive scope and would block or warn real friends unless the Google app is verified. YouTube access uses the existing incremental `/api/youtube/connect`. The Google OAuth consent screen must be In Production (status UNVERIFIED). The plan must state how existing users' YouTube import keeps working.
4. **YouTube (D26):**
   - Quota is per Google Cloud **project**, not per user; user OAuth tokens do not add quota. The current default is about 100 `search.list` calls per day per project; more requires a compliance audit; spreading load over multiple projects is prohibited.
   - Today's search needs the user's own OAuth token, has no API key, cache or quota guard, and returns 401 to guests (V2-INV E1). v2 adds a **server-side API key** (new env var), a **query cache with TTL**, **per-contributor and global daily budgets**, search only on submit, and graceful degradation to "paste a link". Paste-link (and later the iOS share sheet) is the primary YouTube path.
   - **30-day rule:** stored YouTube API data other than IDs (titles, descriptions, creator names) must be refreshed or deleted within 30 days. v2 stores video ids and caches display data ≤ 30 days with a refresh/delete job. **The legacy app persists YouTube titles/descriptions/thumbnails/tags and never refreshes them (V2-INV E3): a separate backlog task, out of scope for v2 planning.**
5. **TMDB:** JustWatch attribution on Credits; no prices; no Rotten Tomatoes. User score = `vote_average` (0–10), shown ×10 as a percentage.
6. **Unverified risk:** provider coverage for Thailand; spot-check ≥ 20 titles before promising platform filtering as a headline feature.
7. **i18n:** `next-intl` is already installed with en/fr/th catalogs; v2 adds `es`. Every UI string via keys; ICU plurals; Thai needs a Thai-capable font fallback; layouts survive ~40% longer strings; machine-drafted catalogs reviewed by native speakers before release (FR/ES by Lolo; **Thai needs an external native reviewer**); CI fails on any missing key.
8. **Theming:** CSS variables; light/dark token sets and one accent pair per preset; WCAG 2.1 AA (4.5:1 text, 3:1 UI) for every preset in both themes, enforced in CI. A vivid orange fails with white text, so the light-theme orange is `#C2410C` and the dark-theme orange `#FF9552`.
9. **TMDB language support:** `GET /configuration/primary_translations` lists supported tags. **Not yet verified** for `fr-FR`, `es-ES`, `es-MX`, `th-TH`; Thai metadata is likely thinner → the English fallback will be hit often.
10. **Existing-engine facts to respect (V2-INV):** `nodes` uniqueness is `UNIQUE(url, owner_id)`; no authenticated RPC can create a node owned by someone else (the app writes through the service client); `get_feed` has no `node_type` filter; there is no seen/unseen state (new); `group_nodes` has no live writer; deleting a user is not covered by cascades (many FKs are NO ACTION and `public.users` has no FK to `auth.users`).

## 10. Abuse, privacy, account lifecycle and store requirements

### 10.1 Abuse and privacy
- Ask token ≥ 12 random chars; owner can disable/regenerate; regenerating invalidates the old link.
- Rate limits per IP, per cookie and per Ask token on all `/api/ask/*` routes; CAPTCHA or equivalent (decided in the plan).
- Owner can remove a contributor (deletes their recommendations) or block them. Contributor merge ("same person, two devices") is P2.
- Contributor names are self-declared and unverified.
- An Ask-link guest sees only: the landing data (owner name, avatar, prompt, note, genres), their own submissions, and owner picks the owner made visible to them.
- Guest preferences live on the device and contain no personal data.
- Guests with no activity for 18 months and no claim are purged (implemented in P1); stated in the privacy policy.

### 10.2 Account deletion and sign out (P0)
**Signed-in users — Settings → Delete account:**
1. Sheet "Delete your account?" lists exactly what is deleted: your inbox and everything friends recommended to you; your Library (cards and folders), picks and Ask link; recommendations you sent to others; notifications and settings; groups you own (their other members lose them), chat messages you sent, and direct chats you are in (the other person loses that conversation).
2. "This can't be undone. You'll be asked to confirm with Google first." + checkbox "I understand this can't be undone".
3. **Re-authentication with Google** (sign-in < 5 minutes old) → **Delete my account**.
4. Immediate **hard delete**, session ended, "Your account was deleted" screen, confirmation email. No grace period (D19).

**What is deleted:** auth user, `users` row, asks, owner_item_state, recommendations received and sent, submissions, share links, notifications, **and the Library: the user's nodes, folders, edges, grants, group memberships, ratings, stored avatar and thumbnails.** Kept (not personal): shared `items` catalog and `item_availability`. Backups roll off with the provider's retention and short-lived security logs are kept ≤ 30 days; both must be disclosed in the privacy policy.

**Effects on others:** deleting an owner removes every recommendation sent to them. Deleting a contributor removes their recommendations from every inbox and updates counts and averages (D20, no anonymized leftovers). **Items the user added to folders shared with others are removed from those folders** (the plan must define the exact rule and order, because many legacy FKs are NO ACTION and `public.users` has no FK to `auth.users`). Groups you own are deleted (their other members lose them), chat messages you sent are deleted, and direct chats you are in are deleted (the other person loses that conversation).

**Implementation:** one idempotent server function `delete_account` (service role) that checks fresh re-auth and removes data in a defined order, then `auth.admin.deleteUser`; the plan specifies the full table list and ordering.

**Guests:** the friend sheet has **Delete my data**: confirm, then the `contributors` row and all their submissions and recommendations are deleted immediately.

**Public web page `/delete-account`:** explains in-app deletion; lets the person sign in with Google on the web and delete; or submit an email request (`deletion_requests`, processed within 30 days).

**Sign out:** Settings → Sign out; this device only.

### 10.3 Store and legal checklist (iOS first)
**Why stores:** a PWA cannot appear in the iOS share sheet (Safari does not support the Web Share Target API); only a native app with a **Share Extension** can. That is how a friend shares a YouTube video straight to LIKED from the YouTube app. On Android an installed PWA can receive shares; on desktop the existing Chrome extension covers it. A real Share Extension is also genuine native functionality, which mitigates Apple's "thin website wrapper" rejection risk (guideline 4.2).

**Prerequisites and risks (P3):** a macOS/Xcode build path (Devin Cloud is Linux); feasibility of a WebView shell (there is no static export, the app needs the Next.js server, auth is cookie-based, Google OAuth redirects through the WebView); an iOS Share Extension approach (**no maintained Capacitor plugin verified — spike required**). **Open product question:** in the share sheet, who receives the video? Proposal: choose among owners the user already sent to (saved Ask links), or save for self.

| Requirement | Source rule | What LIKED must do |
|---|---|---|
| In-app account deletion | Apple 5.1.1(v); Google Play | Delete account in Settings (§10.2); a **public web deletion link** in the Play Console Data safety form (`/delete-account`); retained data disclosed |
| Equivalent login | Apple 4.8 (Google as primary login) | **Sign in with Apple** before iOS submission (Supabase supports it; guest claim works the same way) |
| User-generated content | Apple 1.2 | Block/remove contributor (§10.1), contact via "Help and contact"; **add a Report action and a server-side objectionable-text filter** |
| Not just a website | Apple 4.2 | Share Extension + push notifications as genuine native features |
| Privacy policy | Apple 5.1.1; Google Data safety | Page linked in Settings → About and on the landing footer; accurate privacy labels / Data safety form |
| Terms, support, age rating, attribution | Both stores; TMDB | Terms page, support contact, age-rating questionnaire, Credits screen |

*Technical checklist, not legal advice; the privacy policy and terms need legal review (EU/French users: GDPR rights).*

## 11. Success metrics (hypotheses)

| Metric | Target |
|---|---|
| Guests who tap Start and send ≥ 1 title | ≥ 60% |
| Median time Start → Send | ≤ 45 s |
| Titles fully enriched within 60 s | ≥ 90% |
| TMDB titles showing a platform or an explicit "not available in region" | ≥ 95% |
| Sessions whose first-render language matched the final language | ≥ 90% |
| YouTube searches answered from cache or within budget | tracked |
| Guest → Google upgrade rate | tracked |

## 12. Phases

| Phase | Content |
|---|---|
| **P0 — Core loop** | Server-mediated guest flow (incl. score slider), TMDB search + **guarded YouTube search** + paste-link, submit RPC, receipt screen, owner inbox with status tabs + counts, quote line, score rings, merge, enrichment (TMDB + providers), email notification, friend rail with rings, per-friend and All unseen counts. **Basic-scope sign-in** and moving YouTube to incremental connect. **Language switcher, EN/FR/ES/TH catalogs, browser-language default, TMDB language sync.** **Settings, Credits, delete account (incl. Library data), guest "Delete my data", public `/delete-account`, privacy policy and terms pages.** **Foundations: design tokens (light + dark), no flash of wrong theme, no hard-coded colors or text.** |
| **P1 — Depth** | Filters sheet (incl. sort), Watched/Dismissed actions, **promote to Library** + owner picks with visibility tiers + share-token public link + "see my picks" block, **Library sharing through the existing engine (existing UI)**, edit/remove own recommendations, guest → Google claim + own Ask link, owner note + genre picker on the landing, Theme and Primary color controls |
| **P2 — Polish** | Restyled Library UI, web push, contributor merge, LLM gap-filling, owner stats, data export |
| **P3 — Store release** | macOS build path, shell, **iOS Share Extension**, Sign in with Apple, Report action + comment filter, privacy labels / Data safety form, store listings |
| **Next version** | Any "like" (product, brand, food, place) with YouTube as main media: introduces an entity layer (named item + N attached videos) |

Note: the status tabs render in P0 with To watch functional; Watched and Dismissed ship in P1 (tabs hidden until then).

## 13. P0 acceptance criteria

- [ ] A guest with no account can open `/r/{token}`, enter a name, add ≥ 1 title, and submit, with no Supabase session created.
- [ ] Submission is one atomic RPC; rollback leaves no partial rows.
- [ ] Two friends recommending the same TMDB title produce ONE card with two recommenders.
- [ ] Re-adding the same title by the same contributor does not create a duplicate.
- [ ] Score 0–100% (steps of 5) with a tooltip (word + number); untouched = null; explicit 0% stored as 0; "Clear score" returns to null; out-of-range values are rejected server-side. The slider is keyboard- and screen-reader-operable.
- [ ] The card shows the friends' average ring with the rater count; the detail sheet shows Friends and TMDB rings separately; no TMDB logo, color scheme or wording in the score UI.
- [ ] Owner receives an email and an in-app unread count per submission.
- [ ] Friend rail: ring for unseen submissions; per-friend count badge; All = sum; opening a friend's view clears that friend's ring and badge and reduces All by exactly that count; tapping an avatar filters, tapping again clears.
- [ ] Each card shows the one-line quote rules of §6.2; status tabs show counts; the To watch count equals the default list.
- [ ] After submit, the guest sees a receipt of exactly what they sent and nothing from other contributors.
- [ ] Cards render instantly with skeleton fields; enrichment fills year, genre, language, rating, platform without blocking submit.
- [ ] **No guest can read or write any table or call any RPC directly; every new table has RLS enabled with no `anon` policy; all guest access goes through `/api/ask/*` routes after Ask-token validation.**
- [ ] **Rate limits and the abuse control are active on every `/api/ask/*` route; a threat-model test set passes (token enumeration, replay of another guest's cookie, oversized submissions, flooding).**
- [ ] **YouTube search for a guest works through the server key; repeated identical queries are served from cache; when the global or per-contributor budget is exhausted the UI shows the "paste a link" message and TMDB search still works.**
- [ ] **No YouTube title/description/creator name is persisted beyond 30 days without a refresh; the inbox stores video ids only.**
- [ ] **Sign-in and signup request only openid/email/profile; the existing YouTube import still works via the incremental connect path.**
- [ ] Language: first render with `Accept-Language: fr-FR,en;q=0.5` shows French; `de-DE` shows English; `th` shows Thai; `en,fr;q=0.9` shows English; a saved choice always wins; no code path uses IP for language.
- [ ] Language: switching updates all UI strings instantly, persists, and changes the TMDB `language` parameter in search and enrichment calls (verified from request logs).
- [ ] Language: the language list comes from the single config; CI fails if a tag is missing from TMDB `primary_translations` or a UI key is missing in any of en/fr/es/th; TMDB text missing in the selected language falls back to English, then the original title, never empty.
- [ ] Language: owner prompt/note and friend comments display as written; Thai renders with a Thai font; no clipped text at 360 px width in any language.
- [ ] Settings shows all groups of §6.9 and each works; Sign out ends the session on this device and deletes no data.
- [ ] **Delete account requires the checkbox and a fresh Google re-auth; afterwards the auth user, `users` row, inbox data, recommendations sent and received, Library data (nodes, folders, edges, grants, ratings) and stored files are gone; the Ask link returns "no longer active"; sent recommendations vanish from other inboxes; items the user added to others' shared folders are removed per the plan's rule; a confirmation email is sent; running it twice is harmless.**
- [ ] Guest "Delete my data" removes the `contributors` row and all their submissions and recommendations immediately.
- [ ] `/delete-account` is public, names the app/developer, and its email path creates a `deletion_requests` row; Privacy policy and Terms are reachable from Settings and the landing footer.
- [ ] TMDB and JustWatch attribution (official logos + wording) on the Credits screen.
- [ ] Foundations: no hard-coded hex colors or user-visible strings outside token and message files; dark OS mode renders dark on first paint with no light flash.

### P1 acceptance additions
- [ ] The owner can save a note and up to 5 genres; the landing shows them read-only; a 6th genre is blocked.
- [ ] "Want to see {owner}'s picks?" is absent when the owner has no visible picks; `contributors` and `public` tiers work as specified; the public link is read-only and revocable.
- [ ] **Promote creates a Library card in the chosen (nested) folder atomically; the inbox card shows "In library"; promoting twice is idempotent.**
- [ ] **A Library folder shared with a friend or group at `contribute`: an item added by any member appears for all members (intended); Ask-link guests never gain access to any folder.**
- [ ] Theme and primary color can be changed in Settings and the landing sheet, apply instantly, persist (device for guests, profile for signed-in; upgraded guests keep choices); default Orange; every preset passes the contrast check in both themes.
- [ ] After the owner changes language, new enrichment stores localized text and existing items are re-enriched in the background.
- [ ] A guest claiming with Google (including a Google account that already exists in LIKED) keeps all past submissions attributed.

## 14. Decisions (veto any)

| # | Decision | Alternative |
|---|---|---|
| D1 | Owner picks use visibility tiers private / contributors / public; account holders can additionally receive folders through engine sharing | Per-friend sharing of inbox entries |
| D2 | Friend rating 0–100% slider, steps of 5 | 1–5 stars; steps of 1 |
| D3 | Friend flow requires a name only; guests get an initials avatar | Optional photo for guests |
| D4 | One Ask link per owner | Multiple links |
| D5 | Friend rail single-select | Multi-select |
| D6 | Notifications = email + in-app badge | Web push first |
| D7 | Only TMDB, IMDb-resolved and YouTube items | Free-text items resolved by LLM |
| D8 | Light and dark theme in v1, default System | Light only |
| D9 | Sort inside the filters sheet | Sort on the list toolbar |
| D10 | After-submit is one screen | Separate screens |
| D11 | Owner taste = free text + fixed genre list, max 5 | Free-form tags |
| D12 | Friend avatars show ring + unseen count; All = sum | Count only, or ring only |
| D13 | Primary color: 6 presets, Orange default, + Custom with auto-contrast; per viewer | Presets only; owner-branded friend pages |
| D14 | Languages EN/FR/ES/TH, switcher and translations in P0 | Switcher in P1 |
| D15 | Score UI: percent ring + tick slider with tooltip + Clear, own visuals and wording | Copy TMDB's look |
| D16 | Tokens + i18n foundations in P0; theme/color UI in P1 | All in P0 |
| D17 | Default language: saved → browser → English; never IP | IP-based default |
| D18 | One language config tied to TMDB tags; we translate only UI | Own content translations |
| D19 | Account deletion immediate and irreversible behind checkbox + fresh Google re-auth | 14-day grace |
| D20 | Deleting a contributor deletes their recommendations | Keep anonymized |
| D21 | Settings and Preferences are one screen | Separate screens |
| D22 | Apple sign-in and store-only features (Report, comment filter) in P3, mandatory before iOS release | Build in P0 |
| **D23** | **Hybrid: dedicated inbox tables + the existing engine reused for the Library, sharing, groups, permissions; shared folders are collaborative by design; promote bridge** | Everything through folders; fully standalone tables |
| **D24** | **Guests are server-mediated (cookie + `contributors`), not Supabase anonymous auth** | Supabase anonymous sign-in + `linkIdentity` |
| **D25** | **Sign-in with basic scopes only; YouTube via incremental connect** | Keep `youtube.readonly` at sign-in |
| **D26** | **YouTube search in P0 with server key, cache, budgets; paste-link stays primary** | Paste-link only until quota is raised |
| **D27** | **`items` table (movie/series/video/channel), item separate from media; YouTube stores ids only** | `titles` hard-wired to movies |
| **D28** | **Store release (iOS first) after the web MVP, driven by the share-sheet; Share Extension is the native feature** | Web/PWA only |
| **D29** | **TMDB posters hotlinked from image.tmdb.org, never copied** | Internal poster copy in the `thumbnails` bucket |
| **D30** | **Preferences in a new `user_prefs` table; `users` not extended** | Extend `public.users` with preference columns |
| **D31** | **Guest retention: contributors inactive 18 months with no claim are purged (P1)** | Keep guest data indefinitely |

## 15. Requirement traceability

| Requirement | Section |
|---|---|
| Ask link, friends search TMDB / YouTube and add | 5.1, 5.2, 9.4 |
| Optional rating, platform, comments; submit | 5.3, 5.4 |
| Offered to see the owner's picks | 5.5, 6.6 |
| Further participation requires Google sign-in | 5.5, 9.2, 9.3 |
| Owner notified; one merged list; merge rules | 6.5, 6.7 |
| Auto-added platform, rating, date, language, genre | 7 |
| Filter by platform/date/language; friend rail | 6.3, 6.4 |
| Rating 0–100% in the TMDB pattern (no infringement) | 5.3, 6.5, D2, D15 |
| Unseen count per friend and on All | 6.3, 13 |
| Owner taste: free text + genres | 6.1, 5.1, D11 |
| Language switcher in P0 (FR/EN/ES/TH); default language; TMDB sync | 6.8, 9.7, 9.9, D14, D17, D18 |
| Orange default; theme and primary color | 6.8, 9.8, D8, D13 |
| Settings, sign out, delete account, store requirements | 6.9, 10.2, 10.3 |
| Apps in the stores, iOS share sheet | 10.3, 12, D28 |
| YouTube search in v1 | 5.2, 9.4, D26 |
| Leverage visibility, groups, permissions, nested folders | 6.6, 8, D23 |
| Shared folders among friends | 6.6, 13 (P1) |
| Future "any like" with YouTube media | 3, 8 (`items`), 12, D27 |

## 16. Sources

- Supabase auth (anonymous sign-ins, for reference only; not used): https://supabase.com/docs/guides/auth/auth-anonymous
- TMDB watch providers: https://developer.themoviedb.org/reference/tv-season-watch-providers
- TMDB primary translations: https://developer.themoviedb.org/reference/configuration-primary-translations
- TMDB API terms: https://themoviedb.org/api-terms-of-use
- YouTube quota and compliance audits: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- YouTube developer policies guide (30-day deletion, no quota sharding): https://developers.google.com/youtube/terms/developer-policies-guide
- YouTube derived-metrics / 30-day refresh: https://developers.google.com/youtube/terms/derived-metrics-policy
- Web Share Target not supported in iOS Safari: https://bugs.webkit.org/show_bug.cgi?id=194593
- Android PWA share target / Web Share: https://web.dev/web-share
- WCAG 2.1 contrast: https://www.w3.org/TR/WCAG21/#contrast-minimum
- Apple App Store Review Guidelines (1.2, 4.2, 4.8, 5.1.1): https://developer.apple.com/app-store/review/guidelines/
- Google Play account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- W3C language negotiation: https://www.w3.org/International/questions/qa-when-lang-neg.en.html
- Repo `lama010101/LIKED`: `docs/V2-INV-001-REPORT.md`, `docs/PLAN-REC-001.md`, `docs/PORTFOLIO-AUDIT-001-REPORT.md`, `docs/05_MVP2_PLAN.md`, branch `devin/plan-v2-001-r1` (`docs/PLAN-V2-001.md`)
