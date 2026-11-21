# LIKED v2 — Recommendation Inbox

**Version:** 2.0
**Status:** APPROVED by Lolo — 2026-11-20
**Date:** 2026-11-20
**Authority:** This document supersedes `01_PRD.md` (v27.2) for ALL product scope and UI. Legacy tables, code and docs are not deleted by this document; cleanup is a separate task.

---

## 1. One-line product

A personal inbox for "what should I watch?". Friends open a link, recommend titles in under 30 seconds with no account, and the owner sees everything merged, enriched (where to watch, rating, year, language, genre) and filterable by friend.

## 2. Problem and the one risk that matters

Recommendations arrive by WhatsApp, Instagram and in person. They get lost, duplicated, and never say where the title can be watched.

**Why a friend would use a link instead of texting "watch Severance":** no signup, poster search (no typos, no ambiguity), three taps, and the reward of seeing the owner's own picks. If the friend flow takes longer than typing a text message, the product fails. Every friend-side decision is judged against that.

## 3. Scope lock

### In scope (v1)
Ask link, friend submission (guest), owner inbox, merge, enrichment, friend rail, filters, notifications, owner's picks (visibility tiers), guest → Google upgrade.

### Explicit non-goals (v1)
Folders, groups, drag-and-drop, user-managed tags, multiple view modes, infinite canvas, chat, semantic/AI search, YouTube liked-video import, browser extension, follow/feed model, per-friend sharing, content other than movies / series / documentaries / YouTube videos & channels (no books, music, podcasts, arbitrary links), multi-dimension ratings, translations tables, blended/composite scores.

**Rule:** anything not described in §5–§9 requires a written PRD amendment before any task is issued.

## 4. Actors

| Actor | Auth | Notes |
|---|---|---|
| **Owner** | Google sign-in (required) | Has an Ask link, an inbox, optional picks |
| **Contributor (guest)** | Anonymous session, display name only | No email, no Google, no password |
| **Contributor (upgraded)** | Google | Same user row as the guest; history preserved |

Any user can be an Owner. A contributor who signs in with Google gets their own Ask link by default. Multi-tenant from day one; there is no separate "owner app".

## 5. Friend flow — `/r/{token}`

| # | Screen | Behavior |
|---|---|---|
| 5.1 | **Landing** | Owner name + avatar + owner's prompt (default: "What's the last movie, show or documentary you recommend?"). One field: *your name* (required, ≥2 chars, asked once, remembered). One button: **Start**. No sign-in wall. |
| 5.2 | **Add** | One search box. Results: TMDB movies + series (multi-search) with poster, year, type. Tap = added to a "Your picks" tray. Can add many. **Paste a link** also works: YouTube video/channel URL, IMDb URL, TMDB URL (resolved deterministically to an id). YouTube *search* is secondary (see §9 quota); paste-link is the primary YouTube path. |
| 5.3 | **Details (optional, collapsed)** | Per added item: rating 1–5 stars · "Where did you watch it?" (free text + chips of common platforms) · comment (≤280 chars). Never required. |
| 5.4 | **Submit** | **Send to {owner}** enabled with ≥1 item. One submission = one batch. |
| 5.5 | **After submit** | "Sent. Want to see {owner}'s picks?" Yes → read-only list of owner picks with visibility `contributors` or `public`. No → skip. **If the owner has no visible picks, skip this question entirely** (no empty state). |
| 5.6 | **Participate further** | CTA: "Make your own list and ask your friends" → Sign in with Google. Guest identity is *upgraded in place* (their past submissions stay attached). Secondary action: "Add more". |

Rules:
- Same title added twice by the same contributor to the same owner = one recommendation (latest values win).
- Caps: 20 titles per submission; 100 titles per day per contributor.
- A returning visitor on the same browser sees what they already sent and can add more. Edit/remove own recommendations is P1.
- Contributors never see each other or each other's recommendations.

## 6. Owner flow

