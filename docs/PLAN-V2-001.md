# PLAN-V2-001 — PRD v2 (Recommendation Inbox) verification + P0 implementation plan

**Project:** LIKED · **Task ID:** PLAN-V2-001-R1 · **Date:** 2026-11-21
**Authority:** `docs/05_PRD_V2_RECOMMENDATION_INBOX.md` (v2.0, approved 2026-11-20; committed `4444833`). Supersedes `01_PRD.md` for v2 scope/UI. `PLAN-REC-001.md` superseded except TMDB-proxy/YouTube-key findings.
**Mode:** planning only. All DB evidence via read-only psql on prod (`aws-1-us-west-2.pooler`) or ROLLBACK-wrapped transactions. Next migration: **142** (live `supabase_migrations.schema_migrations` max = 141; 137 rows recorded — see §H reconciliation note).
**Legend:** VERIFIED = file:line / SQL output cited · UNVERIFIED = could not confirm · DESIGN = plan proposal.

---

## A. Auth facts

| Fact | Status | Evidence |
|---|---|---|
| Supabase anonymous sign-in enabled? | **UNVERIFIED — dashboard toggle** | No `supabase/config.toml` in repo (hosted project); no `signInAnonymously` call anywhere in code (grep: 0 hits). `auth.users.is_anonymous` column exists; live count: **0 anonymous / 12 total** auth users. Dashboard path: Project → Authentication → Sign In / Providers → "Anonymous sign-ins". Probe after enabling: `POST /auth/v1/signup` w/o credentials creates user — DO NOT probe (creates data); verify via dashboard only. |
| Manual identity linking? | **UNVERIFIED — dashboard toggle** | Needed only for P1 `linkIdentity({provider:'google'})` upgrade (PRD §9.1). Dashboard: Authentication → Sign In / Providers → "Manual Linking". Not needed for P0 (guests never upgrade in P0). |
| CAPTCHA configured? | **UNVERIFIED — not configured** | Zero `captcha`/`turnstile`/`hcaptcha` hits in repo. Required for P0 (PRD §13: "CAPTCHA and rate limits active on anonymous sign-in"). |
| Supabase auth rate limits | VERIFIED (docs) | Anonymous sign-ins: **IP-based 30 req/hour default**, adjustable at dashboard Authentication → Rate Limits. Source: supabase.com/docs/guides/auth/auth-anonymous §"Abuse prevention and rate limits". |
| Google login scopes today | VERIFIED | `app/(auth)/login/page.tsx:35` and `app/(auth)/signup/page.tsx:23`: `signInWithOAuth({provider:"google", options:{scopes:"https://www.googleapis.com/auth/youtube.readonly", queryParams:{access_type:"offline",prompt:"consent"}}})`. Comment at `login/page.tsx:8`: "the Google OAuth grant is also the YouTube grant". |
| `/callback` persists YouTube tokens | VERIFIED | `app/(auth)/callback/route.ts:42-51` — `persistYouTubeConnectionFromSession({providerToken, providerRefreshToken, scope:null})` on every login. |
| Separate incremental YouTube connect | VERIFIED | `app/api/youtube/connect/route.ts:47-55` — own OAuth flow, `scope: youtube.readonly`, state cookie; callback `app/api/youtube/callback/route.ts` stores tokens+scopes into `youtube_connections` (mig 062 + 097 columns). This path already exists → removing the scope from login does NOT orphan YouTube connect. |
| youtube.readonly dependents | VERIFIED | `youtube_connections` table; routes `/api/youtube/{search,sync,connect,callback,disconnect,status,likes/[videoId],subscriptions/[subscriptionId]}`; `lib/youtube/{client,sync,persist-connection,runImport}`; `app/lib/actions/youtubeImport.ts:49` `importYouTubeActivity`; `AddSheet.tsx` youtube mode (`:67-197`) + `/api/youtube/connect` fallback (`:197`); `/youtube` page `YouTubeView.tsx`; `YouTubeSyncButton.tsx`; `vercel.json` cron `0 6 * * *` + `0 18 * * *` → `/api/youtube/sync`; `users.youtube_import_consent_at` + `set_youtube_import_consent` RPC (mig 130); e2e `youtube-{api,search,intelligent-import}.spec.ts`, `auth-smoke.spec.ts:82` |
| **What must change for openid/email/profile only** | DESIGN | (1) `login/page.tsx:35` + `signup/page.tsx:23`: delete `scopes:` line (Supabase then requests only default OIDC scopes). (2) `callback/route.ts:42-51`: gate `persistYouTubeConnectionFromSession` on granted scope containing `youtube.readonly` (session `provider_token` won't carry it → persist becomes no-op; safer: remove the call entirely and let `/api/youtube/connect` own YouTube onboarding — RECOMMENDED, single write path). (3) Google Cloud consent screen → Production, non-sensitive scopes only (owner task §K). (4) e2e `youtube-*.spec.ts` still pass (they assert not-connected 401s). YouTube import/search remain reachable via explicit connect — P1 decision whether to keep (§J). |

## B. Inventory (reuse vs legacy)

### B.1 PRD §8 name collisions — VERIFIED NONE

Live `pg_tables` (public, 39 tables): **none** of `profiles, asks, titles, title_availability, submissions, recommendations, owner_title_state, picks` exist, nor `enrichment_jobs`/`email_outbox`. `notifications` EXISTS — reused per PRD ("per existing pattern").

### B.2 `notifications` shape & type constraint — VERIFIED

`\d public.notifications`: `(id uuid PK, user_id→users, type text NOT NULL, payload jsonb, read bool, created_at)`; **no CHECK/enum on `type`** (only PK + FK constraints); RLS: select/update/delete own, **INSERT service_role only**; in `supabase_realtime` publication. Consumers of `type`: `NotificationsView.tsx:28-33` switch on `share_received|folder_share|permission_changed|item_added` (+default raw); `useRealtime.ts:80` notifications channel; `get_unread_notification_count` RPC; `app/lib/actions/notifications.ts`. **Adding `recommendation_received` needs zero schema change** — only a UI case + i18n key.

### B.3 `public.users` vs PRD `profiles` — DECISION: extend `users`

Evidence:
- `users` columns (live `\d`): `id, display_name NOT NULL, normalized_display_name UNIQUE NOT NULL, language_code, avatar_key, username_changed_at, avatar_change_count_today, avatar_last_reset_date, created_at, onboarding_imported_at, onboarding_dismissed_at, youtube_import_consent_at`. **No email column** (email lives on `auth.users`, merged in `getSessionUser` at `session.ts:44`).
- `ensure_user_profile` trigger (mig 112, `supabase/migrations/112_*.sql:201-240`): on `auth.users` INSERT creates `users(id=NEW.id, display_name=COALESCE(raw_user_meta_data->>'full_name'|'name', split_part(email,'@',1), 'user'), normalized_display_name=lower(trim(name)))` with unique-violation retry `||'_'||left(id,4)`.
- **FK blast radius**: `users.id` is referenced by 30+ FKs (nodes, edges, folders, friend_invites, groups, notifications, ratings, node_notes, card_positions→auth.users, causes, messages, etc. — full list in Appendix A.1). 17 public functions reference `users`; RLS `users_select_scoped` exposes rows only to self + edge-connected users.
- **Anonymous insert simulation** (ROLLBACK-wrapped, verbatim in Appendix A.2): two `auth.users` inserts with `is_anonymous=true`, no email/metadata → trigger created **two** `public.users` rows: `display_name='user'`, normalized `'user'` and `'user_2222'`. **Trigger does NOT break anonymous sign-in** — it produces placeholder names the friend flow overwrites (§C `set_guest_display_name`).
- Guest visibility to other users (V2c): VERIFIED guests cannot appear — `users_select_scoped` requires an `edges` row; guests have no edges; `getUserById`/`lib/db/users.ts` uses service client only for already-authorized lookups; no user-search/discovery surface exists (`/friends` uses `get_friend_bar` = accepted friends only; `friend_invites` targets emails, guests have none).
- **Decision: extend `public.users`** with `region_code TEXT`, `notify_email BOOLEAN`, `ask_prompt TEXT` (owner's custom prompt). Reject `profiles`: would fork identity (every feature keys `users.id`), double trigger work, and PRD §8 is explicitly "proposed — subject to repo investigation". Deviation flagged §C.

### B.4 Other inventory — keep/adapt/retire for P0

| Component | Verdict | Evidence |
|---|---|---|
| `proxy.ts` route protection | **ADAPT** | `proxy.ts:43` `isProtectedRoute` prefix list lacks `/r`,`/inbox` → `/r/[token]` already public; must ADD `/inbox`. Cannot distinguish anon vs permanent (only session presence, `:34-48`) — anon guard needs `user.is_anonymous` check (available on Supabase User object per docs). |
| `app/(app)/layout.tsx` | **ADAPT** | `:9-12` `getSessionUser()`→AppShell for ANY session incl. anonymous (guest gets `users` row 'user' → renders legacy chrome with empty feed). Needs `is_anonymous` redirect for legacy routes; `/r/` and `/inbox` live OUTSIDE `(app)` group with own layouts. |
| `getSessionUser`/session helpers | **KEEP** | `session.ts:16-47` — merges `auth.users.email` into SessionUser; returns null without `users` row. Anon users get a row via trigger → works unchanged. |
| `Avatar.tsx` | **KEEP/REUSE** | `app/(app)/_components/Avatar.tsx` — initials fallback already exists (`:26-28`), matches PRD D3 (guests get initials avatar). `avatarUrl()` passes through absolute http(s) keys (migration 134 social avatars). |
| `AppShell`/`FriendsRail`/`FolderRail`/`AddSheet`/`ItemMenu`/`ShareSheet` | **LEGACY — untouched in P0** | v2 inbox gets own chrome (§D/H). Legacy routes remain for existing users (PRD: legacy not deleted). |
| `notifications` + `NotificationsView` | **ADAPT** | add `recommendation_received` case + i18n; unread badge via existing `get_unread_notification_count` + realtime channel (already subscribed `useRealtime.ts:80`). |
| e2e specs | **ADAPT** | `auth-login/signup/smoke` assert Google button; add anon-flow specs; `youtube-*` unchanged (still valid). `navigation-unauth.spec.ts` asserts `/social`→`/login` — unaffected. |
| `useRealtime` | **KEEP + maybe extend** | channels: edges, notifications, ratings, users, nodes (`useRealtime.ts:60-120`). v2 needs `recommendations`/`submissions`? Owner inbox updates via notifications channel (already fires) + manual refresh — P0 can skip new channels (§V10). |
| `external_sources`/`external_items_map` | **REUSE candidate** | Both EMPTY (0 rows). Designed for external-ID→node mapping; v2 `titles(source,kind,external_id)` serves the same role for the new model — do NOT reuse (different granularity: per-title canonical vs per-node); note as available alternative rejected. |

## C. Data model — exact DDL proposals (NOT applied)

All new tables: `id uuid PK DEFAULT gen_random_uuid()`, `created_at timestamptz NOT NULL DEFAULT now()`, RLS enabled, grants to `authenticated`+`service_role` only (revoke `anon` — guests are `authenticated` anyway; `anon` role = no session, should get NOTHING — see §E remediation). Writes: RPC-only (no INSERT/UPDATE/DELETE policies for `authenticated` on user-data tables).

```sql
-- migration 142 (sketch)
ALTER TABLE public.users
  ADD COLUMN region_code TEXT NOT NULL DEFAULT 'TH',
  ADD COLUMN notify_email BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN ask_prompt TEXT;               -- NULL → PRD default prompt

CREATE TABLE public.asks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,        -- sha256 hex of raw token; raw shown once
  prompt       text NOT NULL DEFAULT 'What''s the last movie, show or documentary you recommend?',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  rotated_at   timestamptz
);
CREATE UNIQUE INDEX asks_one_active_per_owner ON public.asks (owner_id) WHERE is_active;

CREATE TABLE public.titles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL CHECK (source IN ('tmdb','youtube')),
  kind              text NOT NULL CHECK (kind IN ('movie','tv','video','channel')),
  external_id       text NOT NULL,
  name              text,                   -- NULL until enriched (skeleton card, PRD §13)
  release_date      date,
  original_language text,
  genres            text[],
  is_documentary    boolean NOT NULL DEFAULT false,
  overview          text,
  runtime_min       integer CHECK (runtime_min IS NULL OR runtime_min >= 0),
  poster_path       text,                   -- TMDB path OR storage key; see §F.1 deviation
  tmdb_rating       numeric(3,1),
  tmdb_votes        integer,
  trailer_url       text,
  watch_region      text,                   -- region availability was fetched for
  enrichment_status text NOT NULL DEFAULT 'pending'
                    CHECK (enrichment_status IN ('pending','partial','complete','failed')),
  enriched_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, kind, external_id)
);
CREATE INDEX titles_enrichment_pending ON public.titles (enrichment_status) WHERE enrichment_status IN ('pending','partial');

CREATE TABLE public.title_availability (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id      uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  region_code   text NOT NULL CHECK (region_code ~ '^[A-Z]{2}$'),
  provider_id   integer NOT NULL,
  provider_name text NOT NULL,
  logo_path     text,
  offer_type    text NOT NULL CHECK (offer_type IN ('flatrate','rent','buy')),
  link          text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title_id, region_code, provider_id, offer_type)
);
CREATE INDEX title_availability_lookup ON public.title_availability (title_id, region_code);

CREATE TABLE public.submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_id           uuid NOT NULL REFERENCES public.asks(id) ON DELETE CASCADE,
  contributor_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_batch_id  uuid,                    -- idempotency key from client
  title_count      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  seen_by_owner_at timestamptz,
  UNIQUE (contributor_id, client_batch_id)
);
CREATE INDEX submissions_owner_recent ON public.submissions (ask_id, created_at DESC);

CREATE TABLE public.recommendations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title_id       uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  submission_id  uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  rating         smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  platform_text  text,
  comment        text CHECK (comment IS NULL OR char_length(comment) <= 280),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, title_id, contributor_id)   -- PRD §8/§5 latest-wins
);
CREATE INDEX recommendations_inbox ON public.recommendations (owner_id, created_at DESC);
CREATE INDEX recommendations_contributor ON public.recommendations (contributor_id);

CREATE TABLE public.enrichment_jobs (              -- plan addition (PRD §7 requires enqueue, no name given)
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id    uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts    integer NOT NULL DEFAULT 0,
  run_after   timestamptz NOT NULL DEFAULT now(),
  locked_at   timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title_id)                               -- one active job per title
);
CREATE INDEX enrichment_jobs_due ON public.enrichment_jobs (run_after) WHERE status = 'pending';

CREATE TABLE public.email_outbox (                 -- plan addition (PRD §6.7/§7 email without blocking submit)
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  payload     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts    integer NOT NULL DEFAULT 0,
  send_after  timestamptz NOT NULL DEFAULT now(),
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_due ON public.email_outbox (send_after) WHERE status = 'pending';

-- P1 tables (DDL now optional; include picks + owner_title_state per PRD §8 but tag P1):
CREATE TABLE public.owner_title_state (
  owner_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title_id  uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  status    text NOT NULL DEFAULT 'to_watch' CHECK (status IN ('to_watch','watched','dismissed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, title_id)
);
CREATE TABLE public.picks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title_id    uuid NOT NULL REFERENCES public.titles(id) ON DELETE CASCADE,
  visibility  text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','contributors','public')),
  rating      smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  comment     text CHECK (comment IS NULL OR char_length(comment) <= 280),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, title_id)
);
```

**Deviations from PRD §8 (all flagged):**
1. `profiles` → **extend `public.users`** (§B.3) — add `region_code`, `notify_email`, `ask_prompt`. PRD's `profiles.email` → not stored (email is on `auth.users`; owner email read via `auth.getUser()` server-side; `notify_email` boolean = the on/off setting).
2. `asks.token` → **`token_hash`** (sha256) — raw token shown once at create/regenerate; lookup by hash = timing-safe (§V9).
3. `titles.poster_key` → **`poster_path`** — see §F.1 (hotlink vs store conflict).
4. Added `enrichment_jobs`, `email_outbox`, `client_batch_id`, `watch_region`, `owner_title_state`/`picks` included but **P1-phase**.
5. `recommendations.owner_id` denormalized (PRD has it) — kept for inbox query speed; always equals `asks.owner_id` of its submission (enforced in RPC).

**RLS summary:**

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `asks` | owner only (`owner_id=auth.uid()`) | RPC only — no direct policies |
| `titles` | `authenticated` (shared reference data — same class as `tags`; guests included, see §J decision) | RPC/service only |
| `title_availability` | `authenticated` | RPC/service only |
| `submissions` | owner (`EXISTS asks a: a.id=ask_id AND a.owner_id=auth.uid()`) OR contributor (`contributor_id=auth.uid()`) | RPC only |
| `recommendations` | owner OR contributor (own rows — powers "returning visitor sees what they sent") | RPC only |
| `owner_title_state`, `picks` | owner; picks P1 adds contributors/public tiers via RPC | RPC only |
| `enrichment_jobs`, `email_outbox` | **none** — service_role only | service_role only |

**Guest (`is_anonymous`) read rule (§13 "no guest can read any table directly"):** RECOMMENDED interpretation — user-data tables (`submissions`, `recommendations`, `asks`, `owner_title_state`, `picks`) get a RESTRICTIVE policy `(auth.jwt()->>'is_anonymous')::boolean IS NOT TRUE` on SELECT; guests read their own data exclusively through SECURITY DEFINER RPCs (`get_guest_submissions`, inbox RPCs are owner-only anyway since owners are non-anon). `titles`/`title_availability` stay `authenticated`-read (non-personal reference data; same exposure class as existing `tags`/`translations` USING(true) tables — VERIFIED readable by guest session in §E test). **Alternative stricter reading** (no table at all for guests, even titles) → all reads via RPC; cost = every search result render needs RPC. Flagged §J.

## D. RPC & endpoint contracts

### D.1 `submit_recommendations` — the single write RPC (P0)

```sql
submit_recommendations(
  p_ask_token      text,             -- raw token from /r/{token} URL
  p_client_batch_id uuid,            -- client-generated idempotency key
  p_items          jsonb             -- [{title_id uuid, rating int?, platform_text text?, comment text?}]
) RETURNS jsonb                      -- {submission_id, accepted, skipped, errors[]}
```

SECURITY DEFINER, `SET search_path = public`, owner postgres, `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated` (anon-role guests still pass — they hold `authenticated` role).

**Validation order (single transaction, any failure → whole rollback):**
1. `auth.uid() IS NULL` → `NOT_AUTHENTICATED`.
2. `jsonb_array_length(p_items)` = 0 → `EMPTY`; > 20 → `TOO_MANY_ITEMS` (PRD cap).
3. Token: `encode(digest(p_ask_token,'sha256'),'hex')` → `asks WHERE token_hash AND is_active` → miss → **`INVALID_ASK`** (identical error for bad/disabled/rotated token — no existence leak).
4. Contributor name: guest must have `users.display_name` set via `set_guest_display_name` first (called on landing Start); if still `'user'`/default → `NAME_REQUIRED`.
5. Daily cap: `count(recommendations WHERE contributor_id=auth.uid() AND created_at > now() - interval '24h') + new_items > 100` → `DAILY_CAP` (sliding 24h window — DESIGN choice vs calendar day; sliding is stricter & simpler).
6. Per item: `title_id` must exist in `titles` (FK + explicit check → `INVALID_TITLE`); `rating` NULL or 1–5; `comment` ≤280 (CHECK backstop); `platform_text` ≤100.
7. Upsert `recommendations` `ON CONFLICT (owner_id,title_id,contributor_id) DO UPDATE SET rating=EXCLUDED.rating, platform_text=EXCLUDED.platform_text, comment=EXCLUDED.comment, submission_id=EXCLUDED.submission_id, updated_at=now()` — **latest values win** (PRD §5). `owner_id` = ask.owner_id (NOT client-supplied — V11).
8. Insert `submissions` row (`client_batch_id` UNIQUE → double-tap returns existing `submission_id` via `ON CONFLICT DO NOTHING` + re-select = idempotent).
9. Insert `notifications` `(user_id=ask.owner_id, type='recommendation_received', payload={submission_id, contributor_name, count, ask_id})` — secdef owner bypasses the service_role-only INSERT policy (same mechanism as `share_node`, VERIFIED pattern `125_share_rpcs.sql:199`).
10. Insert `enrichment_jobs` `ON CONFLICT (title_id) DO NOTHING` for each distinct title (pending → worker picks up).
11. Insert `email_outbox` row if owner `notify_email` (payload = same notification payload).
12. Return `{submission_id, accepted, skipped, errors[]}`.

**Rollback test (§13 item 2):** e2e/vitest — call with 1 valid + 1 invalid title_id → assert zero rows in submissions/recommendations/notifications/enrichment_jobs/email_outbox for that batch (single tx ⇒ all-or-nothing).

### D.2 Other P0 RPCs/endpoints

| Name | Kind | Contract sketch |
|---|---|---|
| `get_ask_by_token(p_token text)` | secdef RPC | hash→lookup active ask → `{owner_display_name, owner_avatar_key, prompt, owner_has_picks}` — powers landing 5.1; invalid → `INVALID_ASK`. No owner_id exposed beyond display fields. |
| `set_guest_display_name(p_name text)` | secdef RPC | 2–50 chars, trim; upsert `users.display_name`/`normalized_display_name` for `auth.uid()` with `_<id4>` suffix on collision (mirrors trigger); rate-limit: once per 24h via `username_changed_at` reuse or dedicated counter — DESIGN: reuse pattern, allow re-set (name is self-declared). |
| `get_guest_submissions()` | secdef RPC | returns caller's own submissions+recommendations+title display fields (returning-visitor view 5.5/§5 rules). |
| `resolve_title` — NOT an RPC; **server route** `POST /api/r/resolve` | Next route | body `{source:'tmdb',kind:'movie'|'tv',external_id}` or `{url}` → server validates → calls TMDB/YouTube → upserts `titles` via service client → returns `{title_id, name, year, poster_path, kind}`. **Trust boundary (V11): all provider data written server-side only.** |
| `get_my_ask()` / `create_my_ask(p_prompt?)` / `rotate_my_ask()` / `set_ask_active(p_active)` | secdef RPCs | owner Ask-link management (§6.1): create on first Google login (or lazily), one active per owner (partial unique index), rotate = new token_hash + `rotated_at`, old token instantly invalid. `get_my_ask` returns raw token ONCE per rotation (store hash only — so return value = the URL; owner copies then). |
| `get_inbox(p_status, p_sort, p_friend_id, p_filters jsonb, p_cursor)` | secdef RPC | owner-only (`auth.uid()`=owner); merge: `recommendations r JOIN titles t` grouped by title → card rows {title fields, recommenders[], avg_rating, friend_count, latest_at}; sorts per §6.2; friend filter ANDs. Status filter P1 (table exists, UI P1) — P0 returns all `to_watch`. |
| `get_friend_rail()` | secdef RPC | contributors to owner's asks ordered by latest submission + `unseen` flag = `EXISTS submissions s WHERE s.ask_id IN (owner's asks) AND s.contributor_id=c AND s.seen_by_owner_at IS NULL` |
| `mark_submissions_seen(p_contributor_id)` | secdef RPC | sets `seen_by_owner_at=now()` on that contributor's unseen submissions to caller's asks (ring clears, §6.3). |
| `set_owner_title_state` / picks RPCs | P1 | deferred. |
| `claim_guest_submissions` | P1 outline (§D.3) | |

## E. Security model

### E.1 V3 RLS/grant audit (VERIFIED, live DB)

**Grants:** `anon` AND `authenticated` both hold full DML (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) on **all 39 public tables** — RLS is the only barrier (role_table_grants dump, Appendix A.3).

**Policy classes** (all 64 policies dumped, Appendix A.4):
- **(i) owner-scoped** (`x = auth.uid()` or EXISTS-owner checks): ~55 policies — guest sees only rows keyed to own (empty) identity.
- **(ii) scoped-by-relationship** (edges/folder/group membership): `users_select_scoped`, `edges_select_policy`, `nodes_select_visible`, `folders_select_accessible`, etc. — guests have no relationships → 0 rows.
- **(iii) `USING(true)`/broad authenticated SELECT**: `tags`, `tag_translations`, `translations`, `external_sources` (+ `folder_admins`/`group_admins` INSERT service_role only). Public reference data — low sensitivity.
- **Writes:** almost all writes already RPC-gated; notable direct-write policies a guest CAN use: `friend_invites` INSERT (`from_user_id=auth.uid()`) — **guest can spam friend invites by email** (MEDIUM risk, pre-existing for any authenticated user); `node_notes`/`card_positions`/`ratings`/`user_node_preferences`/`node_classifications` own-row writes (guest writes only self-rows — harmless but pointless); storage `thumbnails` INSERT (authenticated) — **guest can upload files** (MEDIUM, pre-existing).
- **Realtime publication** `supabase_realtime`: card_positions, edges, nodes, notifications, ratings, users — RLS-filtered per subscriber; guest receives only own-scope rows (none). No sensitive leak.
- **Storage:** bucket `thumbnails` public-read; INSERT authenticated (no folder check on insert — DELETE checks `foldername(name)[1]=auth.uid()`).

**SECURITY DEFINER IDOR audit:** 106 secdef functions; all `authenticated`-executable ones either carry the `Caller does not match user_id` guard (`p_user_id IS NOT DISTINCT FROM auth.uid()`, e.g. `get_feed` prosrc lines 3-10) or use `auth.uid()` as actor with object-id params + internal permission checks (`folder_is_accessible`, `group_is_member`, etc.). Only `ensure_user_profile` (trigger) and `rls_auto_enable` lack guards — neither is a callable IDOR surface. `update_display_name`/`update_avatar_key` are service_role-only EXECUTE. **No arbitrary-p_user_id IDOR found.**

**Empirical guest test** (VERIFIED, ROLLBACK-wrapped — Appendix A.5): `SET LOCAL ROLE authenticated` + `request.jwt.claims={"sub":"3333…","role":"authenticated","is_anonymous":true}` → `auth.uid()`=fake id, role=authenticated; counts: users 0, nodes 0, notifications 0, friend_invites 0, edges 0, youtube_connections 0, folders 0; **tags 1245, tag_translations 1245, translations 1494 readable**; external_sources 0.

**Remediation plan (v2 tables + optional hardening):**
1. v2 user-data tables: RESTRICTIVE `is_anonymous` SELECT policies + RPC-only guest reads (§C) — satisfies §13 literally.
2. NEW v2 tables: `REVOKE ALL ON <t> FROM anon` (anon role shouldn't reach anything; authenticated covers guests).
3. OPTIONAL P0-hardening (recommend, small): `REVOKE INSERT ON friend_invites FROM authenticated` is NOT possible (app may use direct insert? — invite_friend RPC exists; direct policy suggests legacy path — flag as separate cleanup task, do NOT change in P0 scope).
4. Guest-write surfaces (friend_invites, storage thumbnails, own-row tables): acceptable for P0 — guests can only create self-scoped junk; CAPTCHA + anon rate limit (30/hr/IP) bound abuse. Document as accepted risk §I.

### E.2 Proxy/route guard (V4)

- `/r/[token]` → `app/r/[token]/page.tsx` top-level (NOT under `(app)` — avoids AppShell/layout). proxy.ts: not in `isProtectedRoute` → public for session-less AND guest sessions ✓ (no matcher change needed; matcher already covers all non-static paths).
- `/inbox` → `app/inbox/` top-level owner surface; **must add `"/inbox"` to `proxy.ts:43` isProtectedRoute** (else public!). Own minimal layout (top bar + rail per §6.3) — does NOT reuse AppShell (legacy chrome).
- **Anon-vs-legacy guard (DESIGN):** in `proxy.ts`, after `getUser()`: `if (user?.is_anonymous && isProtectedRoute) → redirect('/r')` (generic "use your invite link" page) — prevents guests browsing empty legacy UI and poking friend_invites/storage. Defense-in-depth: `(app)/layout.tsx` also checks `is_anonymous` → redirect. `is_anonymous` is on the Supabase `User` object (docs-verified `session.user.is_anonymous`). Owner (Google) users are never anonymous → zero impact on existing users.
- Guest mid-flow routes (`/r/*`, `/api/r/*`) exempt from the anon redirect.

### E.3 Abuse controls (V9)

- **Anonymous sign-in:** Supabase IP rate limit 30/hr (dashboard default, VERIFIED docs) + Turnstile CAPTCHA (P0) — `signInAnonymously({options:{captchaToken}})`; `@marsidev/react-turnstile` `<Turnstile siteKey onSuccess>` → token state → pass to auth call; dashboard secret key (§K).
- **Submission RPC-level:** caps enforced in-tx (§D.1: 20/submission, 100/24h sliding per contributor). **Per-IP inside RPC: NOT possible** — browser calls `supabase.rpc` directly; RPC sees only `auth.uid()`, no IP. HONEST ANSWER: per-IP submission limiting must live in the Next.js layer — `/api/r/submit` route wrapper that rate-limits by `x-forwarded-for` (Vercel-set) BEFORE calling the RPC, or accept contributor-cap-only (a guest can mint new anon sessions to bypass — bounded by anon sign-in 30/hr/IP + CAPTCHA). RECOMMENDED: thin `/api/r/submit` server route does IP rate-limit (e.g. 10 submissions/hr/IP via `rate_limits` table or Upstash — DESIGN: simple DB table `rate_limits(key,text,window_start,count)` checked in route) then calls RPC with user JWT. Per-session limit = the 100/day contributor cap itself.
- **Ask token:** ≥12 chars — generate `base64url(randomBytes(24))` = 32 chars; store sha256 hash; rotate invalidates (old hash deleted); `get_ask_by_token` returns same `INVALID_ASK` for unknown/inactive/rotated — no oracle.

## F. Third parties & infrastructure

### F.1 TMDB (V6)

- **Existing TMDB code/env:** NONE — zero `tmdb` hits in app/lib/supabase; no `TMDB_*` env var (env names verified: SUPABASE_*, DATABASE_URL, GOOGLE_CLIENT_*, YOUTUBE_TOKEN_ENCRYPTION_KEY, NEXT_PUBLIC_APP_URL, ACCESS_TOKEN, SERVICE_ROLE_KEY, ANON_KEY, OPENROUTER_API_KEY); `next.config.ts:43-58` `images.remotePatterns` = supabase storage + i.ytimg.com + yt3.ggpht.com (**no image.tmdb.org**).
- **Search route (DESIGN):** `GET /api/r/search?q=` — server-side `fetch https://api.themoviedb.org/3/search/multi?query=…&include_adult=false&language=en` with `Authorization: Bearer ${TMDB_API_READ_ACCESS_TOKEN}` (v4 read token, server-only env); filter `media_type IN ('movie','tv')`; return `{id,media_type,title,name,release_date/first_air_date,poster_path,vote_average,vote_count,genre_ids,overview}`. Rate limit: per-IP in route (same `rate_limits` table); cache identical queries 5 min in-memory (route-level Map — DESIGN; or `search_cache` table — keep simple: no persistent cache v1, TMDB allows reasonable use).
- **Deterministic URL resolution (DESIGN, quota-verified):**
  - `themoviedb.org/(movie|tv)/{id}` → direct, 0 API calls.
  - `imdb.com/title/tt\d+` → TMDB `GET /3/find/{imdb_id}?external_source=imdb_id` → 1 call, returns movie+tv candidates (take first).
  - YouTube `watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/` → videoId regex, 0 calls to parse.
  - YouTube `/channel/UC…` → `channels.list?part=snippet&id=` = **1 unit**; `/@handle` → `channels.list?part=snippet&forHandle=` = **1 unit**; `/user/` → `forUsername=` = 1 unit; `/c/` custom URLs → **not resolvable via API** → return `UNSUPPORTED_URL` (flag §J — could scrape oEmbed later).
  - `videos.list` = 1 unit, `channels.list` = 1 unit, `search.list` = 100 units (PRD §9.4 VERIFIED-consistent).
- **Poster conflict — RESOLVED as PRD AMENDMENT (§J.1):** PRD §7 says "Poster stored internally (no hotlinking)" + `poster_key`; TMDB terms cap caching "any information" at **6 months** and prohibit using TMDB "as an image hosting service". Downloading posters to Supabase storage = caching TMDB Content → would need 6-month refresh/purge machinery. **Recommended:** store `poster_path` (the TMDB path string — metadata, refreshed by enrichment) and render via `https://image.tmdb.org/t/p/w342{poster_path}` hotlink — no copy cached, compliant with attribution rules; requires `image.tmdb.org` in `next.config` remotePatterns + CSP `img-src`. YouTube thumbnails (`i.ytimg.com`) already allowed. Flag as PRD amendment (§J.1) — alternative (internal storage + 6-month TTL purge job) documented but not recommended.
- **6-month cache vs persistent `titles`:** TMDB *metadata* (name, overview, etc.) cached >6mo is prohibited → enrichment refresh job re-fetches titles where `enriched_at < now()-interval '5 months'` (safety margin) — sweeper task (§H V2-P0-11 or P1). `title_availability` TTL 7d per PRD — `max(fetched_at)` per (title_id,region_code) staleness check at inbox-read enrichment kick. `recommendations`/`submissions` are OUR data (guest ratings/comments) — not TMDB Content, exempt.
- **Thailand coverage spot-check (§9.6):** no TMDB key in env → **cannot run now** → becomes task V2-P0-02 (owner provides `TMDB_API_READ_ACCESS_TOKEN` first). Method: `GET /3/movie/{id}/watch/providers` + `/3/tv/{id}/watch/providers` for 20 well-known titles, check `results.TH` non-empty; script in repo `scripts/tmdb-th-check.mjs` (read-only).
- **Attribution:** Credits screen (P0 task) — TMDB logo + "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." + JustWatch credit for availability data (PRD §7 mandatory). TMDB terms fetched verbatim in prior session: 6-month cache cap, no derivatives, no ML/AI training, commercial use needs written agreement (portfolio = non-commercial, flag §I).

### F.2 CAPTCHA — Turnstile recommended

Turnstile (Cloudflare): free, invisible/managed modes (no checkbox friction — better for <30s friend flow), React package `@marsidev/react-turnstile`, `onSuccess`→`captchaToken`→`signInAnonymously({options:{captchaToken}})`. hCaptcha alternative: `@hcaptcha/react-hcaptcha`, more friction. Dashboard: Auth → Protection → Enable CAPTCHA → provider + Secret key; Turnstile widget needs domain allowlist (localhost for dev). **Recommend Turnstile.**

### F.3 Email notifications (V8)

- **Existing infra: NONE** — no resend/nodemailer/sendgrid/postmark deps (package.json verified); Supabase SMTP not configured in repo (dashboard setting, UNVERIFIED).
- **PRD AMENDMENT REQUIRED (§J.2):** provider choice. **Recommend Resend** — simple HTTPS API (`POST /emails`), free tier 3k/mo, `RESEND_API_KEY` env, verified sender domain needed (owner action). Alternative: Supabase built-in email SMTP (owner's Gmail app-password etc.) — more setup, worse deliverability; or owner-email-only via `notify_email`→mailto? No — recommend Resend.
- **Without blocking submit:** `email_outbox` row inserted in submit tx; sender = `after()` kick + `/api/enrich/sweep`-style cron drain (same worker pattern as enrichment); retries attempts≤5 backoff.
- Owner `notify_email` flag lives on `users.notify_email` (§C); owner email address = `auth.users.email` read server-side via `supabase.auth.getUser()` in the drain route (service client can also read auth.users via admin API — DESIGN: drain route uses service client `auth.admin.getUserById(owner_id)` → email).

### F.4 Enrichment execution (V7)

- **Inventory:** `vercel.json` crons = 2 daily `/api/youtube/sync` (Hobby-compatible); `supabase/functions/extract-node-metadata` Edge Function exists (Deno, rate-limited 30/user/min — precedent for edge workers but no scheduler); **pg_cron & pg_net NOT installed** (pg_extension: pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp — VERIFIED); `OPENROUTER_API_KEY` exists (LLM fallback, P2).
- **Vercel plan limits (VERIFIED docs, checked 2026-10):** Hobby = cron **once/day max, ±59min precision**; Pro = once/minute. LIKED plan UNVERIFIED (portfolio → likely Hobby). **Cron alone cannot meet ≥90%-in-60s** even on Pro.
- **Options:** (A) `enrichment_jobs` queue + `after()` kick in submit server action + opportunistic kicks (inbox load, next submit) + cron sweeper if Pro; (B) Supabase Edge Function worker invoked by Next route (extra hop, Deno secrets); (C) pg_cron+pg_net — unavailable; (D) client-side polling kick — fragile.
- **RECOMMEND A:** `enrichment_jobs` table (§C) + shared `lib/enrich/processJobs(limit)` worker; kicks: `after()` in `/api/r/submit` + `/api/enrich/process` POST route (service-auth) + Vercel cron `/api/enrich/sweep` `*/1 * * * *` **only if Pro** (Hobby → rely on after()+opportunistic; document degraded mode). Concurrency: `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` claim pattern; retry `attempts++`, `run_after = now() + (2^attempts)min`, max 5 → `failed`; idempotent (upserts by UNIQUE keys); `enrichment_status` transitions pending→partial (TMDB fields done)→complete (+availability) | failed.
- **TMDB watch-provider caching:** per (title_id, region_code) — `title_availability.fetched_at`; refresh when `now()-max(fetched_at) > 7 days` (PRD TTL); region from `asks.owner region` → actually owner's `users.region_code` — availability fetched for the SUBMITTING ask's owner region (multi-owner titles may need per-region rows — `title_availability` keyed by region handles this; job payload carries region).

## G. PRD §13 → task mapping

| # | Acceptance item | Delivering task(s) | Verification |
|---|---|---|---|
| 1 | Guest opens /r/{token}, name, ≥1 TMDB title, submit | V2-P0-04,05,06,07 | e2e Playwright anon session |
| 2 | Atomic RPC, rollback no partial rows | V2-P0-03,07 | vitest + SQL rollback probe |
| 3 | Two friends same title → ONE card | V2-P0-03,09 | SQL: 2 recs 1 title group; e2e |
| 4 | Re-add same title no dup | V2-P0-03 | SQL UNIQUE upsert test |
| 5 | Owner email + in-app unread per submission | V2-P0-03,11 | notifications row + outbox row asserts |
| 6 | Rail + ring + clears on open | V2-P0-10 | e2e 2-session |
| 7 | Avatar tap filters, tap again clears | V2-P0-10 | e2e |
| 8 | Skeleton card, async enrichment | V2-P0-08,09 | e2e timing + enrichment_status flips |
| 9 | No guest table reads; is_anonymous RLS | V2-P0-02,15 | ROLLBACK SQL probe (Appendix A.5 pattern) as CI script |
| 10 | CAPTCHA + rate limits on anon sign-in | V2-P0-01(owner),04 | dashboard verify + e2e captchaToken path |
| 11 | TMDB+JustWatch attribution on Credits | V2-P0-12 | e2e credits page text assert |

## H. P0 TASK BREAKDOWN (ordered; first two mandated by task)

Migration application: repo migrations are raw `.sql` files applied via psql/MCP `apply_migration`; `supabase_migrations.schema_migrations` has 137 rows vs ~141 files — **088–097 partially absent (raw-pg bypass)** → each migration task MUST insert its own `schema_migrations` row AND the plan flags reconciliation as owner cleanup (§I). Migration tasks require verbatim `pg_proc`/`pg_policies`/`information_schema` output in acceptance; `tsc --noEmit`=0 gate for all code tasks.

| ID | Title | Goal/Scope | Depends | Acceptance (binary) | Verify | Size | Think | Parallel? |
|---|---|---|---|---|---|---|---|---|
| V2-P0-01 | **Remove YouTube scope from login/signup** (mandated first) | `login/page.tsx:35`, `signup/page.tsx:23` drop `scopes:`; `callback/route.ts:42-51` remove/gate `persistYouTubeConnectionFromSession`; keep `/api/youtube/connect` as sole YouTube onboarding; update comments | — | `grep -c youtube.readonly app/(auth)/**` = 0 in login/signup/callback; tsc 0; Google sign-in completes w/o youtube scope (manual prod check); `/youtube` connect flow still works | grep + tsc + manual OAuth | S | low | yes (isolated files) |
| V2-P0-02 | **Thailand watch-provider spot-check** (mandated second) | `scripts/tmdb-th-check.mjs`: 20 known titles → `/3/{movie,tv}/{id}/watch/providers` → report `results.TH` coverage; needs `TMDB_API_READ_ACCESS_TOKEN` | V2-P0-00(owner key) | script runs; coverage % reported; ≥95% target assessed; NO key printed | script output | S | low | yes |
| V2-P0-03 | Migration 142: v2 tables + RLS + users columns | all §C DDL + policies + grants/revokes + `schema_migrations` row | — | verbatim `\d` each table; `pg_policies` shows owner/RLS/restrictive-is_anonymous; `information_schema.role_table_grants` shows no `anon`; UNIQUEs exist | psql output | M | medium | yes (DDL only) |
| V2-P0-04 | Migration 143: v2 RPCs | `get_ask_by_token`, `set_guest_display_name`, `get_guest_submissions`, ask CRUD (`get_my_ask`,`create_my_ask`,`rotate_my_ask`,`set_ask_active`), `submit_recommendations`, `get_inbox`, `get_friend_rail`, `mark_submissions_seen` + grants | V2-P0-03 | verbatim `pg_proc` args+proacl per function; `prosrc` contains `SET search_path`/guard; EXECUTE revoked PUBLIC/anon granted authenticated; rollback probe returns zero rows | psql + vitest RPC-shape | L | high | no (depends 03) |
| V2-P0-05 | Guest auth + `/r/[token]` landing | `app/r/[token]/` route; `signInAnonymously`+Turnstile; name capture→`set_guest_display_name`; `get_ask_by_token` render owner name/avatar/prompt; `proxy.ts` anon-guard for legacy routes; `(app)/layout` is_anonymous redirect | V2-P0-00(dashboard anon+captcha), V2-P0-04 | e2e: fresh context → /r/{token} → name → Start → session JWT `is_anonymous=true`; legacy /feed redirects anon→/r | e2e + manual | M | medium | partial (UI) |
| V2-P0-06 | `/api/r/resolve` + `/api/r/search` routes | TMDB multi-search proxy; paste-link resolve (TMDB/IMDb/YouTube video+channel forms); `titles` upsert server-side; IP rate-limit table check | V2-P0-00(TMDB+YT keys), V2-P0-03 | route tests: valid tmdb url→title_id; imdb→resolved; yt watch→video; bad→4xx; key never in client bundle (grep) | vitest route tests | M | medium | yes |
| V2-P0-07 | Friend add UI + submit wiring | `/r/[token]` add screen: search box, tray, details (rating/platform/comment≤280), submit→`/api/r/submit`→RPC; after-submit screen (+picks skip per §5.5); "make your own list" CTA stub→Google sign-in (P1 upgrade — P0 shows CTA→/login) | V2-P0-05,06,04 | e2e full guest flow lands submission; DB rows verified | e2e + SQL | M | medium | no |
| V2-P0-08 | Enrichment worker | `lib/enrich/processJobs` (TMDB details+providers per region, YouTube videos.list/channels.list via API key); `enrichment_jobs` claim SKIP LOCKED; `/api/enrich/process` + `/api/enrich/sweep`; `after()` kick in submit; statuses+retry | V2-P0-03,00(keys) | job flips pending→partial→complete; failed path retries≤5; ≥90% <60s measured on 20-title batch | vitest + timed e2e | L | high | no |
| V2-P0-09 | Owner inbox UI | `app/inbox/` + proxy protected-route add; card list (poster/title/year/type chip/avatar stack/avg rating/platforms≤2); detail sheet; skeleton states; sorts (recent/default + others per §6.2); status filter = P1 (show all) | V2-P0-04,08 | e2e owner sees merged card w/ 2 recommenders; skeleton→filled; sorts work | e2e | L | medium | partial |
| V2-P0-10 | Friend rail + rings + filters(P0 subset) | rail avatars ordered recent + unseen ring; tap filter single-select AND clear; `mark_submissions_seen`; P0 filters = platform/type minimal per §6.4 (full filter sheet may slip to P1 — flag) | V2-P0-04,09 | e2e ring appears/clears; filter ANDs | e2e | M | medium | partial |
| V2-P0-11 | Email outbox + notify setting | `lib/email` Resend sender; drain in sweep; `users.notify_email` toggle in owner settings; `auth.admin.getUserById` for address | V2-P0-00(RESEND key),03,07 | outbox row→sent; owner toggle off→no row | vitest + manual send | S | low | yes |
| V2-P0-12 | Credits/attribution screen | `/inbox/credits` or footer link: TMDB logo+disclaimer, JustWatch credit, app logo more prominent | — | e2e asserts exact disclaimer text present | e2e | S | low | yes |
| V2-P0-13 | RLS/is_anonymous verification script | `scripts/verify-v2-rls.mjs`: ROLLBACK-wrapped anon-claim probes per §E.1 tables → assert counts/denials; run in CI | V2-P0-03,04 | script exits 0; output shows guest reads 0 user-rows, titles readable | script | S | low | yes |
| V2-P0-14 | e2e suite for v2 | specs: guest submit, merge, rail, inbox render, anon-blocked-from-legacy, invalid token | all above | `npm run e2e` v2 specs green | CI | M | medium | no |
| V2-P0-15 | Docs + progress + reconciliation note | `00_PROGRESS.md` row; document schema_migrations 088–097 gap for owner | all | file committed | review | S | low | yes |

**Owner-only prereqs (§K detail below) gate V2-P0-01/02/05/06/08/11.**

## I. CONFLICTS & RISKS REGISTER

| # | Conflict/Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Anonymous sign-in vs `ensure_user_profile` trigger | LOW (VERIFIED non-breaking) | Simulation: 2 anon inserts → 2 users rows 'user'/'user_2222' — works; name overwritten by `set_guest_display_name`. |
| R2 | Guests pass session-only proxy into legacy routes | MEDIUM | proxy+layout `is_anonymous` redirect (§E.2); legacy UI would otherwise render empty-but-functional (friend_invites INSERT, storage upload exposure). |
| R3 | Broad `authenticated` RLS + `USING(true)` tables expose reference data to guests | LOW | tags/translations already public-class; v2 user-data tables get restrictive is_anonymous policies; verification script V2-P0-13. |
| R4 | Poster storage vs TMDB 6-month cache terms | HIGH→resolved via amendment | Hotlink `image.tmdb.org` + store `poster_path` only (§F.1); PRD §7 text amended (§J.1). |
| R5 | YouTube scope at login vs PRD §9.3 | HIGH | V2-P0-01 removes scope; connect flow already separate; consent screen must go Production+non-sensitive (§K). |
| R6 | Google consent screen in Testing mode blocks real friends | BLOCKER (P1 upgrade flow) | Owner must publish consent screen (§K); P0 guests unaffected (no Google). |
| R7 | Dashboard toggles unverifiable from repo | MEDIUM | All marked UNVERIFIED; §K lists exact click paths + post-enable probes. |
| R8 | TMDB commercial-use terms | MEDIUM | Portfolio/non-commercial OK; monetization = written agreement required (PRD §7 acknowledges). |
| R9 | Thailand provider coverage unverified | HIGH (feature promise) | V2-P0-02 spot-check ≥20 titles BEFORE filter-by-platform ships; fallback: show "availability unavailable in region" state. |
| R10 | YouTube quota (search.list=100 units) | MEDIUM | Paste-link primary (videos.list=1); search capped/cached/degraded per PRD §9.4; P2 anyway. |
| R11 | Global `titles` poisoning by malicious guest | HIGH→mitigated | V11: clients submit only `title_id` minted server-side by `/api/r/resolve`; all display fields server-fetched; guests can't write titles directly (RPC/service only). Residual: guest submits valid title_ids only — harmless. |
| R12 | `schema_migrations` 088–097 gap (raw-pg bypass) | MEDIUM | Reconciliation task §H note + V2-P0-15; each new migration self-records; owner decides backfill. |
| R13 | `friend_invites`/storage write exposure to guests | MEDIUM (pre-existing) | Accepted P0; CAPTCHA+rate limits bound; separate cleanup task flagged (not v2 scope). |
| R14 | Vercel plan unknown → cron granularity | MEDIUM | Verify plan (§K); if Hobby, enrichment relies on after()+opportunistic kicks (degraded but functional); document. |
| R15 | `is_anonymous` claim name in RLS | LOW | Docs-verified `auth.jwt()->>'is_anonymous'`; restrictive-policy pattern from docs. |
| R16 | Email provider absent | HIGH→amendment | §J.2 Resend recommendation; without it §13 item 5 partially fails (in-app badge still works). |

## J. PRD AMENDMENTS REQUIRED & OWNER DECISIONS

1. **Poster storage:** PRD §7 "Poster stored internally (no hotlinking)" conflicts with TMDB 6-month cache cap → **amend to: store `poster_path`, hotlink `image.tmdb.org`, attribution on Credits.** Recommended default: YES amend.
2. **Email provider:** none exists → **amend §6.7 to name Resend (or chosen provider) + `RESEND_API_KEY`.** Recommended: Resend.
3. **Guest read scope:** §13 "no guest can read any table directly" — strictest reading blocks `titles` reads too → **recommended default: user-data tables RPC-only for guests; `titles`/`title_availability` readable (shared reference data).** Confirm.
4. **Contributor name storage:** PRD §8 `profiles.display_name` — we store on `users.display_name` (extended users, not profiles). Guests' names are self-declared, visible to owner — **confirm acceptable** (alternative: separate `contributor_names` table — not recommended, forks identity).
5. **YouTube connect post-scope-removal:** keep `/api/youtube/connect` incremental flow for legacy YouTube import features (P1 decision whether v2 YouTube items need user OAuth at all — paste-link uses API key, no user scope). Recommended: keep connect for legacy; v2 YouTube = API key only.
6. **Inbox route placement:** `/inbox` top-level vs replacing `/feed` — recommended `/inbox` (legacy coexists per PRD "not deleted"). Confirm product wants two surfaces during transition.
7. **Filters P0 scope:** §12 puts filters in P1 but §13 doesn't list them — **recommended: ship platform/type minimal filters in P0, full sheet P1.** Confirm.
8. **Vercel plan:** if Hobby, sub-minute cron impossible → enrichment degrades to after()+opportunistic. Owner confirm plan or accept.
9. **`region_code` default:** `users.region_code` default 'TH' (owner base) — confirm or set at onboarding (PRD says set at onboarding, editable — P0: default TH + editable in settings).
10. **Commercial use:** TMDB terms — portfolio OK; if LIKED ever monetizes → written TMDB agreement needed. Acknowledge.

## K. OWNER-ONLY PREREQUISITES (exact click paths)

| # | Action | Click path | Phase | Post-verify probe |
|---|---|---|---|---|
| K1 | Enable anonymous sign-ins | Supabase Dashboard → project `lzkzfqshnjvlzosnntfx` → Authentication → Sign In / Providers → Anonymous Sign-ins → Enable | **P0-blocking** | Dashboard shows enabled; no side-effect probe (creating a user is a write — verify via dashboard only) |
| K2 | CAPTCHA: Turnstile widget + secret | Cloudflare dash → Turnstile → Add widget (hostname liked-zeta.vercel.app + localhost) → copy Sitekey+Secret → Supabase → Authentication → Protection → Enable CAPTCHA protection → Turnstile → paste Secret → Save | **P0-blocking** | `signInAnonymously` without token → error (would create attempt — verify via dashboard + e2e with token) |
| K3 | Manual linking | Supabase → Authentication → Sign In / Providers → Manual Linking → enable | **P1** (guest→Google upgrade) | dashboard only |
| K4 | Auth rate limits | Supabase → Authentication → Rate Limits → confirm anonymous sign-in limit (default 30/hr) | P0 (verify only) | dashboard |
| K5 | Google OAuth consent screen → **In Production**, scopes = openid/email/profile ONLY | Google Cloud Console → APIs & Services → OAuth consent screen → Publish app; Credentials → OAuth client → ensure no youtube scope in login flow (code change V2-P0-01) | **P0-blocking for owner login cleanliness; P1-blocking for friend upgrade** | real Google account sign-in test |
| K6 | TMDB API Read Access Token | themoviedb.org → Settings → API → copy "API Read Access Token" (v4) | **P0-blocking** (V2-P0-02/06/08) | `curl /3/configuration` with Bearer → 200 (read-only, no key printed) |
| K7 | YouTube Data API key | Google Cloud Console → APIs → YouTube Data API v3 → Credentials → API key (server-side only) | **P0-blocking** (paste-link resolve) | `videos.list?part=id&id=dQw4w9WgXcQ&key=` → 1 item (read-only) |
| K8 | Resend API key + verified domain | resend.com → API Keys → create; Domains → verify liked-zeta.vercel.app sender | **P0-blocking for email** (§J.2) | send test email to owner |
| K9 | Vercel env vars | Vercel → liked project → Settings → Environment Variables: `TMDB_API_READ_ACCESS_TOKEN`, `YOUTUBE_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (+ `TURNSTILE_SECRET_KEY` if server-verified — Supabase holds secret; sitekey is public) | P0 | deploy + route smoke |
| K10 | Vercel plan check | Vercel → team `lolos-projects-dc7e07be` → Billing/plan | P0 (cron granularity decision §J.8) | dashboard |
| K11 | `schema_migrations` 088–097 reconciliation decision | owner reviews gap list (V2-P0-15 output) | P1 cleanup | — |

## Appendix — verbatim evidence

### A.1 `users` FK referents (live `\d public.users` "Referenced by")
activity_log, blocks(×2), categorization_suggestions, causes, direct_chats(×2), edges(×2), folder_admins(×2), folder_edges, folder_grants(×2), folder_ratings, folders, friend_invites(×2), group_admins(×2), group_members, group_messages, groups, messages, node_classifications, node_messages, node_notes, nodes(×2), notifications, organize_batches, ratings, user_node_preferences (+ card_positions→auth.users).

### A.2 Anonymous insert simulation (ROLLBACK — no persisted write)
```sql
BEGIN;
INSERT INTO auth.users (id,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('11111111-…','authenticated','authenticated',true,'{}','{}',now(),now()),
       ('22222222-…','authenticated','authenticated',true,'{}','{}',now(),now());
SELECT id,display_name,normalized_display_name FROM public.users WHERE id IN ('11111111-…','22222222-…');
ROLLBACK;
-- output:
-- INSERT 0 2
--  11111111-… | user | user
--  22222222-… | user | user_2222
```

### A.3 Grants (verbatim summary)
`information_schema.role_table_grants`: grantees `anon` + `authenticated` on all 39 public tables, each with `SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER` (full DML). No table-level grant differentiation.

### A.4 Policies (64 rows — classes)
i) owner-scoped `= auth.uid()`: activity_log, blocks, card_positions, categorization_suggestions, causes(created_by), direct_chats, folder_admins(scoped), folder_grants, folder_ratings, friend_invites(from/to), group_*, node_classifications, node_notes, notifications, organize_*, user_node_preferences, users_select_scoped, youtube_connections.
ii) relationship-scoped: edges, folder_edges/folder_tree/folders, messages, node_messages, nodes/nodes_sort_cache/external_items_map/tag_edges/ratings (via edges+blocks), groups/group_members/group_nodes/group_messages.
iii) `USING(true)` SELECT: external_sources, tag_translations, tags, translations.
Writes direct-to-table allowed for authenticated: friend_invites INSERT, node_notes, card_positions, ratings(own), user_node_preferences, node_classifications, youtube_connections(own), blocks(own) — all self-scoped.

### A.5 Guest-session empirical test (ROLLBACK)
```sql
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","is_anonymous":true}',true);
-- auth.uid() → 33333333-…; auth.role() → authenticated
SELECT count(*) FROM users;            -- 0
SELECT count(*) FROM nodes;            -- 0
SELECT count(*) FROM notifications;    -- 0
SELECT count(*) FROM friend_invites;   -- 0
SELECT count(*) FROM edges;            -- 0
SELECT count(*) FROM youtube_connections; -- 0
SELECT count(*) FROM folders;          -- 0
SELECT count(*) FROM tags;             -- 1245
SELECT count(*) FROM tag_translations; -- 1245
SELECT count(*) FROM translations;     -- 1494
SELECT count(*) FROM external_sources; -- 0
ROLLBACK;
```

### A.6 pg_extension (VERIFIED)
pg_stat_statements 1.11, pg_trgm 1.6, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1 — **no pg_cron, no pg_net**.

### A.7 Realtime publication `supabase_realtime`
card_positions, edges, nodes, notifications, ratings, users (RLS-filtered per subscriber).

### A.8 Storage
buckets: `thumbnails` (public). Policies: `thumbnails_public_read` {public} SELECT; `thumbnails_insert_own` {authenticated} INSERT; `thumbnails_delete_own` {authenticated} DELETE (foldername[1]=auth.uid()).

### A.9 File:line citations
- `app/(auth)/login/page.tsx:29-41` (scope), `:8` (unified-grant comment)
- `app/(auth)/signup/page.tsx:19-27` (scope)
- `app/(auth)/callback/route.ts:42-51` (provider token persist)
- `app/api/youtube/connect/route.ts:47-55` (incremental scope)
- `app/api/youtube/search/route.ts` (user-OAuth token search)
- `proxy.ts:34-55` (session-only protection)
- `app/(app)/layout.tsx:9-12` (getSessionUser→AppShell)
- `app/lib/actions/session.ts:16-47` (SessionUser+email merge)
- `app/(app)/_components/Avatar.tsx:26-28` (initials fallback)
- `app/(app)/notifications/_components/NotificationsView.tsx:28-33` (type switch)
- `lib/hooks/useRealtime.ts:60-120` (5 channels)
- `vercel.json` (2 daily youtube crons)
- `supabase/migrations/062_youtube_connections.sql`, `097_youtube_oauth_tokens.sql`, `112_*.sql:201-240` (ensure_user_profile), `125_share_rpcs.sql:161-208` (share_node notification insert), `130_consent_and_group_members.sql`
- `next.config.ts:43-58` (remotePatterns)
- `package.json` (@supabase/supabase-js 2.103.2 — signInAnonymously supported)
- `supabase/functions/extract-node-metadata/` (edge-function precedent)

*End of PLAN-V2-001.*
