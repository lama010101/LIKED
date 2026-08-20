# LIKED — PRD Amendment: YouTube Activity Management

**Version: 1.0**
**Status: DRAFT — NOT YET MERGED INTO 01_PRD.md**
**Adds: new §41 to the Unified PRD**
**Depends on:** zero-error TypeScript baseline (blocking gate, see `00_PROGRESS.md`) before any implementation task is opened.

---

## 0. Why this is a separate document

This is **net-new scope**, not an extension of the existing YouTube support in the PRD. Today, "YouTube" in LIKED means: a user pastes a `youtube.com` URL, it becomes a node, it gets embedded/played (§14, P8-T01/T03). That is unrelated to this feature.

This amendment covers **reading and writing a user's actual YouTube account activity** (their Likes playlist, their Subscriptions) via the YouTube Data API v3, with the ability to act on that data from inside LIKED (unlike a video, unsubscribe from a channel) — a two-way integration with a real external account, not a card the user pasted in.

This is not merged into `01_PRD.md` yet. It stays a standalone draft until you approve scope, and specifically the auth model in §41.4, which has real security and cost implications.

---

## 41. YOUTUBE ACTIVITY MANAGEMENT

### 41.1 Goal

Let a user connect their YouTube account to LIKED and, from inside LIKED:
- See their liked videos and channel subscriptions
- Unlike a video / unsubscribe from a channel, with the action reflected back on YouTube itself (real API write, not local-only)
- (Stretch, not v1) Like a video / subscribe to a channel from inside LIKED

This is **account activity management**, not content import. A liked YouTube video does **not** automatically become a LIKED node/card unless the user explicitly saves it (existing P8 flow). The two systems are related but distinct — do not conflate "YouTube Likes" with "LIKED cards" anywhere in schema, UI copy, or code. This is the single most important non-negotiable in this document; violating it corrupts both data models.

### 41.2 Non-goals (v1)