### 6.1 Setup
Google sign-in → Ask link created automatically. Owner can edit the prompt text, copy/share the link (native share sheet on mobile), and disable or regenerate it. One link per owner in v1.

### 6.2 Inbox ("To watch")
**One list.** Cards, not a table. Card shows: poster · title · year · type chip (Movie / Series / Documentary / YouTube) · friend avatar stack (up to 3 + "+N") · average friend rating if any · platform logos available in the owner's region (max 2).

**Detail sheet** (tap card): overview · runtime · original language · genres · TMDB rating · availability list (flatrate / rent / buy, with link) · one row per recommending friend: avatar, name, their rating, their platform, their comment, date · actions: **Watched**, **Not interested**, **Open** (platform / YouTube).

**Status:** `To watch` (default) · `Watched` · `Not interested`. Inbox shows `To watch` by default; a status switch shows the others. Without this the list grows forever and becomes useless.

**Sort:** Recently recommended (default) · Most recommended · Friend rating · Release date · TMDB rating.

### 6.3 Friend rail (Instagram-style, top bar)
- First item: **All**. Then one avatar per contributor, ordered by most recent submission.
- **Ring** on an avatar = that friend has submissions the owner has not opened yet.
- Tap avatar = filter inbox to that friend's recommendations. Tap again = clear. **Single-select** in v1.
- Opening a friend's filtered view marks their submissions as seen (ring disappears).