- No import of liked videos as LIKED nodes (may become a later opt-in action, e.g. "Save to LIKED" button next to a YouTube Like row — but that's an explicit user action per item, not automatic sync)
- No YouTube playlists management beyond the implicit "Liked videos" playlist
- No YouTube comments, watch history, or watch-later management
- No multi-account support (one YouTube connection per LIKED user in v1)
- No background/scheduled sync — data is fetched on-demand when the user opens the YouTube activity view (poll-on-view, not push)

### 41.3 Why this is architecturally distinct from the rest of LIKED

LIKED's core invariant is: **visibility = edge existence**. YouTube Likes/Subscriptions are **not LIKED nodes** and must never enter the `nodes`/`edges`/`causes` model. They are external account state, fetched live or cached read-through from the YouTube Data API, scoped strictly to the connected user — never shared, never subject to the edge visibility system. Treat this as a bounded, isolated subsystem with its own tables and its own API surface. Do not let Cascade touch `lib/db/visibility.ts`, `nodes`, `edges`, or `causes` for any part of this feature.

### 41.4 Auth model — DECISION REQUIRED BEFORE ANY BUILD PROMPT

Two options. Neither should be built until you explicitly pick one — this determines the OAuth consent screen, the Google Cloud project setup (which is a manual step only you or an admin can do — Google requires a verified OAuth consent screen with scope justification, which cannot be automated by Cascade), and quota costs.

| | **Option A — Extend Supabase Auth Google provider** | **Option B — Standalone "Connect YouTube" OAuth flow** |
|---|---|---|
| How | Add YouTube scopes to the existing Supabase Google sign-in | Separate Google Cloud OAuth 2.0 client, independent of Supabase Auth, own token table |
| Works for | Only users who log into LIKED via Google | Every user, regardless of login method (email, Google, etc.) |
| Token refresh | Delegated to Supabase's provider token handling — scope creep on an existing login flow is not well-documented behavior and needs verification before relying on it | You own the refresh cycle explicitly (server-side, `youtube_connections` table with `refresh_token`, `access_token`, `expires_at`) |
| Isolation | YouTube scope grant is entangled with the user's core login credential | Fully isolated — revoking YouTube access never touches login |
| Setup cost | Lower — reuses existing provider config | Higher — new Google Cloud OAuth client, consent screen, redirect URIs |
| Risk if LIKED auth changes later | YouTube access could break as a side effect of unrelated auth work | No coupling |

**Recommendation: Option B.** It's more setup, but the isolation is worth it for a feature that writes to a user's real Google account — you don't want a future Supabase Auth change silently breaking or (worse) silently retaining YouTube write access after a user thinks they've disconnected. Confirm before I write the build prompt for this.

**Manual step that cannot be delegated to Cascade** (flagging per your "no manual steps back to Lolo" rule — this is the one unavoidable exception, it requires a human with Google Cloud Console access, not code):
- Create/configure the Google Cloud project, enable YouTube Data API v3, configure OAuth consent screen with scopes `https://www.googleapis.com/auth/youtube` (read/write) or the narrower `youtube.force-ssl`, register redirect URI. Cascade can generate exact click-by-click instructions and the redirect handler code, but cannot click through Google's console itself.

### 41.5 Data model (additive only — no changes to existing tables)

```sql
-- New table: one row per user who has connected YouTube
create table youtube_connections (
  user_id uuid primary key references users(id) on delete cascade,
  google_account_email text not null,
  access_token text not null,           -- encrypted at rest, see 41.9
  refresh_token text not null,          -- encrypted at rest
  token_expires_at timestamptz not null,
  scopes text[] not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  revoked_at timestamptz                -- soft-disconnect marker
);

-- No caching table in v1: fetch-on-view keeps this simple and avoids
-- a second source of truth going stale. Revisit only if quota/latency
-- becomes a real problem post-launch.
```

Explicitly **not** touching: `nodes`, `edges`, `causes`, `ratings`, `tags`, `tag_edges`. If any Cascade-generated migration references those tables in service of this feature, reject it.

### 41.6 API surface (server-side only — never expose tokens to the client)

- `GET /api/youtube/status` — is this user connected? returns `{connected, email, connectedAt}` only, never tokens
- `POST /api/youtube/connect` — initiates OAuth flow, redirects to Google consent
- `GET /api/youtube/callback` — OAuth redirect handler, exchanges code for tokens, upserts `youtube_connections`
- `POST /api/youtube/disconnect` — revokes token with Google (`https://oauth2.googleapis.com/revoke`) AND sets `revoked_at`, deletes stored tokens. Both must happen — revoking only locally leaves a live Google grant the user believes is gone.
- `GET /api/youtube/likes` — server fetches from `videos?myRating=like` (paginated), returns to client. No local persistence beyond in-memory request scope.
- `DELETE /api/youtube/likes/:videoId` — server calls `videos.rate` with `rating=none`, i.e. the real "unlike" write
- `GET /api/youtube/subscriptions` — server fetches `subscriptions?mine=true` (paginated)
- `DELETE /api/youtube/subscriptions/:subscriptionId` — server calls `subscriptions.delete`, i.e. real unsubscribe

Token refresh: every server route that calls the YouTube API must check `token_expires_at`, refresh via the stored `refresh_token` if expired, and persist the new `access_token`/`token_expires_at` before proceeding. This logic lives in one shared helper (`lib/youtube/client.ts`), never duplicated per-route.

### 41.7 UI surface

- **Settings**: new row "YouTube" under Account section (existing settings sheet, §11.7 pattern) — shows connection status, connected email, "Disconnect" action if connected, "Connect YouTube" button if not.
- **New view**: "YouTube Activity" — reachable from settings or a dedicated nav entry (exact placement TBD with you once auth is settled — not blocking the spec).
  - Tab: **Liked videos** — list of video thumbnail + title + channel, each with an "Unlike" action (with confirm, since it's a real external write with no undo inside LIKED — YouTube itself may allow re-liking but LIKED should not promise reversibility)
  - Tab: **Subscriptions** — list of channel avatar + name + subscriber count, each with "Unsubscribe" action (same confirm pattern)
- Both lists paginate against the live API (YouTube API page size ~50 max per call); infinite scroll triggers next page fetch.
- Loading/error states: YouTube API quota errors (403 `quotaExceeded`) must show a clear "try again later" message, not a silent failure or generic error.

### 41.8 Rate limits & quota

YouTube Data API v3 has a default daily quota (10,000 units/project/day at time of writing — **verify current value**, Google changes this). Reads (`list`) cost 1 unit; writes (`rate`, `delete`) cost 50 units. With many active users, a naive per-view-load fetch will exhaust quota fast. v1 mitigation: rely on fetch-on-view (no background polling) and set a client-side minimum re-fetch interval per user session (e.g. don't re-fetch if the view was loaded <60s ago). If usage grows, revisit with actual caching — not before, since premature caching here just adds a second stale-data problem on top of a live-account-state feature.

### 41.9 Security requirements (non-negotiable)

- `access_token` and `refresh_token` in `youtube_connections` must be encrypted at rest (Supabase column-level encryption or application-level encryption before insert — pick one, document which, do not store plaintext)
- Tokens never sent to the client in any API response
- `youtube_connections` must be covered by RLS: a user can only read/write their own row, service-role only for the refresh helper
- Disconnect must call Google's revoke endpoint — a local-only delete is a false "disconnected" state and a real problem if surfaced to the user

### 41.10 Open questions for you before build prompts are written

1. Confirm Option A vs B (§41.4) — I recommend B.
2. Where does the "YouTube Activity" view live in nav — own top-level entry, or nested under settings/profile?
3. Should "Unlike"/"Unsubscribe" require a confirm dialog (recommended, since it's irreversible from LIKED's perspective) or be a direct swipe-action like existing card unshare?
4. Do you want a per-item "Save to LIKED" action on the Liked Videos list (turns a YouTube-liked video into an actual LIKED card via existing P8 flow) in v1, or defer entirely? Not required for "two-way management" as scoped, but cheap to add once the list UI exists.

### 41.11 LLM-based auto-categorization into cards and folders

**This directly contradicts §41.2's original non-goal ("no import of liked videos as LIKED nodes... automatic sync").** That non-goal is now superseded for this section only. Be clear-eyed about what you're adding: this turns the feature from "manage your YouTube account from LIKED" into "auto-populate my LIKED library from my YouTube account," which is a materially bigger scope with real failure modes (bad auto-categorization creates junk cards/folders a user then has to clean up manually). Flagging this because it's the kind of scope growth that historically causes the rework patterns in your memory notes — confirm this is actually what you want before I write build prompts, not after Cascade builds it.

**What "free LLM" actually means here — pick one, there is no option that is free at scale with zero setup:**

| | **Option 1 — Self-hosted local model (Ollama)** | **Option 2 — Free-tier hosted API** | **Option 3 — Anthropic/OpenAI API, pay-per-use** |
|---|---|---|---|
| Cost | Free (no per-call cost), but requires compute you provision and pay for (a VPS or dedicated box — Supabase Edge Functions cannot run Ollama, they're not general compute) | Free up to a rate/quota limit (e.g. Groq's free tier, Google AI Studio's Gemini free tier) then blocked or billed | Real cost per call, no free tier of consequence |
| Model quality | Depends on model size you can afford to host (e.g. Llama 3.1 8B is reasonable for classification tasks, runs on a modest GPU or even CPU slowly) | Varies by provider, often good (Gemini Flash, Llama via Groq) | Best available |
| Latency | Depends entirely on your hosting — slow on CPU, fine on GPU | Fast (proper infra) | Fast |
| Setup complexity | High — you provision and maintain a server, Cascade cannot do this (same class of manual step as the Google Cloud OAuth console work in §41.4) | Low — just an API key | Low — just an API key |
| Fits "free" requirement | Yes, genuinely free at the compute you already own/pay for | Yes, until you exceed quota | No |

**Recommendation:** Option 2 (a free-tier hosted API, e.g. Google Gemini Flash's free tier or Groq) for v1. It's the only "free" option that doesn't require you to stand up and maintain a server outside this stack, which is a real ongoing operational burden with no one but you to carry it (Cascade builds code, it doesn't run 24/7 infrastructure). If you specifically want data to never leave infrastructure you control, Option 1 is the honest answer, but say so explicitly — it's a different project shape (you become a systems admin for a model server, not just a product owner directing a coder).

**Scope of the task itself:**
- Input: a batch of a user's YouTube Liked videos (title, channel, description, category, tags from the YouTube API's `videos.list` response — already available from the read call in §41.6, no extra YouTube quota cost beyond what's already being fetched)
- Output: for each video, the LLM proposes (a) a card title (may just pass through YouTube's title), (b) 1–3 tag suggestions using the SAME deterministic tag pipeline as §19.3 in the core PRD — the LLM proposes tag *labels*, but tag creation/reuse still goes through `createOrGetTag()`, never a new ad-hoc path, (c) a suggested folder — either an existing user folder (LLM is given the user's current folder names as context) or a new folder name if nothing fits
- **This is a suggestion pass, not an auto-write.** The result is a review screen — user sees proposed card+tags+folder per video, can edit or discard before anything is written to `nodes`/`tags`/`folders`. Silently writing dozens of unreviewed cards into a user's library is exactly the kind of scope Cascade tends to over-execute without ground-truth checks; the review step is not optional.
- Batch size: cap per-run batch (e.g. 20 videos) to keep LLM cost/latency and review-screen length sane, not the full Likes history at once
- This never touches the write path described in §41.6 (Unlike/Unsubscribe) — those are separate concerns wired to different buttons

**New table (additive):**
```sql
create table youtube_import_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  youtube_video_id text not null,
  suggested_title text not null,
  suggested_tags text[] not null,
  suggested_folder_name text,          -- null = "no folder" suggestion
  status text not null default 'pending', -- pending | accepted | rejected
  created_at timestamptz not null default now(),
  unique(user_id, youtube_video_id)
);
```
Rows are ephemeral working state for the review screen — accepted rows drive real writes through the existing node-creation path (P2-T02/P8-T02 pattern: one atomic transaction per accepted card), then can be deleted or marked `accepted`; rejected rows can be deleted outright.

**Open questions for you before this gets a build prompt:**
1. Confirm Option 1 vs 2 vs 3 above (recommend 2).
2. If Option 2: which provider — Gemini, Groq, other? This determines the SDK/API shape Cascade codes against.
3. Confirm the review-before-write gate is what you want, not silent auto-write.
4. Does this run only for Liked videos, or also derive folder/card suggestions from Subscriptions (e.g. one folder per channel)? Not specified yet — assume Liked videos only unless you say otherwise.

### 41.12 Rollout sequencing (once TS baseline is clean and §41.4 is decided)

1. `INV-YT-01` — investigate current settings sheet structure + confirm no naming collisions with `youtube_connections`, `/api/youtube/*`
2. Google Cloud OAuth app setup (manual, you/admin)
3. `P-YT-01` — connect/disconnect flow + `youtube_connections` table + RLS
4. `P-YT-02` — Liked videos list (read) + Unlike (write)
5. `P-YT-03` — Subscriptions list (read) + Unsubscribe (write)
6. `P-YT-04` (optional, per §41.10 Q4) — Save-to-LIKED action from Liked Videos list
7. `P-YT-05` — LLM provider setup + `youtube_import_suggestions` table + suggestion-generation endpoint (§41.11)
8. `P-YT-06` — Review screen UI (accept/edit/reject per suggestion) + accepted-suggestion write path into `nodes`/`tags`/`folders`

Each becomes its own investigation + implementation prompt when we get there, per standing workflow. §41.11's items (7–8) are gated behind §41.10's items (3–6) being verified working — do not parallelize a bigger, riskier write-path feature on top of an unverified read/write integration.

---

*End of draft amendment. Not authoritative until merged into `01_PRD.md` with a version bump.*