### 6.4 Filters (one sheet)
Platform (in owner's region; includes "YouTube") · Type · Release year (decade chips) · Original language · Genre · "Recommended by 2+ friends". Active filters shown as removable chips; one "Clear all". Within one category = OR; across categories = AND. Friend rail selection ANDs with filters.

### 6.5 Merge rules
- Canonical identity of a title = `(source, kind, external_id)`, e.g. `(tmdb, movie, 603)`, `(youtube, video, dQw4…)`.
- Same canonical title from N friends = **one card**, N recommendation rows.
- Ratings: show **friend average (n)** and each friend's own rating in detail. TMDB public rating shown separately. **Never blended** into one number.
- A TMDB title and a YouTube upload of the "same" documentary are **not** merged in v1.
- Comments are never merged; each stays attributed to its friend.

### 6.6 Owner's picks (P1)
Owner can add titles he recommends (same search UI), with optional rating and comment. Each pick has visibility: `private` (default) · `contributors` (anyone who has submitted to him) · `public` (anyone with the link). Suggested bridge: marking something *Watched* offers "Add to my picks".

### 6.7 Notifications
- One notification per **submission** (not per title): "{Friend} recommended N titles."
- v1 channels: in-app unread count + email (owner setting on/off). Web push is P2 (on iOS it requires installing the PWA).

## 7. Enrichment

Enrichment runs **asynchronously at write time**, never in the read path, and **never blocks submission**. Cards render immediately with skeleton fields and fill in as enrichment completes (`enrichment_status`: pending → partial → complete | failed).

| Field | Source | Notes |
|---|---|---|
| Title, poster, overview, runtime | TMDB details / YouTube `videos.list` | Poster stored internally (no hotlinking) |
| Release date | TMDB / YouTube `publishedAt` | |
| Original language | TMDB `original_language` / YouTube `defaultAudioLanguage` | May be null on YouTube → LLM fallback |
| Genres | TMDB genres / YouTube category | Genres serve as the "tags" in v1 |
| Documentary flag | TMDB genre "Documentary" | Drives the Type chip |
| Public rating | TMDB `vote_average` + votes | Displayed separately from friend ratings |
| Where to watch | TMDB watch providers (JustWatch data), per region | Cached per (title, region), refresh TTL 7 days |
| Trailer link | TMDB videos / YouTube | Link out only |

**LLM role (narrow):** only fills gaps APIs cannot (e.g. missing language/genre/keywords on a YouTube item). It is a last resort, runs in the enrichment worker only, and its output is stored, never computed at read time. Expected: TMDB titles need no LLM at all.

**Region:** owner has a `region_code` (set at onboarding, editable). Availability is shown for that region only. "Not available in {region}" is an explicit state, not an empty one.

**Attribution (mandatory):** credits screen states the app uses TMDB and is not endorsed by TMDB; availability data is credited to JustWatch. TMDB terms require a written agreement for commercial use — fine for a portfolio project, a blocker if monetized.

## 8. Data model (proposed — minimal; subject to repo investigation before any task)

| Table | Key fields |
|---|---|
| `profiles` | id (= auth user id), display_name, avatar_key, region_code, email (null for guests), notify_email |
| `asks` | id, owner_id, token (unguessable, unique), prompt, is_active |
| `titles` | id, source, kind, external_id **UNIQUE(source, kind, external_id)**, name, release_date, original_language, genres, is_documentary, overview, runtime_min, poster_key, tmdb_rating, tmdb_votes, enrichment_status, enriched_at |
| `title_availability` | title_id, region_code, provider_id, provider_name, logo, offer_type, link, fetched_at |
| `submissions` | id, ask_id, contributor_id, created_at, seen_by_owner_at |
| `recommendations` | id, owner_id, title_id, contributor_id, submission_id, rating (1–5, null), platform_text, comment, created_at, updated_at **UNIQUE(owner_id, title_id, contributor_id)** |
| `owner_title_state` | owner_id, title_id, status (to_watch / watched / dismissed), updated_at |
| `picks` (P1) | owner_id, title_id, visibility, rating, comment |
| `notifications` | per existing pattern |

**Direction (not yet verified against the repo):** build these as new tables. The legacy `nodes / edges / causes` model is not extended: it is per-owner cards with UNIQUE(url, owner), which cannot express "one title, many recommenders" without bending it.

**Write path:** guests never write tables directly. Submission goes through one `SECURITY DEFINER` RPC that validates the Ask token, enforces caps, upserts `titles`, inserts `submissions` + `recommendations`, creates the notification, and enqueues enrichment — one atomic transaction (consistent with the existing "multi-insert via RPC" rule).

## 9. Technical constraints (verified 2026-11-20)

1. **Guest identity = Supabase anonymous sign-in**, upgraded with `linkIdentity({provider:'google'})`. Requires manual linking enabled. Anonymous users have the `authenticated` role, so RLS must check the `is_anonymous` claim. CAPTCHA on anonymous sign-in is strongly recommended (use it; the link is public). Anonymous sessions are lost on cleared browsing data or another device.
2. **Known edge case:** if the friend's Google account already exists in LIKED, linking fails. Required handling: sign in to the existing account and run a `claim_guest_submissions` RPC to re-attribute the guest's recommendations.
3. **Google OAuth consent screen must be In Production with non-sensitive scopes only (openid, email, profile) for the friend-upgrade flow.** In Testing mode only listed test users can sign in, so every real friend would be blocked. YouTube scopes must NOT be requested at login (incremental consent later, if ever).
4. **YouTube quota:** `search.list` costs 100 units against a 10,000/day default → about 100 searches per day across ALL users. `videos.list` costs 1. Hence paste-link is the primary YouTube path; YouTube search is capped, cached, and degrades gracefully.
5. **TMDB:** watch-provider data requires JustWatch attribution; attribution lives in an About/Credits screen.
6. **Unverified risk:** JustWatch/TMDB provider coverage for the owner's region (Thailand). Must be spot-checked on ≥20 known titles before "filter by platform" is promised as a headline feature.

## 10. Abuse and privacy

- Ask token: ≥12 random chars; owner can disable/regenerate; regenerating invalidates the old link.
- Per-IP and per-session rate limits on anonymous sign-in and on submission.
- Owner can remove a contributor (deletes their recommendations) or block them. Contributor merge ("same person, two devices") is P2.
- Contributor names are self-declared and not verified; the owner can see they are unverified (guests have an initials avatar, upgraded users show their Google-derived avatar stored internally).
- No contributor ever sees another contributor's data.

## 11. Success metrics (hypotheses, to be calibrated)

| Metric | Target |
|---|---|
| Guests who tap Start and send ≥1 title | ≥ 60% |
| Median time Start → Send | ≤ 45 s |
| Titles fully enriched within 60 s | ≥ 90% |
| TMDB titles showing a platform or an explicit "not available in region" | ≥ 95% |
| Guest → Google upgrade rate | tracked, no target |

## 12. Phases

| Phase | Content |
|---|---|
| **P0 — Core loop** | Anonymous guest flow, TMDB search + paste-link, submit RPC, owner inbox, merge, enrichment (TMDB + providers), email notification, friend rail with rings |
| **P1 — Depth** | Filters, status (watched / dismissed), picks + visibility tiers + post-submit "see my picks", YouTube enrichment, edit/remove own recommendations, guest → Google upgrade + own Ask link |
| **P2 — Polish** | Web push, contributor merge, LLM gap-filling, YouTube search, owner stats |

## 13. P0 acceptance criteria

- [ ] A guest with no account can open `/r/{token}`, enter a name, add ≥1 TMDB title, and submit.
- [ ] Submission is one atomic RPC; rollback leaves no partial rows.
- [ ] Two friends recommending the same TMDB title produce ONE card with two recommenders.
- [ ] Re-adding the same title by the same friend does not create a duplicate.
- [ ] Owner receives an email and an in-app unread count per submission.
- [ ] Friend rail shows contributors; ring appears for unseen submissions and clears when opened.
- [ ] Tapping an avatar filters the inbox; tapping again clears.
- [ ] Card renders instantly with skeleton fields; enrichment fills year, genre, language, rating, platform without blocking submit.
- [ ] No guest can read any table directly; RLS verified for the `is_anonymous` claim.
- [ ] CAPTCHA and rate limits active on anonymous sign-in.
- [ ] TMDB and JustWatch attribution present on a Credits screen.

## 14. Decisions taken in this draft (veto any)

| # | Decision | Alternative |
|---|---|---|
| D1 | Owner's picks use 3 visibility tiers (private / contributors / public); **no per-friend sharing in v1** | Per-friend sharing (needs identified recipients; guests are not reliably identifiable) |
| D2 | Friend rating = 1–5 stars, whole stars | 0–10 with half steps (legacy) |
| D3 | Friend flow requires a name only; guests get an initials avatar | Optional photo upload for guests |
| D4 | One Ask link per owner | Multiple links with different prompts (e.g. "documentaries only") |
| D5 | Friend rail is single-select | Multi-select (OR) |
| D6 | v1 notifications = email + in-app badge | Web push first |
| D7 | Only TMDB, IMDb-resolved, and YouTube items | Free-text "other" items resolved by LLM |

## 15. Requirement traceability (from Lolo's brief)

| Requirement | Section |
|---|---|
| Link asking friends to recommend latest movie/show/documentary | 5.1 |
| Friends search TMDB / YouTube and add | 5.2 |
| Add one or more | 5.2 |
| Optional rating, platform, comments | 5.3 |
| Submit | 5.4 |
| Offered to see my recommendations (shared or public) | 5.5, 6.6 |
| Further participation requires Google sign-in | 5.6, 9.1 |
| Owner notified | 6.7 |
| One list of everything | 6.2 |
| Common recommendations and ratings merged | 6.5 |
| Friend name/avatar and comments per recommendation | 6.2 |
| Auto-added platform, rating, release date, language, genre, tags | 7 |
| Filter by platform, date, language | 6.4 |
| Filter by friend via avatar rail (IG style) | 6.3 |

## 16. Sources

- Supabase anonymous sign-ins and identity linking: https://supabase.com/docs/guides/auth/auth-anonymous
- TMDB watch providers (JustWatch attribution): https://developer.themoviedb.org/reference/tv-season-watch-providers
- TMDB API terms: https://themoviedb.org/api-terms-of-use
- YouTube Data API quota costs: https://developers.google.com/youtube/v3/determine_quota_cost
