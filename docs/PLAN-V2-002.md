**PRD header (verbatim, `docs/05_PRD_V2_RECOMMENDATION_INBOX.md` lines 1-5; committed as v2.6 on `devin/PLAN-V2-002` by DOCS-V2-001, merges to `main` with PR #37):**

```
# LIKED v2 — Recommendation Inbox

**Version:** 2.6
**Status:** v2.0 APPROVED by Lolo — 2026-11-20. UI design APPROVED by Lolo — 2026-11-21 (boards v2.4). v2.5 = decisions of 2026-11-21 after investigation V2-INV-001 (hybrid architecture, server-mediated guests, YouTube search in P0, stores, shared folders). **Plan: PLAN-V2-002 (accepted 2026-11-21, PR #37).** v2.6 = CTO decisions after review of PLAN-V2-002 (2026-11-21).
**Date:** 2026-11-21
```

# PLAN-V2-002 — Revised v2 Recommendation Inbox implementation plan (hybrid architecture, server-mediated guests)

**Project:** LIKED · **Task ID:** PLAN-V2-002-R2 (supersedes the R1 STOP: PRD was v2.1 then) · **Date:** 2026-11-21
**Status:** Accepted with conditions by CTO 2026-11-21 — see §11 (DV-2 vetoed → hotlink; D-1…D-8 decided in §11.2).
**Mode:** PLANNING ONLY. No application code, no migration file, nothing applied to the database, no auth setting changed, no secret printed.
**Authority:** PRD v2.6 is the single authority for scope, UI, decisions D1–D31 and acceptance criteria. It overrides `PLAN-V2-001` (which assumed PRD v2.1 and Supabase anonymous auth).
**Base:** `origin/main` = `dc2a187` (PR #36 merged). Live DB = project `lzkzfqshnjvlzosnntfx`, `supabase_migrations.schema_migrations` max = **141** (VERIFIED, re-queried today). First new migration = **142**.

**Legend.** **VERIFIED** = file:line, SQL + output, or fetched source, all re-checked in this task (or explicitly cited from `docs/V2-INV-001-REPORT.md`, which is on main). **UNVERIFIED** = could not be confirmed, reason stated. **DESIGN** = this plan's proposal.

**DB probe log (all via `psql` on the Supabase pooler as `postgres`; credentials loaded into shell variables, never printed).** Read-only `SELECT`s, plus explicitly labelled `BEGIN … ROLLBACK` simulations (Appendix A: delete ordering on two real accounts, with and without the causes step; Appendix B: placement-removal scenario). The SQL and verbatim output are in the appendices; after Appendix B a residue check showed zero leftovers, and after Appendix A the account rows still existed (`users_row_exists = 1`).

**Binding decisions.** D23–D28 and "out of scope" are taken as given. **No binding decision was found unworkable.** Several implementation-level corrections and nine proposals are in §11 ("Deviation proposals"); none changes a binding decision.

---

## 0. Changes versus PLAN-V2-001-R1

| # | Item | Old (PLAN-V2-001-R1) | New (this plan) | Reason |
|---|---|---|---|---|
| 1 | Guest identity | Supabase anonymous auth + `signInAnonymously` + `is_anonymous` JWT | Signed httpOnly cookie + `contributors` row; every guest action through `/api/ask/*` with the service client after Ask-token validation (D24) | PRD §4/§9.1. V2-INV A1: anonymous sign-in is **disabled** on the project; A3: no policy/function checks `is_anonymous` |
| 2 | Guest rows in `public.users` | Trigger creates a `users` row per anonymous user (`'user'`, `'user_2222'`) | Guests never get a `users` row | PLAN-V2-001 Appendix A.2 showed the trigger would burn the UNIQUE `normalized_display_name` namespace with `_xxxx` suffixes; V2-INV A2 |
| 3 | RLS posture of new tables | Owner/contributor SELECT policies + RESTRICTIVE `is_anonymous` policies | RLS **enabled, zero policies**, `REVOKE ALL … FROM PUBLIC, anon, authenticated`; all access via SECURITY DEFINER RPC | PRD §8/§13. Default ACL auto-grants new tables and functions to `anon`/`authenticated` (VERIFIED §1.3), so explicit revokes are mandatory |
| 4 | Catalog table | `titles` (`kind` movie/tv/video/channel) | `items` (`kind` movie/**series**/video/channel), `UNIQUE(source,kind,external_id)` + format CHECKs (D27) | PRD §8 |
| 5 | Rating | `smallint` 1–5 stars | nullable integer **0–100**, null = no score, 0 = real score | PRD §5.3, D2, D15 |
| 6 | Ask token storage | `token_hash` (sha256), shown once | raw `token` column (service/RPC-only), **one row per owner**; regenerate = overwrite the token in place | PRD §8 (`token`); owner must be able to re-copy the link (PRD §6.1); single row keeps one-link-per-owner (D4) trivially true |
| 7 | `public.users` extension | `region_code`, `notify_email`, `ask_prompt` | **Do not extend `users`**; new `user_prefs` table; `ask_prompt` dropped (`asks.prompt` is the source of truth) | `users_select_scoped` is row-level only, so any new column on `users` is readable by every edge-connected friend (VERIFIED §1.2). Duplicated prompt = two sources of truth |
| 8 | CAPTCHA | Turnstile on Supabase `signInAnonymously` | Turnstile verified **server-side** in `/api/ask/session` (once per cookie mint) + DB rate limits on every route | No Supabase auth call exists any more |
| 9 | Anonymous guard in `proxy.ts` / `(app)/layout.tsx` | Redirect `is_anonymous` sessions away from legacy routes | **Removed from the plan** (no anonymous sessions exist). `proxy.ts` only gains `/inbox` as a protected prefix | D24 |
| 10 | YouTube | Search = P2, paste-link only, user-OAuth search left as is | **Guarded server-key search in P0** (cache, per-contributor + global daily budgets, search on submit only, graceful degradation) (D26) | PRD §5.2/§9.4 |
| 11 | YouTube data at rest | Not addressed | Inbox stores **video ids only**; display data cached ≤ 30 days with a refresh/delete job; no thumbnail copies | D27, PRD §9.4 |
| 12 | Sign-in scopes | Remove scope from login/signup, "remove or gate" the callback persist | Remove both **and** the callback persist unconditionally. New evidence: the persist helper `upsert`s on every login with `scopes: []`, overwrites `access_token`, resets `last_synced_at` and `revoked_at` (VERIFIED §5.1), so keeping it would corrupt existing YouTube connections | D25 |
| 13 | Posters | Hotlink `image.tmdb.org` + amend PRD | **PRD v2.6 (CTO after PLAN-V2-002 review): posters are hotlinked from `image.tmdb.org` and never copied.** `items.poster_key` dropped; `items.poster_path` stores the TMDB path text and stays inside the 6-month refresh rule; no `thumbnails`-bucket copies and no poster step in the enrichment/housekeeping jobs. CSP `img-src` + `remotePatterns` for `image.tmdb.org` kept | PRD v2.6 §7/§8 — DV-2 vetoed → hotlink (§11.1). TMDB terms fetched today: "Cache, for longer than 6 months, any information…" is prohibited (VERIFIED §6.1); hotlink display is not caching |
| 14 | Enrichment queue | `enrichment_jobs UNIQUE(title_id)` | `UNIQUE(item_id, job_kind, param)` (job kinds `details` per TMDB language tag, `availability` per region) | Items are shared across owners with different languages/regions (PRD §6.8, §7) |
| 15 | Notification | `recommendation_received`, payload with `contributor_name` | Same type, payload carries `contributor_id` (+ name snapshot) so claim/delete can re-point or purge | Needed by claim (§2.8) and guest deletion (§2.10) |
| 16 | Filters / statuses in P0 | "Platform/type minimal filters in P0" (PLAN-V2-001 J.7) | Follow PRD §12: filter sheet, sort, Watched/Dismissed = **P1** (tabs hidden until then) | PRD v2.6 §12 note |
| 17 | `schema_migrations` reconciliation (PLAN-V2-001 R12/§H "088–097 gap") | Flagged as a risk | **Withdrawn.** Repo 137 files = live 137 rows, zero mismatches (V2-INV G1); live max 141 re-verified today | The earlier note was wrong; each migration still records its own ledger row |
| 18 | `ensure_user_profile` simulation | Anonymous insert creates placeholder users | Not needed | No anonymous auth |
| 19 | Account lifecycle, Settings, Credits, i18n `es`, theming, TMDB language sync, claim, picks, promote | Absent (PRD v2.0/v2.1) | New (PRD v2.2–v2.5) — §2–§7 | PRD |
| 20 | Email | Resend + `email_outbox` | Kept, plus: needs an owned sending domain (UNVERIFIED: none known; prod is `liked-zeta.vercel.app`) | §10 |

---

## 1. Final data model (exact DDL, NOT applied)

### 1.1 Evidence base

| Fact | Status | Evidence |
|---|---|---|
| Live migration max = 141 | VERIFIED | `SELECT max(version) FROM supabase_migrations.schema_migrations` → `141` |
| `public.users` columns | VERIFIED | `id, display_name NN, normalized_display_name NN UNIQUE, language_code NN DEFAULT 'en', avatar_key, username_changed_at, avatar_change_count_today, avatar_last_reset_date, created_at, onboarding_imported_at, onboarding_dismissed_at, youtube_import_consent_at`; constraints only `users_pkey`, `users_normalized_display_name_key`; **no email column** |
| `users` has one RLS policy | VERIFIED | `users_select_scoped` (SELECT, role `authenticated`): `id = auth.uid() OR EXISTS (SELECT 1 FROM edges e WHERE (e.user_id = auth.uid() AND e.sender_id = users.id) OR (e.user_id = users.id AND e.sender_id = auth.uid()))` — row-level, no column filter; no INSERT/UPDATE/DELETE policy |
| `users.language_code` values | VERIFIED | `en` × 25 rows (all default; no explicit non-default choice exists) |
| `public.users` has **no FK to `auth.users`** | VERIFIED | `SELECT count(*) … users→auth FKs` → `0` |
| 39 public tables, all RLS-enabled; 6 extensions, **no `pg_cron`, no `pg_net`**; `pgcrypto` 1.3 present | VERIFIED | `pg_class.relrowsecurity`, `pg_extension` |
| `nodes.node_type` CHECK = `text,link,image,video`; `nodes.url` nullable; unique index `nodes_url_owner_id_key (url, owner_id)` | VERIFIED | `import_url` guard text; `pg_indexes` |
| `notifications` has only PK + FK(user_id→users); no CHECK on `type` | VERIFIED | `pg_constraint` on `public.notifications` |
| Legacy canonical YouTube URL `https://www.youtube.com/watch?v=<id>` | VERIFIED | `lib/youtube/runImport.ts:22`, `lib/youtube/sync.ts:140`, `app/(app)/_components/AddSheet.tsx:112` |
| Legacy card thumbnail base `…/storage/v1/object/public/thumbnails/` + `thumbnail_key` | VERIFIED | `app/(app)/card/[id]/_components/CardView.tsx:17`, `FolderTile.tsx:18` |

### 1.2 Decision: do NOT extend `public.users` — create `user_prefs` (DESIGN, evidence above)

1. A new column on `users` is visible to **every account that shares an edge with the user** (policy is row-level; `authenticated` has table-level SELECT). `region_code` (a country) and `notify_email` would leak to friends. VERIFIED (policy text above).
2. All 25 existing rows have `language_code = 'en'` (VERIFIED), so "has the user ever chosen a language?" is not derivable from `language_code`. A nullable `language_set_at` solves it: `NULL` ⇒ apply the browser default (PRD D17).
3. `users` writes today are RPC-only (no write policy); `user_prefs` follows the same rule.
4. `ask_prompt` (PLAN-V2-001) is dropped: `asks.prompt` is the single source of truth.
5. `users.language_code` stays the UI-language column (legacy code reads it: `app/lib/actions/session.ts:40`, `app/(app)/feed/page.tsx:32`).

### 1.3 Grant and RLS posture (applies to every new table and function)

**VERIFIED** — `pg_default_acl` for owner `postgres`, schema `public`: tables `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}`; functions `{postgres=X, anon=X, authenticated=X, service_role=X}`. A new table or function is therefore **immediately reachable by the publishable key** unless explicitly revoked. Existing functions show explicit revokes (`proacl` of `import_url` = `{postgres=X, service_role=X, authenticated=X}`, no `anon`).

**DESIGN — mandatory pattern in every migration:**

```sql
-- every new table
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.<t> FROM PUBLIC, anon, authenticated;       -- service_role keeps its default grant
-- NO CREATE POLICY (PRD §8 rule). Access only through SECURITY DEFINER functions owned by postgres.

-- every new function
CREATE FUNCTION public.<f>(...) ... LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;
REVOKE ALL ON FUNCTION public.<f>(...) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.<f>(...) TO service_role;        -- guest/server-only functions
-- owner-facing functions additionally: GRANT EXECUTE ON FUNCTION public.<f>(...) TO authenticated;
```

Two classes of functions (this is what makes "no guest can call any RPC directly" true):

| Class | Executable by | In-body guard | Callers |
|---|---|---|---|
| **S (server-only)** — guest, claim, delete, rate-limit, budget, enrichment, public-read | `service_role` only | `IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'` (same guard shape as legacy `import_url`, VERIFIED above) | `/api/ask/*`, `/api/cron/*`, `/api/account/*` via `getSupabaseServiceClient()` (`lib/supabase/service.ts`, VERIFIED) |
| **O (owner)** — ask link, inbox read, seen, status, promote, picks, prefs | `authenticated` + `service_role` | `v_uid := auth.uid(); IF v_uid IS NULL THEN 42501`; **no `p_user_id`/`p_owner_id` parameter anywhere** (no IDOR surface) | Owner's cookie-session Supabase client |

A guest has no Supabase JWT, so even a guest holding the publishable key is role `anon`, which holds EXECUTE on nothing new. CI proof: §8 `P0-06`.

### 1.4 DDL — migration 142 (core), 143 (support), later migrations listed in §8

```sql
-- ===== 142_v2_inbox_core.sql (SKETCH — NOT APPLIED) =====
-- Each migration must also INSERT its own supabase_migrations.schema_migrations row
-- (existing practice, scripts/apply-migration.mjs).

-- 1. Owner preferences (replaces "extend users")
CREATE TABLE public.user_prefs (
  user_id         uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  region_code     text CHECK (region_code IS NULL OR region_code ~ '^[A-Z]{2}$'),
  notify_email    boolean NOT NULL DEFAULT true,
  theme           text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  accent          text NOT NULL DEFAULT 'orange'
                  CHECK (accent IN ('orange','blue','violet','teal','green','pink') OR accent ~ '^#[0-9A-Fa-f]{6}$'),
  tmdb_lang       text CHECK (tmdb_lang IN ('en-US','fr-FR','es-ES','es-MX','th-TH')),  -- kept in sync with LANGUAGES by a CI check (§6.2)
  language_set_at timestamptz,                       -- NULL = never chose explicitly -> browser default applies
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Contributors (guests and account-backed contributors). NOT a Supabase identity.
CREATE TABLE public.contributors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name        text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 50),
  secret_hash         bytea NOT NULL CHECK (octet_length(secret_hash) = 32),   -- sha256 of the cookie secret
  claimed_by_user_id  uuid UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((claimed_by_user_id IS NULL) = (claimed_at IS NULL))
);
CREATE INDEX contributors_last_seen ON public.contributors (last_seen_at);

-- 3. Ask link: ONE row per owner (D4). Regenerate = replace token in place.
CREATE TABLE public.asks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE CHECK (char_length(token) >= 32),   -- 24 random bytes, base64url (>= PRD's 12 chars)
  prompt        text CHECK (prompt IS NULL OR char_length(prompt) <= 200), -- NULL = localized default text
  note          text CHECK (note IS NULL OR char_length(note) <= 140),
  liked_genres  integer[] NOT NULL DEFAULT '{}' CHECK (cardinality(liked_genres) <= 5),  -- TMDB genre ids
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  rotated_at    timestamptz
);

-- 4. Catalog (D27). Shared, non-personal. Never deleted while referenced.
CREATE TABLE public.items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL CHECK (source IN ('tmdb','youtube')),
  kind              text NOT NULL CHECK (kind IN ('movie','series','video','channel')),
  external_id       text NOT NULL,
  CONSTRAINT items_identity_format CHECK (
       (source = 'tmdb'    AND kind IN ('movie','series') AND external_id ~ '^[0-9]{1,10}$')
    OR (source = 'youtube' AND kind = 'video'             AND external_id ~ '^[A-Za-z0-9_-]{11}$')
    OR (source = 'youtube' AND kind = 'channel'           AND external_id ~ '^UC[A-Za-z0-9_-]{22}$')),
  name              text,                       -- TMDB: original title; YouTube: cached title (<=30d, §6.4)
  release_date      date,
  original_language text,
  genres            text[] NOT NULL DEFAULT '{}',   -- namespaced keys: 'tmdb:28', 'yt:10'
  is_documentary    boolean NOT NULL DEFAULT false, -- TMDB genre 99
  overview          text,                           -- original-language overview (localized texts live in `localized`)
  runtime_min       integer CHECK (runtime_min IS NULL OR runtime_min >= 0),
  poster_path       text,                           -- TMDB only: image path ('/abc.jpg'); rendered as an image.tmdb.org hotlink, never copied (PRD v2.6 §7); refreshed under the 6-month rule
  thumb_url         text,                           -- YouTube channel avatar only (cached <=30d); videos derive i.ytimg.com/vi/<id>/hqdefault.jpg from the id
  creator_id        text,                           -- YouTube channel id (an ID: allowed)
  creator_name      text,                           -- YouTube channel title (API data: <=30d)
  trailer_url       text,
  tmdb_rating       numeric(3,1) CHECK (tmdb_rating IS NULL OR tmdb_rating BETWEEN 0 AND 10),
  tmdb_votes        integer CHECK (tmdb_votes IS NULL OR tmdb_votes >= 0),
  localized         jsonb NOT NULL DEFAULT '{}',    -- {"fr-FR":{"name","overview","tagline"}, ...} keyed by TMDB tag
  display_status    text NOT NULL DEFAULT 'ok' CHECK (display_status IN ('ok','unavailable')),
  enrichment_status text NOT NULL DEFAULT 'pending' CHECK (enrichment_status IN ('pending','partial','complete','failed')),
  fetched_at        timestamptz,                    -- last successful provider fetch; drives the 30d (YouTube) / 6-month (TMDB) rule
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, kind, external_id)
);
CREATE INDEX items_refresh_due ON public.items (fetched_at) WHERE fetched_at IS NOT NULL;
CREATE INDEX items_enrichment_open ON public.items (enrichment_status) WHERE enrichment_status IN ('pending','partial');

CREATE TABLE public.item_availability (
  item_id       uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  region_code   text NOT NULL CHECK (region_code ~ '^[A-Z]{2}$'),
  provider_id   integer NOT NULL,
  provider      text NOT NULL,
  offer_type    text NOT NULL CHECK (offer_type IN ('flatrate','rent','buy')),
  link          text,
  logo_key      text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, region_code, provider_id, offer_type)
);
-- marks "fetched for this region" so "Not available in {region}" is an explicit state even with zero rows (PRD §7)
CREATE TABLE public.item_availability_fetch (
  item_id     uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  region_code text NOT NULL CHECK (region_code ~ '^[A-Z]{2}$'),
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, region_code)
);

CREATE TABLE public.tmdb_genres (            -- names per TMDB language tag; used by the genre picker + filter chips
  media    text    NOT NULL CHECK (media IN ('movie','tv')),
  id       integer NOT NULL,
  lang     text    NOT NULL,
  name     text    NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media, id, lang)
);

-- 5. Submissions and recommendations
CREATE TABLE public.submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_id           uuid NOT NULL REFERENCES public.asks(id) ON DELETE CASCADE,
  contributor_id   uuid NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  client_batch_id  uuid,
  title_count      integer NOT NULL CHECK (title_count BETWEEN 1 AND 20),
  created_at       timestamptz NOT NULL DEFAULT now(),
  seen_by_owner_at timestamptz,
  UNIQUE (contributor_id, client_batch_id)               -- NULLs never conflict
);
CREATE INDEX submissions_unseen ON public.submissions (ask_id, contributor_id) WHERE seen_by_owner_at IS NULL;
CREATE INDEX submissions_contributor_recent ON public.submissions (contributor_id, created_at DESC);  -- daily-cap window

CREATE TABLE public.recommendations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id        uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  contributor_id uuid NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  submission_id  uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  rating         smallint CHECK (rating IS NULL OR rating BETWEEN 0 AND 100),   -- NULL = untouched; 0 = real score
  platform_text  text CHECK (platform_text IS NULL OR char_length(platform_text) <= 60),
  comment        text CHECK (comment IS NULL OR char_length(comment) <= 280),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, item_id, contributor_id)                                    -- latest values win (PRD §5)
);
CREATE INDEX recommendations_contributor ON public.recommendations (contributor_id);
CREATE INDEX recommendations_submission  ON public.recommendations (submission_id);
CREATE INDEX recommendations_owner_recent ON public.recommendations (owner_id, updated_at DESC);

CREATE TABLE public.owner_item_state (
  owner_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'to_watch' CHECK (status IN ('to_watch','watched','dismissed')),
  updated_at      timestamptz NOT NULL DEFAULT now(),                            -- = status change time ("recommended again" marker)
  PRIMARY KEY (owner_id, item_id)
);
-- NOTE: PRD §8 lists `library_node_id` here. It is NOT created: an FK to `nodes` would have to be ON DELETE SET NULL, which violates the
-- existing Tier-0 check DB-18 ("every FK referencing nodes/folders is ON DELETE CASCADE", scripts/check-invariants-001.mjs:122-128).
-- "In library" is derived from `node_items` (below, created empty in migration 143) — see DV-9.

CREATE TABLE public.owner_contributor_blocks (          -- PRD §10.1 "remove or block a contributor"
  owner_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contributor_id)
);

-- ===== 143_v2_inbox_support.sql (SKETCH) =====
CREATE TABLE public.enrichment_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  job_kind    text NOT NULL CHECK (job_kind IN ('details','availability')),
  param       text NOT NULL,                       -- TMDB language tag for 'details', region code for 'availability'
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts    integer NOT NULL DEFAULT 0,
  run_after   timestamptz NOT NULL DEFAULT now(),
  locked_at   timestamptz,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, job_kind, param)
);
CREATE INDEX enrichment_jobs_due ON public.enrichment_jobs (run_after) WHERE status = 'pending';

CREATE TABLE public.email_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid REFERENCES public.users(id) ON DELETE CASCADE,   -- NULL for account-deletion confirmations (user is gone)
  to_email    text,                                                  -- only set when owner_id IS NULL
  kind        text NOT NULL CHECK (kind IN ('recommendation_received','account_deleted','deletion_request_confirm')),
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts    integer NOT NULL DEFAULT 0,
  send_after  timestamptz NOT NULL DEFAULT now(),
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_id IS NOT NULL OR to_email IS NOT NULL)
);
CREATE INDEX email_outbox_due ON public.email_outbox (send_after) WHERE status = 'pending';

CREATE TABLE public.rate_limits (                           -- DB-backed (serverless has no shared memory; no Redis exists)
  bucket        text        NOT NULL,
  key_hash      text        NOT NULL,                       -- sha256(pepper || ip | contributor_id | token): raw IPs are never stored
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX rate_limits_purge ON public.rate_limits (window_start);

CREATE TABLE public.youtube_search_cache (
  query_key   text PRIMARY KEY,                             -- sha256(normalized query || '|' || lang || '|' || region)
  payload     jsonb NOT NULL,                               -- YouTube API data: TTL <= 12h, purged daily (<= 30d rule, §6.4)
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX youtube_search_cache_expiry ON public.youtube_search_cache (expires_at);

CREATE TABLE public.youtube_search_budget (
  day    date NOT NULL,                                     -- Pacific-time day (quota resets at midnight PT; Google docs, UNVERIFIED this pass)
  scope  text NOT NULL,                                     -- 'global' or 'c:<contributor_id>'
  used   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
);

CREATE TABLE public.account_deletion_jobs (                 -- retriable finalize after the DB transaction (§3.5)
  user_id       uuid PRIMARY KEY,                           -- deliberately NO FK: the user row is gone
  email         text,                                       -- kept only until the confirmation mail is sent
  stage         text NOT NULL DEFAULT 'storage' CHECK (stage IN ('storage','auth','email','done')),
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE TABLE public.deletion_requests (                     -- public /delete-account email path (PRD §10.2)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  token_hash    bytea NOT NULL CHECK (octet_length(token_hash) = 32),   -- emailed confirmation link: proves mailbox ownership
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','done','rejected')),
  ip_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,
  completed_at  timestamptz
);
CREATE INDEX deletion_requests_open ON public.deletion_requests (status, created_at) WHERE status IN ('pending','confirmed');

CREATE TABLE public.node_items (                            -- bridge: Library node -> catalog item (replaces PLAN-REC-001 `node_tmdb`); created EMPTY in P0 so get_inbox is final
  node_id  uuid PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,   -- CASCADE: satisfies DB-18
  item_id  uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT
);
CREATE INDEX node_items_item ON public.node_items (item_id);

-- ===== P1 migration (147; DDL shown for completeness) =====
CREATE TABLE public.owner_picks (
  node_id     uuid PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,   -- pick disappears with the card
  owner_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  visibility  text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','contributors','public')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_picks_owner ON public.owner_picks (owner_id, visibility);
CREATE TABLE public.share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,   -- one picks link per owner
  token       text NOT NULL UNIQUE CHECK (char_length(token) >= 32),
  scope       text NOT NULL DEFAULT 'picks' CHECK (scope = 'picks'),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz
);
-- every table above also receives the §1.3 ENABLE RLS + REVOKE block (omitted per table for brevity)
```

**Changes to existing objects (also migrations, DESIGN):**

| Object | Change | Evidence / reason |
|---|---|---|
| `public.set_language(text)` | allow `'es'`; also upsert `user_prefs.language_set_at = now()` | VERIFIED: body hard-codes `NOT IN ('en','fr','th')` |
| `app/lib/actions/profile.ts:176`, `i18n/locales.ts:2` | replace the two hard-coded lists by the single `LANGUAGES` config | VERIFIED: three independent lists exist today (RPC, action, `LOCALES`) |
| `notifications` | no schema change; new `type = 'recommendation_received'` | VERIFIED: no CHECK on `type` |
| New private storage rules | none; **no poster objects are stored at all** — TMDB posters are hotlinks (`items.poster_path` → `image.tmdb.org`), so the `thumbnails` bucket gains no `tmdb/` keys | VERIFIED: `thumbnails_delete_own` requires first folder = `auth.uid()` (PLAN-V2-001 A.8); with nothing stored there is nothing to squat or delete |

### 1.5 Foreign keys and ON DELETE (summary)

| Child → Parent | Action | Why |
|---|---|---|
| `contributors.claimed_by_user_id → users` | CASCADE | account deletion removes the user's sent recommendations (D20) |
| `asks.owner_id`, `recommendations.owner_id`, `owner_item_state.owner_id`, `share_links.owner_id`, `owner_picks.owner_id`, `user_prefs.user_id`, `owner_contributor_blocks.owner_id → users` | CASCADE | deleting an owner removes the whole inbox |
| `submissions.ask_id → asks`, `submissions.contributor_id → contributors`, `recommendations.contributor_id/submission_id` | CASCADE | contributor deletion removes their rows everywhere; counts and averages are derived, so they update automatically (D20) |
| `recommendations.item_id`, `owner_item_state.item_id`, `node_items.item_id`, `owner_picks.item_id → items` | **RESTRICT** | the catalog is never deleted from under a reference; the purge job only removes unreferenced rows |
| `node_items.node_id`, `owner_picks.node_id → nodes` | CASCADE | picks and links die with the card; **every FK to `nodes`/`folders` stays CASCADE, as the existing Tier-0 check DB-18 requires** (VERIFIED: that check exists at `scripts/check-invariants-001.mjs:122-128` and the live schema satisfies it — 34-row dependents query, all CASCADE). "In library" is derived, not stored: `EXISTS (node_items ni JOIN nodes n ON n.id = ni.node_id WHERE ni.item_id = <item> AND n.owner_id = auth.uid() AND n.deleted_at IS NULL)` |
| `item_availability*`, `enrichment_jobs → items` | CASCADE | derived data |
| `account_deletion_jobs.user_id` | none | the user row no longer exists |

### 1.6 Tier-0 invariants: which apply to the new tables, which do not

Source: `docs/01_PRD.md` §29 / §36 (VERIFIED, lines 1336–1360 and 1952–1976) and `scripts/check-invariants-001.mjs` (VERIFIED: it already defines DB-1…DB-7 and DB-15…DB-19 and REPO-8…REPO-15, including DB-16 `folder_edges` RPCs, DB-18 cascade-only FKs to `nodes`/`folders`, and REPO-15 RPC-only writes to domain tables).

| Invariant | Applies to new tables? | Reasoning |
|---|---|---|
| I-01/I-07 node visible IFF an edge exists; no read-time recomputation | **No** (they govern `nodes`) — and **not violated** | No inbox table grants or alters visibility of any `nodes` row. Guests never receive an edge and never read `nodes`: the guest-visible picks are `items` rows plus the owner's tier flag (`owner_picks`), served by a server route (§2.9). The inbox's own access rule is an *ownership* rule (`owner_id = auth.uid()` inside the RPC), a second access model that PRD D23 explicitly adopts for the dedicated tables |
| I-02/I-03/I-04/I-05 cause/edge integrity | **No new edges written by inbox tables.** Applies to `promote_recommendation` | Promote calls the existing `import_url`, which creates the `import` cause and the owner edge in one transaction (VERIFIED, `import_url` body). Nothing in v2 inserts into `edges`/`causes` directly |
| I-06 "no path checks in unshare" | Applies to `delete_account` | Edges are removed **only by deleting causes** (cascade), never by direct `DELETE FROM edges` (§3.2) |
| I-08/I-15 immutable origin columns, depth | Unaffected | no code touches them |
| I-09/I-10/I-11 tags concept-only | Unaffected | inbox does not create tags; genres are namespaced keys on `items`, not `tags` |
| I-12 no external avatar URLs | Applies | contributors have **no avatar column** (initials only, D3). Note: 2 existing `users.avatar_key` rows hold `lh3.googleusercontent.com` URLs (VERIFIED), a pre-existing violation outside v2 scope |
| I-13 UNIQUE normalized display name | Applies to `users` only | guests live in `contributors`, so they do not consume the namespace |
| I-14 no runtime translation in read path | Applies | read RPCs only *select* stored `localized` text with the fallback rule of §6.3; translation is fetched from TMDB at enrichment time, never at read time |
| I-16 rating writes update `nodes_sort_cache` in the same tx | Applies to `delete_account` | removing a user's `ratings` recomputes `avg_rating` for the affected nodes in the same transaction (§3.2 step 2). Inbox ratings are a separate table and do not touch `nodes_sort_cache` |
| I-17 soft delete keeps causes/edges | Unaffected | |
| I-18/I-19 rate limits on name/avatar | Unaffected | |
| I-20/I-21 design tokens, z-index | Applies | v2 UI uses the new token layer (§7) |
| Write rule "cause → edges in one transaction" | Applies **only** to Library writes | satisfied by reusing `import_url` / `add_node_to_folder` |
| Feed lock (`get_feed` black box) | Applies | no v2 task touches `get_feed`; the inbox has its own SQL read function (`get_inbox`) because it is a different product surface |
| `scripts/check-invariants-001.mjs` check 16 (folder_edges written only by `add_node_to_folder` / `remove_node_from_folder`) | **Needs a documented exception** | `delete_account` calls `remove_node_from_folder` (service-role branch, VERIFIED) and does not write `folder_edges` itself, so the exception is **not** needed as long as §3.2 step 1 keeps that shape |

"Edge-only visibility is not violated for legacy nodes": legacy `nodes`, `edges`, `causes`, `folder_*`, `get_feed` and their RLS are not modified by any v2 migration except `set_language` (a preference RPC). Promote adds exactly one ordinary owner-owned node through the existing write path.

---

## 2. RPC and route specs

**Conventions (DESIGN, reusing existing repo patterns).** Errors are raised as `RAISE EXCEPTION '<CODE>' USING ERRCODE = '<state>'`, the same shape as legacy `DUPLICATE_NODE` (`ERRCODE 'P0001'`, VERIFIED in `import_url`) and `not authenticated` (`42501`). Routes translate codes to HTTP status; clients never see SQL text.

| Code | SQLSTATE | HTTP | Meaning |
|---|---|---|---|
| `NOT_AUTHENTICATED` | 42501 | 401 | owner RPC without a user |
| `FORBIDDEN` | 42501 | 403 | server-only function called by a non-service role (should be unreachable) |
| `ASK_NOT_ACTIVE` | P0001 | 404 | token unknown, disabled, regenerated or owner deleted — **one identical answer** (no oracle) |
| `CONTRIBUTOR_INVALID` | P0001 | 401 | cookie does not resolve to a contributor (route clears the cookie) |
| `CONTRIBUTOR_BLOCKED` | P0001 | 403 | owner blocked this contributor (shown to the guest as a generic "can't send") |
| `SELF_RECOMMEND` | P0001 | 409 | contributor's account is the Ask owner |
| `EMPTY_BATCH` / `TOO_MANY_ITEMS` | 22023 | 400 | 0 or > 20 items |
| `DAILY_CAP` | P0001 | 429 | > 100 titles in the sliding 24 h window |
| `INVALID_ITEM` | 22023 | 400 | item id unknown |
| `INVALID_RATING` | 22023 | 400 | not an integer in 0–100 |
| `FIELD_TOO_LONG` | 22023 | 400 | comment > 280, platform > 60, name outside 2–50 |
| `RATE_LIMITED` | — | 429 + `Retry-After` | route-level (`rl_hit` false) |
| `CAPTCHA_FAILED` | — | 403 | Turnstile verification failed or missing |
| `NOT_FOUND` | P0002 | 404 | owner-scoped object not found |
| `UNSUPPORTED_KIND` | 22023 | 422 | promote on `channel` |
| `REAUTH_REQUIRED` | — | 401 | delete-account without a fresh re-auth proof |

### 2.1 Ask link — create / regenerate / disable (class O, authenticated)

| Function | Signature | Authz | Behaviour | Atomic / idempotent |
|---|---|---|---|---|
| `ensure_my_ask` | `() RETURNS asks` (token included, owner only) | `auth.uid()` | `INSERT … ON CONFLICT (owner_id) DO NOTHING`, token = `translate(encode(gen_random_bytes(24),'base64'),'+/=','-_')` (pgcrypto present, VERIFIED) → returns the row | single statement; idempotent (second call returns the same row) |
| `get_my_ask` | `() RETURNS asks` | `auth.uid()` | the owner's row, or `NOT_FOUND` | read |
| `regenerate_my_ask` | `() RETURNS text` (new token) | `auth.uid()` | `UPDATE asks SET token = <new>, rotated_at = now(), is_active = true WHERE owner_id = auth.uid()`; the **old token stops working at once** (it no longer exists) | one statement; each call rotates (not idempotent by design) |
| `set_ask_active` | `(p_active boolean) RETURNS void` | `auth.uid()` | toggles `is_active`; disabled link answers `ASK_NOT_ACTIVE` | idempotent |
| `update_ask_settings` | `(p_prompt text, p_note text, p_liked_genres integer[]) RETURNS void` | `auth.uid()` | validates lengths (200/140), `cardinality ≤ 5`, distinct, ids ∈ `tmdb_genres`; **6th genre → `FIELD_TOO_LONG`** | idempotent. RPC ships P0, UI is P1 (PRD §12) |

Ask URL = `${NEXT_PUBLIC_APP_URL}/r/<token>`. Token entropy 192 bits (PRD requires ≥ 12 chars).

### 2.2 Guest session start (route + class S functions)

**Route `POST /api/ask/session`** body `{ token, name, captchaToken? }`. Steps (all in the route, service client):

1. Origin check (`Origin` host must equal the app host; reject otherwise) → 403.
2. `rl_hit('ask_session_ip', ip, 3600, 10)`; `rl_hit('ask_token_miss', ip, 3600, 20)` is consulted on any `ASK_NOT_ACTIVE` result (enumeration guard, §4).
3. If **no valid guest cookie**: verify Turnstile (`captchaToken`) server-side (§4.4) → else `CAPTCHA_FAILED`.
4. `guest_get_ask(token)` → `ASK_NOT_ACTIVE` ⇒ 404.
5. If a valid cookie exists → `guest_rename(contributor_id, name)` (name is remembered, may change); else `guest_create_contributor(name, secret_hash)`, route generates the 32-byte secret and sets the cookie (§4.1).
6. **(P1, task P1-07; in P0 every visitor is a guest)** If a Supabase session exists **and** user ≠ owner → the contributor is account-backed (`guest_get_or_create_account_contributor(user_id)`), still addressed through the same cookie (one code path). If user = owner → `409 SELF_RECOMMEND` ("this is your own link").

| Function (class S) | Signature | Notes |
|---|---|---|
| `guest_get_ask` | `(p_token text) RETURNS TABLE(ask_id uuid, owner_display_name text, owner_avatar_key text, prompt text, note text, liked_genres integer[], owner_has_visible_picks boolean)` | joins `asks` + `users`; **no `owner_id`, no email returned**; `ASK_NOT_ACTIVE` otherwise. `owner_has_visible_picks` drives the §5.5 "see my picks" block (P1; constant `false` in P0) |
| `guest_create_contributor` | `(p_name text, p_secret_hash bytea) RETURNS uuid` | validates 2–50 chars |
| `guest_rename` | `(p_contributor_id uuid, p_name text) RETURNS void` | |
| `guest_touch` | `(p_contributor_id uuid) RETURNS void` | bumps `last_seen_at` (drives the retention job, §11 D-5) |
| `guest_verify` | `(p_contributor_id uuid) RETURNS bytea` | returns the stored `secret_hash` so the **route** does the constant-time compare; `CONTRIBUTOR_INVALID` if the row is missing |
| `guest_get_or_create_account_contributor` (P1) | `(p_user_id uuid, p_name text) RETURNS uuid` | returns the contributor with `claimed_by_user_id = p_user_id`, creating it if absent (`INSERT … ON CONFLICT (claimed_by_user_id) DO NOTHING`); rejects the ask owner with `SELF_RECOMMEND` |

### 2.3 `submit_recommendations` (class S) — the single write path

```sql
submit_recommendations(
  p_ask_token       text,
  p_contributor_id  uuid,      -- already authenticated by the route (cookie)
  p_client_batch_id uuid,      -- client-generated idempotency key
  p_items           jsonb      -- [{ "item_id": uuid, "rating": int|null, "platform": text|null, "comment": text|null }]
) RETURNS jsonb                -- { submission_id, accepted, replayed, owner_display_name }
```

Single transaction; any failure rolls everything back (PRD §13 item 2):

1. `auth.role() = 'service_role'` else `FORBIDDEN`.
2. `jsonb_array_length(p_items)`: 0 → `EMPTY_BATCH`; > 20 → `TOO_MANY_ITEMS`.
3. Ask by token **and** `is_active` → else `ASK_NOT_ACTIVE`. Contributor exists → else `CONTRIBUTOR_INVALID`.
4. Not blocked: `owner_contributor_blocks` row → `CONTRIBUTOR_BLOCKED`. Owner = `contributors.claimed_by_user_id` → `SELF_RECOMMEND`.
5. **Idempotency:** `SELECT … FROM submissions WHERE contributor_id = p_contributor_id AND client_batch_id = p_client_batch_id` → if found return `{…, replayed: true}` and stop (no second notification, no second email).
6. Daily cap: `sum(title_count)` of the contributor's submissions in `now() - interval '24 hours'` + new count > 100 → `DAILY_CAP` (sliding window, DESIGN).
7. Per item: `item_id` must exist (`INVALID_ITEM`); `rating IS NULL OR (rating BETWEEN 0 AND 100 AND rating = trunc(rating))` else `INVALID_RATING` (**explicit `0` is stored as 0; absent/`null` is stored NULL**; the step of 5 is a UI rule and is not enforced server-side, DESIGN); `comment ≤ 280`, `platform ≤ 60` else `FIELD_TOO_LONG`; duplicates inside one batch collapse (last wins).
8. `INSERT submissions … RETURNING id`.
9. Per item `INSERT INTO recommendations … ON CONFLICT (owner_id, item_id, contributor_id) DO UPDATE SET rating = EXCLUDED.rating, platform_text = …, comment = …, submission_id = EXCLUDED.submission_id, updated_at = now()` — **latest values win** (PRD §5); `owner_id` comes from the ask, never from the client.
10. `INSERT INTO notifications (user_id, type, payload)` one row: `type = 'recommendation_received'`, `payload = {submission_id, contributor_id, contributor_name, count, ask_id}`. The function is SECURITY DEFINER and owned by `postgres`, the same mechanism as `share_node` (precedent VERIFIED in PLAN-V2-001 B.2: notifications INSERT policy is service-role only).
11. `INSERT INTO enrichment_jobs ON CONFLICT DO NOTHING` for each item × (`details`, owner's `tmdb_lang`) and (`availability`, owner's region) when `items.enrichment_status <> 'complete'` or the pair is missing/stale.
12. If the owner's `user_prefs.notify_email` is true (default true): `INSERT INTO email_outbox(kind='recommendation_received', …)`.

The route then calls `after(() => processJobs(...))` (Next `after`, VERIFIED to exist in this version: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, usable in Route Handlers) so enrichment starts without blocking the response.

**Merge on the owner's inbox (N contributions of one item).** `UNIQUE(owner_id, item_id, contributor_id)` guarantees at most one row per friend per item; the owner read groups by `item_id`:

```sql
SELECT r.item_id,
       count(*)                       AS recommender_count,
       count(r.rating)                AS rater_count,
       round(avg(r.rating))::int      AS friends_avg,      -- mean of non-null scores, rounded; NULL if nobody scored (PRD §6.5)
       max(r.updated_at)              AS latest_at
FROM   public.recommendations r
WHERE  r.owner_id = auth.uid()
GROUP  BY r.item_id;                                       -- 2 friends, same item => ONE row with recommender_count = 2
```

### 2.4 Receipt read (class S)

`guest_get_receipt(p_ask_token text, p_contributor_id uuid, p_lang text DEFAULT NULL) RETURNS TABLE(item_id uuid, kind text, name text, year int, poster_path text, thumb_url text, rating smallint, platform_text text, comment text, updated_at timestamptz)`. Returns **only rows where `contributor_id = p_contributor_id` and `owner_id = ask.owner_id`**. Nothing from other contributors can be selected (that WHERE clause is the only path). Names use the viewer's language with the §6.3 fallback. The same function powers "returning visitor sees what they already sent" (PRD §5 rules).

### 2.5 Owner inbox read, rail, mark-seen (class O)

```sql
get_inbox(
  p_status      text    DEFAULT 'to_watch',     -- to_watch | watched | dismissed
  p_friend_id   uuid    DEFAULT NULL,           -- contributor id (rail selection); single-select
  p_filters     jsonb   DEFAULT '{}',           -- {platforms:[], types:[], decades:[], languages:[], genres:[], multi_recommended:bool}
  p_sort        text    DEFAULT 'recent',       -- recent | most_recommended | friend_score | release_date | tmdb_score
  p_cursor_key  numeric DEFAULT NULL,           -- keyset cursor (sort_key, item_id): deterministic, no OFFSET
  p_cursor_item uuid    DEFAULT NULL,
  p_limit       integer DEFAULT 30              -- max 100
) RETURNS jsonb   -- { cards: [...], next_cursor, counts: {to_watch, watched, dismissed} }
```

* **Authz:** `auth.uid()` is the owner; there is no owner parameter. Language = `user_prefs.tmdb_lang` (default `en-US`), region = `user_prefs.region_code`.
* **Each card** (one per `item_id`, DESIGN): item display fields via the §6.3 fallback; `kind` + `is_documentary` give the type chip; `recommenders` (up to 3 avatars: initials + name, plus `more_count`); `friends_avg` and `rater_count` over **all** recommenders of that item, independent of the rail selection (DESIGN; PRD is silent); `tmdb_score = round(tmdb_rating*10)`; up to 2 platform labels from `item_availability` for the owner's region; **quote** = the selected friend's non-empty comment when `p_friend_id` is set, else the most recent non-empty comment (PRD §6.2); `in_library` = the `node_items` join above (always false in P0: the table is empty until promote ships); `recommended_again` = status `dismissed` AND `max(r.updated_at) > owner_item_state.updated_at`; skeleton flag = `enrichment_status = 'pending'`.
* **Filters:** within a category OR, across categories AND; the rail selection ANDs with filters (PRD §6.4). Sorting, merging and pagination stay in SQL (no TypeScript merging, per the no-logic-outside-DB rule). `sort_key` is a non-null numeric per mode (`COALESCE(x,-1)`), ties broken by `item_id`.
* **Counts:** the three status counts are computed from the same filtered base (all statuses), so the active tab's badge equals the list length at default filters (PRD §13 item 9).
* **P0 scope:** only `to_watch` and `recent` are exposed in the UI; the function ships complete so P1 is UI-only.

```sql
get_friend_rail() RETURNS jsonb
-- { all_unseen, friends: [{ contributor_id, display_name, last_submission_at, unseen_count, total_count }] }
-- unseen_count = recommendations whose submission has seen_by_owner_at IS NULL (PRD §6.3)
-- all_unseen   = SUM(unseen_count)   -> "All = sum" holds by construction
-- ordered by last_submission_at DESC; excludes contributors the owner blocked
```

```sql
mark_friend_seen(p_contributor_id uuid) RETURNS jsonb   -- { cleared_submissions, cleared_recommendations }
```

Sets `seen_by_owner_at = now()` on that contributor's unseen submissions **to the caller's ask only**; counts the recommendations they carried before updating, so `all_unseen` after = before − `cleared_recommendations` (PRD §13 item 8). Idempotent (a second call clears 0). The UI calls it when a friend filter is opened; **viewing All never calls it**.

### 2.6 Status changes (class O, P1)

`set_item_status(p_item_id uuid, p_status text) RETURNS void` — upserts `owner_item_state` (`updated_at = now()`), only for items that have a recommendation to the caller (`NOT_FOUND` otherwise). Idempotent. Dismissed items are **not** resurrected by new recommendations (PRD §6.2); they only surface `recommended_again`.

### 2.7 `promote_recommendation` (class O, P1)

```sql
promote_recommendation(p_recommendation_id uuid, p_folder_id uuid) RETURNS jsonb  -- { node_id, already }
```

Why this is implementable under the investigation constraints: **no authenticated RPC can create a node for another owner** (V2-INV B3; re-verified in the `import_url` guard `auth.role()='authenticated' AND p_owner_id IS NOT DISTINCT FROM auth.uid()`), but promote creates a node for **the caller himself**, so the guard passes when `promote_recommendation` calls `import_url` from inside its SECURITY DEFINER body (`auth.uid()` still resolves to the owner). No service-role escalation is needed.

1. Recommendation with `owner_id = auth.uid()` → else `NOT_FOUND`. Kind `channel` → `UNSUPPORTED_KIND` (DESIGN: PRD says "TMDB title or YouTube video").
2. **Idempotency:** a `node_items` row for this item whose node is owned by the caller and not trashed → return `{node_id, already:true}`.
3. Canonical URL: movie `https://www.themoviedb.org/movie/<id>`, series `https://www.themoviedb.org/tv/<id>`, video `https://www.youtube.com/watch?v=<id>`. The video form is identical to the legacy importer (VERIFIED, §1.1), so a video the owner already imported dedupes onto the same node.
4. `PERFORM import_url(p_owner_id := auth.uid(), p_url := <canonical>, p_title := <localized name>, p_thumbnail_key := NULL, p_language_code := <owner UI language>, p_node_type := 'link' (TMDB) | 'video' (YouTube), p_description := <localized overview>, p_folder_id := p_folder_id)`. Posters are hotlinked, never copied (DV-2 vetoed); the promoted card's TMDB poster resolves through `node_items` → `items.poster_path` → `image.tmdb.org` at read time (P1-05). `import_url` already does, in one transaction: insert the node, `nodes_sort_cache`, the `import` cause and the owner edge, file the node into `p_folder_id` after `effective_folder_permission ≥ contribute`, and expand covering grants (VERIFIED, function body). The cause → edges rule is therefore honoured without new edge code.
5. Insert `node_items(node_id, item_id)` (`ON CONFLICT (node_id) DO NOTHING`).
6. **Duplicate:** `import_url` raises `DUPLICATE_NODE` (unique `(url, owner_id)`, VERIFIED). The wrapper catches it, selects the existing node by `(url, owner_id)`; if trashed it calls the existing `set_node_deleted(node, false)`; then `add_node_to_folder(node, p_folder_id)` and records the link. No pre-check query runs before the insert (legacy rule: "NO pre-check for duplicates" is a comment in `import_url`).
7. Folder creation is **not** part of promote: "choose or create a folder" uses the existing `create_folder(p_name, p_parent_folder_id, p_color_hex, p_description)` first (VERIFIED signature). A failed promote leaves at worst an empty folder.

UNVERIFIED: how a YouTube Library card renders in the legacy feed when `thumbnail_key` is NULL (the detail view derives YouTube thumbnails from the URL, `CardView.tsx:97`); covered by P1-05's acceptance test.

### 2.8 `claim_guest` (class S, P1)

Route `POST /api/ask/claim` requires **both** a valid guest cookie **and** a Supabase session (the user just came back from Google), **and** a short-lived `liked_claim_intent` cookie set when the guest pressed "Continue with Google". Without the intent cookie a signed-in person on a shared device could absorb another person's guest history just by opening `/r/…` (threat T9, §4.5).

```sql
claim_guest(p_contributor_id uuid, p_user_id uuid) RETURNS jsonb  -- { merged_into, moved_recommendations, merged_conflicts, dropped_self }
```

1. Lock the guest row `FOR UPDATE`. Already claimed by this user → return (idempotent). Claimed by another user → `CONTRIBUTOR_INVALID`.
2. Look for an existing contributor `T` with `claimed_by_user_id = p_user_id` (this covers "the Google account already exists in LIKED").
3. **No `T`:** `UPDATE contributors SET claimed_by_user_id = p_user_id, claimed_at = now()`; nothing else moves (rows keep the same contributor id). **`T` exists:** move submissions (`client_batch_id` set NULL on moved rows to avoid UNIQUE clashes) and merge recommendations — on an `(owner_id,item_id)` conflict keep the row with the greater `updated_at`; re-point `notifications.payload->>'contributor_id'`; delete the guest row.
4. Delete any recommendation whose `owner_id = p_user_id` (nobody recommends to himself) and report the count.
5. The route issues a new cookie for the surviving contributor and rotates the secret.

### 2.9 Public read: share-token and owner picks (P1; routes use class S)

| Route | Function | Behaviour |
|---|---|---|
| `GET /s/<token>` (page), `GET /api/share/<token>` | `get_public_picks(p_token text)` (S) | returns `owner_picks` with `visibility = 'public'` joined to `items` only (**never `nodes`**) plus the owner's display name; unknown/disabled/regenerated → the same 404 as `ASK_NOT_ACTIVE`; read-only, no cookie, rate-limited |
| `GET /api/ask/picks` | `guest_get_picks(p_ask_token, p_contributor_id)` (S) | `visibility IN ('contributors','public')` for the ask's owner, only if the contributor has ≥ 1 submission to that owner |
| owner management | `get_my_share_link()`, `regenerate_my_share_link()`, `set_share_link_active(bool)`, `set_pick_visibility(p_node_id uuid, p_visibility text)`, `list_my_picks()` (O) | `set_pick_visibility` requires `nodes.owner_id = auth.uid()` **and** a `node_items` row; `private` deletes the pick |

Revocation is immediate (token replaced or `is_active = false`). Account holders get Library folders through normal engine sharing (`share_folder_v2`, unchanged).

### 2.10 `delete_account` and `delete_guest_data`

Detail in §3. Signatures: `delete_account(p_user_id uuid, p_email text) RETURNS jsonb` (S, `service_role` only; **never** takes the id from the client, the route derives it from the verified session) and `delete_guest_data(p_contributor_id uuid) RETURNS jsonb` (S).

`delete_guest_data` (route `POST /api/ask/delete-me`): one transaction — delete `notifications` of type `recommendation_received` whose `payload->>'contributor_id'` matches, delete the `contributors` row (cascade removes `submissions`, `recommendations`, `owner_contributor_blocks`) and the `youtube_search_budget` rows `c:<id>`. Idempotent (second call `{deleted:false}`); the route clears the cookie. Owners' counts and averages update by construction (derived, PRD D20).

### 2.11 Infrastructure and worker functions (class S)

The existing check REPO-15 forbids direct `.from(<domain table>).insert/update/delete/upsert` in app code (VERIFIED, `scripts/check-invariants-001.mjs:290-295`). Every route and worker write to a v2 table therefore goes through one of the class-S functions below (P0-06 extends the table list of that check).

| Function | Purpose |
|---|---|
| `rl_hit(p_bucket text, p_key_hash text, p_window_seconds int, p_limit int) RETURNS boolean` | atomic `INSERT … ON CONFLICT (bucket,key_hash,window_start) DO UPDATE SET hits = rate_limits.hits + 1 RETURNING hits`; `window_start = floor(now/window)`; returns `hits <= p_limit` |
| `yt_budget_consume(p_contributor_id uuid, p_kind text) RETURNS jsonb` | atomic reservation `{allowed, reason}` (`p_kind` = `search` or `resolve`; scopes `global_search`, `global_units`, `c:<id>`) against `youtube_search_budget` for the Pacific-time day (§6.4) |
| `enrichment_claim(p_limit int) RETURNS SETOF enrichment_jobs` | `UPDATE … WHERE id IN (SELECT id … WHERE status='pending' AND run_after <= now() FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *` |
| `upsert_item(p_source text, p_kind text, p_external_id text, p_base jsonb) RETURNS items` | the only way items are created: `INSERT … ON CONFLICT (source,kind,external_id) DO NOTHING` then returns the row; `p_base` carries the fields the server fetched (never client input) |
| `item_apply_details(p_item_id uuid, p_tag text, p_payload jsonb) RETURNS void` | writes base columns (first time), `localized[p_tag]`, `fetched_at`, status transition |
| `item_apply_availability(p_item_id uuid, p_region text, p_rows jsonb) RETURNS void` | replaces `item_availability` rows for (item, region) and upserts `item_availability_fetch` |
| `enrichment_finish(p_job_id uuid, p_ok boolean, p_error text) RETURNS void` | `done`, or `attempts+1` with `run_after = now() + 2^attempts minutes`, `failed` after 5 |
| `item_refresh_apply(p_item_id uuid, p_payload jsonb, p_unavailable boolean) RETURNS void` | 30-day/6-month refresh result, or nulls the display fields (§6.5); for promoted YouTube nodes also updates `nodes.title` (DV-5) |
| `housekeeping_purge()` | deletes expired `youtube_search_cache`, `rate_limits` older than 2 days, `youtube_search_budget` older than 3 days, `account_deletion_jobs` done > 30 days |

### 2.12 Route inventory (all new routes; owner routes use the cookie-session client)

| Route | Method | Caller | Auth | Rate-limit buckets (§4.3) |
|---|---|---|---|---|
| `/r/[token]` (server component) | GET | guest | none (calls `guest_get_ask` with the service client) | `ask_view`, `ask_token_miss` |
| `/api/ask/session` | POST | guest | token + Turnstile | `ask_session_ip`, `ask_token_miss` |
| `/api/ask/search` | GET | guest | cookie + token | `ask_search_c`, `ask_search_ip` |
| `/api/ask/resolve` | POST | guest | cookie + token | `ask_resolve_c` |
| `/api/ask/submit` | POST | guest | cookie + token | `ask_submit_c`, `ask_submit_token` |
| `/api/ask/receipt` | GET | guest | cookie + token | `ask_view` |
| `/api/ask/picks` | GET | guest | cookie + token | `ask_view` |
| `/api/ask/delete-me` | POST | guest | cookie | `ask_submit_c` |
| `/api/ask/claim` | POST | upgraded guest | cookie + Supabase session + intent cookie | `ask_session_ip` |
| `/api/account/delete` | POST | owner | session + fresh re-auth proof + checkbox | `acct_delete_user` |
| `/api/account/reauth/start`, `/api/account/reauth/done` | GET | owner | Google round-trip (§3.4) | `acct_delete_user` |
| `/delete-account` (page), `/api/delete-requests` (POST), `/api/delete-requests/confirm` (GET) | — | anyone | Turnstile on POST | `delreq_ip` |
| `/s/[token]`, `/api/share/[token]` | GET | anyone | token | `ask_view` |
| `/api/cron/housekeeping`, `/api/cron/enrich` | GET | Vercel cron | `Authorization: Bearer ${CRON_SECRET}` (same scheme as `app/api/youtube/sync/route.ts:17-18`, VERIFIED) | — |

Owner-side reads and writes (inbox, rail, mark-seen, ask settings, status, promote, picks, prefs) are server actions or route handlers calling the class-O RPCs with the owner's cookie-session client (same pattern as the legacy `sessionRpc`, VERIFIED in `app/lib/actions/mvp2.ts:597`).

---

## 3. `delete_account` design (PRD §10.2)

### 3.1 Evidence: what blocks a plain delete

All probes below are `SELECT`-only on the live DB (project `lzkzfqshnjvlzosnntfx`).

```sql
-- every FK in public that points at public.users or auth.* , with its delete action
SELECT cl.relname AS child, a.attname AS col, ref.relname AS parent,
  CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' END AS on_delete,
  n.nspname||'.'||ref.relname AS parent_full
FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
JOIN pg_class ref ON ref.oid=c.confrelid JOIN pg_namespace n ON n.oid=ref.relnamespace
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
WHERE c.contype='f' AND ns.nspname='public' AND ((n.nspname='public' AND ref.relname='users') OR n.nspname='auth')
ORDER BY parent_full, child, col;
```

Verbatim result (35 rows), grouped by delete action:

| Action | Tables (column) |
|---|---|
| **CASCADE** → `auth.users` | `card_positions` (user_id), `youtube_connections` (user_id) |
| **CASCADE** → `public.users` | `causes` (created_by), `edges` (user_id), `folder_grants` (granted_by, grantee_id), `folder_ratings` (user_id), `folders` (owner_id), `friend_invites` (from_user_id, to_user_id), `node_classifications` (owner_id), `node_notes` (user_id), `nodes` (origin_user_id, owner_id), `organize_batches` (user_id), `user_node_preferences` (user_id) |
| **SET NULL** | `folder_edges` (added_by) |
| **NO ACTION** → `public.users` | `activity_log` (user_id), `blocks` (blocked_id, blocker_id), `categorization_suggestions` (user_id), `direct_chats` (user_1_id, user_2_id), `edges` (**sender_id**), `folder_admins` (granted_by, user_id), `group_admins` (granted_by, user_id), `group_members` (user_id), `group_messages` (sender_id), `groups` (owner_id), `messages` (sender_id), `node_messages` (sender_id), `notifications` (user_id), `ratings` (user_id) |

Further facts (all VERIFIED):

* `public.users` has **no FK to `auth.users`** (`count = 0`), so `auth.admin.deleteUser` does not remove the profile and the profile delete does not remove the auth user — two explicit deletes are needed.
* Dependents of `nodes` and `folders` are all `ON DELETE CASCADE` today (34-row query, e.g. `edges.node_id`, `folder_edges.node_id`, `ratings.node_id`, `translations.node_id`, `folder_tree.folder_id/ancestor_id`, `folders.parent_folder_id`). The "many FKs are NO ACTION" in `05_MVP2_PLAN.md §0.1` line 23 is **out of date** for nodes/folders (P0-03 of that plan was applied); what remains NO ACTION is the user-referencing list above and the `groups` children (`group_admins`, `group_members`, `group_messages`, `group_nodes` → `groups`).
* `categorization_suggestions_backup_20260927.user_id` is a `uuid` column **with no FK at all** (found by a column scan): it must be deleted by name.
* Triggers: only `nodes_immutable_columns_guard` (UPDATE of `node_type`/`parent_node_id`) and `ensure_user_profile_trigger` (INSERT on `auth.users`) exist in `public`/`auth`; **`storage.objects` has `protect_objects_delete`**, so stored files cannot be removed with SQL — the Storage API is required.
* Storage: bucket `thumbnails`, 3 146 objects, **all** keyed `<user_uuid>/<uuid>.<ext>` (pattern query), while only ~1 454 `nodes.thumbnail_key` values point at them → orphan files exist; deleting by the `<uid>/` prefix (not by `thumbnail_key`) is the correct rule. `users.avatar_key` holds only Google URLs, no stored avatar files.
* Groups: there is **no ownership-transfer function** (function list `add_group_member, create_group, delete_group, get_group_access_users, grant_group_admin, group_is_member, group_is_owned, is_group_admin, remove_group_member`); `delete_group` is a soft delete (`deleted_at`).
* Existing building blocks: `remove_node_from_folder(node, folder)` has an explicit **`service_role` branch** that deletes the `folder_edges` row and calls `_revoke_folder_grants_for_node` (deletes the matching `folder_grant_expand` causes, which cascade to edges) — reused below.
* `upsert_rating` recomputes `nodes_sort_cache.avg_rating = AVG(score)` after each write (invariant I-16); deletion must do the same.

### 3.2 Deletion order (single database transaction, function `delete_account(p_user_id uuid, p_email text)`)

**Evidence of the order — BEGIN … ROLLBACK simulation on real data** (SQL in Appendix A/B). Findings:

1. A naive `DELETE FROM users WHERE id = u` **fails** for the account that owns shared content: `23503 update or delete on table "users" violates foreign key constraint "edges_sender_id_fkey" on table "edges"` (account `laurent.martenot`: 908 nodes, 18 folders, 936 received edges, 40 edges with `sender_id = u`). `NO ACTION` is checked while the cascade chain is still running, so cascades via `nodes`/`causes` do not rescue it. **Fix:** delete the user's `causes` first (cascade removes every edge they sent, honouring "cause deletion cascades to all edges, no other deletion path"). After that step the same account deleted cleanly.
2. Placements the user made in other people's folders are removed by `remove_node_from_folder` first; otherwise `folder_edges.added_by` is silently `SET NULL`, leaving anonymous items in strangers' folders — which PRD §10.2 forbids.

**Final order** (DESIGN). Steps 3–8 and 10 were exercised by the rollback simulations (Appendix A/B); steps 0–2, the actor-notification part of 7, 9, 11 and 12 touch objects that do not exist yet or were not simulated and are **UNVERIFIED until task P0-05's harness runs**:

| # | Step | Detail | Why this position |
|---|---|---|---|
| 0 | Guard + ledger | `service_role` only; `INSERT account_deletion_jobs(user_id,email) ON CONFLICT DO NOTHING`; if no `users` row **and** the ledger shows `done` → return `{already:true}` | idempotency |
| 1 | **Inbox, sent side** | `DELETE FROM notifications WHERE type='recommendation_received' AND payload->>'contributor_id' IN (SELECT id::text FROM contributors WHERE claimed_by_user_id = u)`; `DELETE FROM contributors WHERE claimed_by_user_id = u` (cascades `submissions`, `recommendations`, `owner_contributor_blocks`) | D20: the user's recommendations vanish from every inbox; derived counts/averages update by construction |
| 2 | Remember orphan candidates | `v_guests := array(SELECT DISTINCT s.contributor_id FROM submissions s JOIN asks a ON a.id = s.ask_id WHERE a.owner_id = u)` | guests who only wrote to this owner |
| 3 | **Library placements in others' folders** | `FOR r IN SELECT fe.node_id, fe.folder_id FROM folder_edges fe JOIN folders f ON f.id=fe.folder_id JOIN nodes nd ON nd.id=fe.node_id WHERE fe.added_by = u AND f.owner_id <> u AND nd.owner_id <> u LOOP PERFORM remove_node_from_folder(r.node_id, r.folder_id)` | must precede the user delete (`SET NULL` otherwise); reuses the existing authorised path and its grant revocation |
| 4 | Ratings | `DELETE FROM ratings WHERE user_id=u`; then `UPDATE nodes_sort_cache SET avg_rating = (SELECT AVG(score) FROM ratings WHERE node_id = c.node_id), updated_at = now()` for the affected node ids | I-16, same transaction |
| 5 | Chats | `node_messages` (sender), `messages` (sender or chats of the user), `direct_chats` | NO ACTION tables |
| 6 | Groups | `group_messages`, `group_nodes`, `group_admins`, `group_members` of groups the user **owns**, then `groups` owned; memberships/admin rows of the user in other groups | NO ACTION; no transfer function exists (§3.3 R9) |
| 7 | Other NO ACTION tables | `folder_admins` (user or granter), `blocks` (either side), `categorization_suggestions`, `categorization_suggestions_backup_20260927`, `notifications` of the user **and** notifications of others whose `payload->>'actor_id' = u`, `activity_log` | NO ACTION / no FK |
| 8 | **Causes** | `DELETE FROM causes WHERE created_by = u OR id IN (SELECT cause_id FROM edges WHERE sender_id = u)` | cascades all edges the user sent or created (I-03); removes the `edges_sender_id_fkey` blocker |
| 9 | Tokens | `DELETE FROM youtube_connections WHERE user_id = u`, `DELETE FROM card_positions WHERE user_id = u` | encrypted OAuth tokens leave the DB inside the same transaction (otherwise they live until the auth step) |
| 10 | **The user** | `DELETE FROM users WHERE id = u` | cascades `nodes` (owner/origin) and everything under them (edges, folder_edges, ratings, translations, tag_edges…), `folders` (+ tree, grants, admins, ratings), `edges.user_id`, `folder_grants`, `node_notes`, `node_classifications`, `user_node_preferences`, `organize_batches`, `friend_invites`, and the inbox owner side (`asks`, `recommendations`, `owner_item_state`, `user_prefs`, `share_links`, `owner_picks`, `owner_contributor_blocks`) |
| 11 | Orphan guests | `DELETE FROM contributors WHERE id = ANY(v_guests) AND claimed_by_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM submissions WHERE contributor_id = contributors.id)` | guests whose only audience was the deleted owner keep no data |
| 12 | Ledger | `UPDATE account_deletion_jobs SET stage='storage'` | hands over to the retriable finalize (§3.5) |

Nothing in this function inserts, updates or deletes `edges` or `folder_edges` directly: edges go through cause deletion and node/user cascade; `folder_edges` through the existing `remove_node_from_folder`. Tier-0 check 16 therefore stays satisfied (§1.6).

**As built (migration 146, task V2-W2-P0-05):** `public.delete_account(p_user_id uuid, p_email text) RETURNS jsonb` — class S (service_role guard 42501, `SECURITY DEFINER`, `SET search_path = public`, EXECUTE service_role only). Step 0 locks the `users` row `FOR UPDATE` and writes the `account_deletion_jobs` ledger row in the same transaction: existing user → insert ledger (`ON CONFLICT DO NOTHING`, stage default `'storage'`); missing user + ledger row → `{already:true,deleted:false}`; missing user + no ledger → `{already:false,deleted:false,not_found:true}` with zero writes. Steps 1–12 follow the table above with task overrides O1–O8: claimed contributors' `recommendation_received` notifications/email_outbox/`youtube_search_budget c:<id>` rows are purged before the contributor delete (O2); other users' notifications with `payload->>'actor_id'`/`'sender_id'` = the user are deleted (O3 — live payload keys use `sender_id`, `actor_id` kept defensively); group coverage adds `group_messages.sender_id` in non-owned groups, `group_admins.granted_by`, and direct-chat `messages` (O4); orphan-guest purge also removes their outbox/budget rows and keeps guests who wrote to any other owner (O5); no direct DML on `edges`/`folder_edges` — causes only in step 8, placements only via `remove_node_from_folder` (O6); returns `{already:false,deleted:true,counts:{…}}` with per-step `GET DIAGNOSTICS` row counts and step 12 sets `stage='storage'` explicitly (O7); Storage/auth untouched (O8). Validation: `p_user_id NULL` → 22023 `'invalid user'`; `p_email` NULL or 3–254 chars else 22023 `'invalid email'`. Coverage list lives in `scripts/lib/delete-account-coverage.mjs` (COVERED_FKS / COVERED_UNREFERENCED_COLUMNS / COVERED_PAYLOAD_KEYS + `findCoverageGaps`), wired into DB-22 by P0-06; rollback harness `scripts/verify-delete-account.mjs` runs the migration text inside BEGIN…ROLLBACK only.

### 3.3 Exact rule for items the user added to other people's shared folders

| # | Situation | Rule | Evidence |
|---|---|---|---|
| R1 | A node the user **owns** (created) that sits in anyone's folder | deleted with the account; disappears from every folder and feed of everyone it was shared with (`nodes.owner_id` CASCADE → `folder_edges`, `edges`) | cascade table; Appendix A: `nodes_owned 908 → 0` |
| R2 | A node **owned by someone else** that the user placed into a folder owned by someone else | the placement is removed (`remove_node_from_folder`, service branch) and the covering grant edges for it are revoked; **the node and the folder survive** | Appendix B: `placements_removed=1`, afterwards `folder_still_exists=1, a_node_still_exists=1, placement_left=0` |
| R3 | Nodes others placed in the user's own folders | placements vanish with the folder (`folder_edges.folder_id` CASCADE); the nodes survive for their owners | cascade table |
| R4 | Sub-folders the user created inside someone else's folder | deleted (`folders.owner_id` + `parent_folder_id` CASCADE); nodes filed only there lose that placement but still exist and stay visible through their own edges. **Known limitation:** the other person's organisation inside that sub-folder is lost | cascade table |
| R5 | `folder_edges.added_by` pointing at the user | none may remain: step 3 runs before the user delete; check `orphan_folder_edges_added_by = 0` | both simulations |
| R6 | Grants where the user is grantee, or granter (reshare) | deleted; **downstream recipients of a reshare lose access** (`folder_grants.granted_by` CASCADE) | cascade table; Appendix A: `grants_any 2 → 0` |
| R7 | Ratings the user gave | deleted; averages recomputed | step 4 |
| R8 | Chat messages the user sent, and the direct chats they are in | deleted (the counterpart also loses that conversation) | step 5 |
| R9 | Groups the user **owns** | deleted with members, admins, messages and `group_nodes` (no transfer function exists). Groups the user merely belongs to: only their membership/admin rows go | function list above |

### 3.4 Re-authentication (PRD §10.2 steps 2–3) and the route

Fresh Google sign-in is required (PRD D19). The JWT `amr` timestamp claim was **not** probed — UNVERIFIED whether this project's tokens carry it and whether Google honours `max_age=0` / `prompt=login` — so the plan does not depend on either:

1. `GET /api/account/reauth/start` (owner session) → sets signed httpOnly cookie `liked_reauth_state = HMAC({uid, nonce, iat})` (10 min) and returns the URL for `supabaseBrowser.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: <origin>/callback?next=/api/account/reauth/done, queryParams:{ prompt:'select_account consent', max_age:'0' } } })` (basic scopes only, §5).
2. `/callback` exchanges the code (existing route). `GET /api/account/reauth/done` then checks that the current session user id equals `uid` from the state cookie. **If it differs** (the person picked another Google account) nothing is deleted and the user lands on the normal post-login page. If equal and the state is ≤ 10 min old, the route sets `liked_reauth_proof = HMAC({uid, iat})` (httpOnly, Secure, SameSite=Lax, 5 min).
3. `POST /api/account/delete` `{ confirmed: true }`: requires session, `confirmed === true`, a valid proof cookie for the same `uid` with `iat` ≤ 5 min, then **clears the proof cookie (single use)**. Missing/expired proof → `REAUTH_REQUIRED`.
4. Pipeline (each stage idempotent, progress in `account_deletion_jobs`): (a) best-effort revoke of the Google refresh token using the same logic as the existing disconnect route (VERIFIED, `app/api/youtube/disconnect/route.ts:28-34`), (b) `rpc('delete_account', {p_user_id: uid, p_email: <auth email>})`, (c) Storage purge: list `thumbnails/<uid>/` and `remove()` in batches of 100 until empty (**Storage API; SQL deletes are blocked by `protect_objects_delete`**), (d) `supabase.auth.admin.deleteUser(uid)` — a "not found" answer counts as success, (e) enqueue `email_outbox(kind='account_deleted', to_email)`, (f) ledger `done`, `email = NULL`.
5. The route signs the browser out (clears the Supabase cookies) and redirects to `/account-deleted`. A still-valid JWT of the deleted user cannot reach anything: every owner RPC is keyed on `auth.uid()` and all their rows are gone, and `getSessionUser` returns null when the `users` row is missing (VERIFIED in PLAN-V2-001 B.4 `session.ts:16-47`). Whether Supabase rejects the old JWT before its expiry after `deleteUser` is UNVERIFIED and not relied upon.

Why the transaction commits **before** storage/auth: the database is the source of truth, and the retriable ledger makes the later stages resumable. The reverse order would leave live rows pointing at deleted files if the DB step failed.

### 3.5 Idempotency and failure handling

* `delete_account` run twice: the second call finds no `users` row and a ledger row at or past `storage` → returns `{already:true}` and does **not** re-run destructive steps (PRD §13 item 14: "running it twice is harmless").
* Crash between stages: the ledger row remains; the route retries each stage up to 3 times with backoff; `/api/cron/housekeeping` (daily, §6.5) resumes any job older than 10 minutes with `attempts < 10`. Storage purge and auth delete are naturally idempotent. A job stuck at `auth` is visible in the table (`last_error`) for manual action.
* Confirmation mail needs the address after the account is gone, so it is stored only in the ledger row and nulled when the mail is sent or after 30 days (`housekeeping_purge`).
* Backups roll off with the provider's retention; short-lived security logs ≤ 30 days; both must be stated in the privacy policy (PRD §10.2).

### 3.6 Public `/delete-account` and `deletion_requests`

* Page content (static, localized): what is deleted; button **A — sign in with Google and delete** (goes through the same Settings sheet and re-auth); form **B — request by email**; names the app and the developer (developer legal name/contact: UNVERIFIED, supplied by Lolo, §10).
* **B flow:** email + Turnstile → `POST /api/delete-requests` inserts `deletion_requests(status='pending', token_hash)` and enqueues `email_outbox(kind='deletion_request_confirm')` with a one-time link; the answer is always the same generic text ("If an account exists for this address you will receive an email"), so the form is not an account-existence oracle. `GET /api/delete-requests/confirm?t=<token>` sets `confirmed` (proves mailbox ownership). Anyone can type any address, so **an unconfirmed request never deletes anything**.
* Processing within 30 days (PRD §10.2): runbook script `scripts/process-deletion-requests.mjs` (service key, run by the owner) finds the auth user whose email matches a confirmed request, runs the same pipeline as §3.4(a–f) (no interactive re-auth: mailbox proof + email match replace it), sets `done`/`rejected` and mails the result. Rate limits: 5 requests/hour/IP, 3/day/address.
* Guests have no email; their data deletion is the in-app "Delete my data" (§2.10), stated on the page.

### 3.7 Tests and the coverage guard

* **RPC rollback harness** `scripts/verify-delete-account.mjs` (BEGIN … ROLLBACK, pattern of Appendix A/B): fixtures covering an owner with received recommendations, a contributor with recommendations in two inboxes, a placement in someone else's shared folder, an owned group, ratings on others' nodes; assertions: zero rows left in every table that references the user, other users' counts/averages correct, second call `{already:true}`.
* **Coverage guard (Tier-0 style, DB check DB-22, §8):** at run time the script re-reads the FK list of §3.1 and **fails if a foreign key to `users`/`auth.users` exists that is not in the `delete_account` coverage list**, so a future migration cannot silently re-introduce a blocker. It also fails if any column named like a user reference lacks both an FK and an entry (this is how the unreferenced backup table was found).
* e2e: checkbox required, wrong Google account → nothing deleted, expired proof → `REAUTH_REQUIRED`, Ask link answers "no longer active" afterwards, sent recommendations vanish from the other inbox, session ended.


---

## 4. Guest identity and threat model (D24)

### 4.1 Cookie design (DESIGN)

| Property | Value |
|---|---|
| Name | `__Host-liked_guest` (the `__Host-` prefix forces `Secure`, `Path=/`, no `Domain`) |
| Value | `v1.<contributor_id>.<secret>.<sig>`; `secret` = 32 random bytes, base64url; `sig` = first 16 bytes of `HMAC-SHA256(GUEST_COOKIE_SECRET, "v1." + id + "." + secret)` |
| Attributes | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000` (rolling: re-issued when `last_seen_at` is older than 7 days) |
| Server side | `contributors.secret_hash = sha256(secret)`; the secret itself is never stored |
| Verification (in the route, never in SQL) | (1) parse + length checks, (2) `timingSafeEqual` on `sig` — garbage cookies are rejected **without a database call**, (3) `guest_verify(id)` fetches `secret_hash`, (4) `timingSafeEqual(sha256(secret), secret_hash)` |
| Key rotation | `GUEST_COOKIE_SECRET` plus optional `GUEST_COOKIE_SECRET_PREV` accepted for verification, so rotating does not log every guest out |
| Scope | **one cookie per browser = one contributor** (the friend's name is remembered across owners, PRD §5.1); the Ask token (URL path or request body) selects the owner, so the cookie alone never grants access to any inbox |
| Local storage | none. Guest preferences (language/theme/color) live in separate non-identifying cookies/localStorage and contain no personal data (PRD §10.1) |

**VERIFIED context:** `proxy.ts` calls `supabase.auth.getUser()` on every request but only gates a fixed prefix list (`proxy.ts:43`), so `/r/*` and `/api/ask/*` are already public; the guest cookie is invisible to Supabase. The CSP already sets `form-action 'self'` and `X-Frame-Options: DENY` (`next.config.ts:17-36`).

### 4.2 Token validation

* Ask token = 24 random bytes, base64url (≥ 32 chars, 192 bits; PRD requires ≥ 12). Looked up by equality on a unique index; unknown, disabled, regenerated, or owner-deleted tokens produce the **identical** `404 ASK_NOT_ACTIVE` body and similar latency (single indexed lookup). Regenerating overwrites the stored token, so the old link dies instantly.
* The token travels in the path (`/r/<token>`) and in request bodies; Next's default `Referrer-Policy: strict-origin-when-cross-origin` (VERIFIED in `next.config.ts`) already strips the path for cross-origin requests. `/r/*` pages add `<meta name="referrer" content="no-referrer">` and no third-party scripts except Turnstile.
* Every mutating route requires `Origin` to match the app host and `Content-Type: application/json` (a cross-site form POST cannot produce either), plus the cookie. No CORS headers are ever sent on `/api/ask/*`.

### 4.3 Rate limits (DB-backed via `rl_hit`, §2.11; keys are HMAC/sha256 hashes, raw IPs never stored)

Client IP = first value of `x-forwarded-for`, else `x-real-ip`; Vercel sets these at the edge (the claim that clients cannot spoof them on Vercel is from platform docs and **UNVERIFIED** this pass; the limits are therefore layered per IP, per contributor and per token, so a spoofed IP only defeats the IP layer).

| Bucket | Key | Limit | Purpose |
|---|---|---|---|
| `ask_view` | ip | 120 / 10 min | landing/receipt/picks scraping |
| `ask_token_miss` | ip | **20 / hour** (counted only on `ASK_NOT_ACTIVE`) | token enumeration — at 192 bits entropy brute force is infeasible; this stops probing and noise |
| `ask_session_ip` | ip | 10 / hour | cookie-minting floods (each mint also needs a CAPTCHA) |
| `ask_search_c` / `ask_search_ip` | contributor / ip | 30 / min and 60 / min | TMDB proxy and YouTube cache lookups |
| `ask_resolve_c` | contributor | 30 / min | paste-link resolution (can cost 1 YouTube unit) |
| `ask_submit_c` | contributor | 10 / hour | flooding by one guest (the 100-titles/day cap is separate, in SQL) |
| `ask_submit_token` | ask token | 300 / hour | one leaked/abused link flooding one owner; the owner can disable the link |
| `delreq_ip` | ip | 5 / hour | public deletion form |
| `acct_delete_user` | user | 5 / hour | re-auth/delete endpoints |

On a limit hit the route answers `429` with `Retry-After`; nothing is written. Rate-limit rows older than 2 days are purged daily.

### 4.4 CAPTCHA-or-equivalent (decision proposal)

**Proposal: Cloudflare Turnstile**, verified server-side, **once per cookie mint** (`POST /api/ask/session`), not per request — the friend flow must stay under 30 seconds (PRD §2), and the managed/invisible mode normally shows no challenge. Verification: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response`, `remoteip`. Needs CSP additions (`script-src`, `frame-src`, `connect-src` for `https://challenges.cloudflare.com`; per Cloudflare's documentation, **not re-verified here**) in `next.config.ts` (current `script-src 'self' 'unsafe-inline'`, VERIFIED). Env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. A Cloudflare account is required (UNVERIFIED that one exists).
**Equivalent fallback if Lolo declines a third party:** hashcash-style proof-of-work (client solves a server-issued challenge, ~1 s on mobile) + honeypot field + the same rate limits. Effort S; weaker against determined bots, adequate for a portfolio-scale link. The route is written against an interface (`verifyHuman(request)`) so the provider is an env switch (`CAPTCHA_PROVIDER=turnstile|pow`). **If the secret is missing in production the session route fails closed** (503), never open.

### 4.5 Threat model

| # | Threat / scenario | Mitigation | Test (P0-23) |
|---|---|---|---|
| T1 | **Token enumeration**: guessing `/r/<token>` | 192-bit tokens; identical 404 for unknown/disabled/regenerated; `ask_token_miss` 20/h/IP; no timing difference (one indexed lookup) | 21 bad tokens from one IP → 429; response bodies byte-identical |
| T2 | **Cookie replay of another guest's cookie** | secret never stored (hash only), 256-bit, HttpOnly, Secure, `__Host-`; HMAC reject without DB; a stolen cookie only exposes that guest's own receipt (no other contributor's data exists on any guest path). Rotated on claim. Residual risk (cookie theft = identity theft of that guest) accepted; XSS is the vector, CSP in place | tampered/forged/other-contributor cookie → `CONTRIBUTOR_INVALID`; cookie from guest A cannot read guest B's receipt |
| T3 | **Cross-owner confusion**: guest valid for owner X submits to owner Y's token | the cookie is global but the **token selects the ask**; `owner_id` is derived server-side from the ask and never accepted from the body | body with a foreign `owner_id` is ignored; row's `owner_id` equals the ask owner |
| T4 | **Oversized/malformed submissions** | ≤ 20 items, comment ≤ 280, platform ≤ 60, name 2–50, rating integer 0–100, body size limit 64 KB at the route, `item_id` must already exist | 21 items → 400; 281-char comment → 400; rating 101/-1/1.5 → 400; unknown item → 400; zero rows written on failure |
| T5 | **Daily flood / spam** | 100 titles per 24 h per contributor in SQL; `ask_submit_c`; `ask_submit_token`; CAPTCHA per cookie mint; owner can disable/regenerate the link and block a contributor | 101st title → `DAILY_CAP`; burst of 11 submissions in an hour → 429 |
| T6 | **Cookie-mint flood** (bypassing per-contributor limits by minting many contributors) | CAPTCHA per mint + `ask_session_ip` 10/h | no CAPTCHA → `CAPTCHA_FAILED`; 11th mint/hour/IP → 429 |
| T7 | **Replay of a submission** (double tap, retry, network replay) | `UNIQUE(contributor_id, client_batch_id)`; replay returns the original result, creates no second notification/email | same batch id twice → one submission, one notification |
| T8 | **Catalog poisoning**: guest tries to create items with fake titles | guests never write `items`; ids are minted only by the server after fetching TMDB/YouTube (route-side), format CHECK on `external_id`, `UNIQUE(source,kind,external_id)` | direct call with a fabricated id → `INVALID_ITEM` |
| T9 | **Cross-account claim**: signed-in person on a shared device absorbs another guest's history | claim needs cookie + session **+ `liked_claim_intent` cookie** set by an explicit "Continue with Google" click | visiting `/r/…` while signed in never calls claim |
| T10 | **CSRF** on guest routes | `Origin` check, JSON-only, `SameSite=Lax`, no CORS | cross-origin POST without matching Origin → 403 |
| T11 | **Direct DB access with the publishable key** | RLS on, zero policies, grants revoked from `anon`/`authenticated` on all new tables; functions executable only by `service_role` (class S) | CI probe (P0-06): as `anon` and as `authenticated`, every new table → permission denied or 0 rows; every class-S function → denied |
| T12 | **Secondary use of the TMDB/YouTube proxy** (quota theft by anonymous scraping) | search/resolve need a valid cookie + token; per-contributor/IP limits; cache; budgets (§6.4) | search without cookie → 401 |
| T13 | **Owner harassment by an abusive guest** (offensive names/comments) | owner can remove/block a contributor (PRD §10.1); names are text-only, never rendered as HTML (React escaping); store-time filter + Report action are P3 (D22) | block → `CONTRIBUTOR_BLOCKED`; name `<script>` renders as text |
| T14 | **Account-existence oracle** via the public deletion form / Ask link | generic responses; identical 404 | form returns the same body for known/unknown email |
| T15 | **Open redirect after sign-in** (pre-existing) | see §5.1: the callback concatenates `next` into the redirect URL | e2e: `next=@evil.example`, `//evil.example`, absolute URL → redirected to `/inbox` |
| T16 | **Email abuse** (the owner notification as an amplifier) | one email per submission, only to the owner's own verified address, `ask_submit_*` limits, owner toggle | N/A beyond limits |
| T17 | **Privacy**: IP/PII in the DB | only hashed IP keys (pepper `RATE_LIMIT_PEPPER`); contributors store a self-declared name only; inactive guest purge (§11 D-5) | static check: no `inet`/raw IP column |

**What a guest can read:** the landing data (`guest_get_ask`: owner display name, avatar key, prompt, note, genres); their own submissions/receipt for that owner; owner picks tiered `contributors`/`public` (P1); public catalog data returned by search/resolve. **What a guest cannot read:** any table, any other contributor's name or recommendations, the owner's inbox, status, notifications, folders, email, or id. **What a guest cannot do:** call any RPC (no Supabase session; functions are revoked from `anon`/`authenticated`), write any table, create or modify items, or become a folder member (folder grants reference `users.id`, and guests have no `users` row).

**Shared folders vs guests (PRD §6.6, D23):** folder membership is `folder_grants(grantee_id → users.id)` (VERIFIED, V2-INV A4). A guest has no `users` row, so a guest can never be a grantee or hold an edge. Collaborative visibility among account holders is the existing, unchanged behaviour (VERIFIED B2 simulation in V2-INV: B's item added to A's folder is visible to A).

---

## 5. Auth changes (D25: basic scopes only at sign-in)

### 5.1 Current state (all VERIFIED at `origin/main` `dc2a187`)

| Fact | Evidence |
|---|---|
| Login requests `youtube.readonly` + offline + forced consent | `app/(auth)/login/page.tsx:35-39` (`scopes`, `access_type: "offline"`, `prompt: "consent"`); header comment `:8` "the Google OAuth grant is also the YouTube grant" |
| Signup does the same | `app/(auth)/signup/page.tsx:23-27` |
| Callback persists provider tokens on **every** login | `app/(auth)/callback/route.ts:42-51` → `persistYouTubeConnectionFromSession` |
| The persist helper **overwrites** an existing connection | `lib/youtube/persist-connection.ts:44-66`: `upsert … onConflict: "user_id"` with `access_token` replaced, `token_expires_at = now+3500s`, **`scopes: scope?.split(" ") ?? []` (empty)**, `revoked_at: null`, `last_synced_at: null`; `refresh_token` replaced only if a new one is returned |
| Incremental YouTube connect already exists and is independent | `app/api/youtube/connect/route.ts:47-55` (own OAuth flow, `scope: youtube.readonly`, `access_type: offline`, `prompt: consent`, CSRF `state` cookie, local-path-only `next`); callers `AddSheet.tsx:197`, `YouTubeView.tsx:49,99`, `YouTubeSyncButton.tsx:62` |
| Live connections | `youtube_connections`: 2 rows, 2 active, 2 with refresh token, **both `scopes = {}`** (written by the unified-grant helper), 0 with the scope recorded |
| Stored-token reader refreshes from the refresh token | `lib/youtube/client.ts:85-169` (`revoked_at`, `refresh_token` required; refresh via `grant_type=refresh_token`) — works regardless of how the row was created |
| **Pre-existing open redirect** | `app/(auth)/callback/route.ts:12,54`: `next = searchParams.get("next") ?? "/feed"` then `NextResponse.redirect(`${origin}${next}`)`. Proof: `new URL('https://liked-zeta.vercel.app'+'@evil.example/x').host` → `evil.example` (Node, run today). A link `/callback?code=…&next=@evil.example` redirects the freshly signed-in user off-site. The YouTube connect route already validates `next` (`:10-11`); the callback does not |

### 5.2 File-by-file change list

| File | Change | Notes |
|---|---|---|
| `app/(auth)/login/page.tsx` | delete `scopes:` line and the `access_type`/`prompt: "consent"` query params; fix header comment | Supabase's Google provider then requests only its default OIDC scopes (openid, email, profile). **UNVERIFIED:** the exact default scope string Supabase sends (dashboard/provider config) — probe by reading the consent screen after the change |
| `app/(auth)/signup/page.tsx` | same | |
| `app/(auth)/callback/route.ts` | **remove** the `persistYouTubeConnectionFromSession` call and import (not "gate it") | evidence in §5.1: a basic-scope login would otherwise overwrite a valid YouTube token with a non-YouTube token and blank `scopes`/`last_synced_at`, breaking the 2 live connections. `/api/youtube/connect` becomes the single YouTube write path (single source of truth) |
| `app/(auth)/callback/route.ts` | validate `next`: accept only `^/(?!/)` and no `\`; otherwise `/inbox` (or the configured home) | closes T15; shared helper `lib/auth/safeNext.ts`, also reusable by the connect route |
| `app/(auth)/callback/route.ts` | after session exchange, if `liked_claim_intent` cookie present → `POST` claim (P1, §2.8); copy `user_prefs.language_set_at`-based language into the `LIKED_LOCALE` cookie | |
| `lib/youtube/persist-connection.ts` | keep the file; remove the export's only caller | grep-proof task: no other importer (`grep -rn persistYouTubeConnectionFromSession`) |
| `proxy.ts:43` | add `/inbox` to `isProtectedRoute`; **add nothing for `/r`, `/s`, `/delete-account`, `/api/ask`** (they must stay public) | VERIFIED: current list lacks `/inbox` |
| `app/api/youtube/connect/route.ts` | none (reuse `safeNext` optionally) | already correct |
| `e2e/auth-login.spec.ts`, `auth-signup.spec.ts`, `auth-smoke.spec.ts` | update assertions that expect the YouTube scope / unified grant | `e2e/helpers/auth.ts` `injectSession` bypasses OAuth and is unaffected |
| Comments in `YouTubeView.tsx:16`, `login/page.tsx:8` | rewrite | grep guard: `youtube.readonly` allowed only in `lib/youtube/*` and `app/api/youtube/connect/route.ts` |

### 5.3 Effect on existing users and the YouTube import

| Group | After the change |
|---|---|
| Users with an active `youtube_connections` row (2 today) | unaffected: row, encrypted tokens, refresh token and the twice-daily cron (`vercel.json` `0 6`/`0 18` → `/api/youtube/sync`) keep working; a later login no longer touches the row (removal of the persist call is what guarantees this) |
| Users without a connection | `/api/youtube/status` → `connected:false`; `AddSheet`, `/youtube` and the sync button already send them to `/api/youtube/connect` (incremental consent, VERIFIED callers above) |
| Existing sessions | unchanged; re-login shows only the basic consent |
| Guests | not affected (no Google) |
| New side effect | no more `prompt=consent` + `access_type=offline` on each login, so Google stops minting a new refresh token per login. Google caps refresh tokens per account per client (documented limit, not re-verified here), so the old behaviour could eventually invalidate the oldest token |
| Legacy YouTube features | still depend on `youtube.readonly` via connect (sensitive scope): the consent-screen verification question below applies to **that** path, no longer to sign-in |

**UNVERIFIED:** that the OAuth client used by Supabase's Google provider and the client in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (used by connect/refresh, VERIFIED env key present, value not read) are the same client. Existing refresh tokens were issued by the Supabase flow and are refreshed with the env client (`client.ts:110-115`), which only works if they are the same; a dashboard comparison (Supabase Auth → Google provider client ID vs Google Cloud credentials) confirms it. If they differ, existing users' refresh tokens stop working until they reconnect — a reconnect banner is the mitigation.

### 5.4 Test plan

| Test | Type | Pass criterion |
|---|---|---|
| Authorize URL contains only `openid email profile` (no `youtube`) | e2e (Playwright intercepts the redirect to `accounts.google.com`/Supabase `authorize`; reads `scope`) | scope param has no `youtube` |
| Callback never writes `youtube_connections` | vitest on the route with a mocked session carrying `provider_token` | zero calls to the service client |
| Existing connection survives a login | rollback harness: row snapshot before/after a simulated callback | identical `scopes`, `access_token`, `refresh_token`, `last_synced_at` |
| `next` hardening | vitest table: `@evil.example`, `//evil.example`, `https://evil.example`, `/\evil`, `/inbox?x=1` | only the last passes through |
| `/api/youtube/connect` still works end to end | manual prod check with a test account + existing `youtube-api.spec.ts` | token row created with `scopes` populated |
| Grep guard | `scripts/check-invariants-001.mjs` REPO-18 | `youtube.readonly` only in the two allowed locations |
| Guest unaffected | e2e | `/r/<token>` flow completes with no Supabase cookie |

### 5.5 Google consent-screen requirements (what Lolo must configure; none can be probed from the repo)

| # | Item | Status |
|---|---|---|
| G1 | OAuth consent screen **publishing status = In production** (PRD §9.3). In Testing mode only listed test users can sign in and refresh tokens expire after 7 days | **UNVERIFIED** (Cloud Console only). Note: 25 `users` rows exist, so some sign-in has worked — status unknown |
| G2 | Sign-in scopes = `openid`, `email`, `profile` only (non-sensitive: no Google verification review needed for these alone) | after §5.2 |
| G3 | App name, support email, developer contact, authorized domain(s), **privacy-policy and terms URLs** (the repo has `app/privacy/page.tsx` 338 lines and `app/terms/page.tsx` 202 lines; the privacy page contains **no mention of YouTube**, grep 0 hits, and must be extended for v2: contributors/guests, TMDB, YouTube, JustWatch, retention) | UNVERIFIED which values are set |
| G4 | If a logo or custom branding is added, Google requires app verification (branding review) | UNVERIFIED policy detail, not required for the plan |
| G5 | `youtube.readonly` (sensitive scope) for the **connect** path: while unverified, Google shows the "unverified app" warning and caps users (100 lifetime) | UNVERIFIED current state; **this limit now affects only legacy YouTube import, not sign-in or the friend flow** (a benefit of D25) |
| G6 | Authorized redirect URIs include `<APP_URL>/api/youtube/callback` (connect) and Supabase's `/auth/v1/callback` | UNVERIFIED (existing flows imply they are set) |
| G7 | YouTube Data API v3 enabled on the same Cloud project as the new API key (§6.4) | UNVERIFIED |
| G8 | YouTube API Services terms require a privacy policy that references Google's privacy policy and a way to revoke access | requirement stated in Google's developer policies; **not re-verified in this pass** — checked in task P0-21 |

---

## 6. TMDB and YouTube integration

### 6.1 Evidence and constraints

| Fact | Status | Evidence |
|---|---|---|
| No TMDB code, key or env var exists in the repo | VERIFIED | `.env.local` key names: `ACCESS_TOKEN, ANON_KEY, DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_URL, OPENROUTER_API_KEY, SERVICE_ROLE_KEY, SUPABASE_DB_CONNECTION_LIKED_PROD, SUPABASE_POOLER_CONNECTION_LIKED_PROD, SUPABASE_SECRET_KEY, YOUTUBE_TOKEN_ENCRYPTION_KEY` (names only); `grep -c TMDB .env.local` → 0; no `YOUTUBE_API_KEY`; no `CRON_SECRET` locally (it exists in Vercel per `app/api/youtube/sync/route.ts:17`) |
| TMDB terms (fetched today from themoviedb.org/api-terms-of-use) | VERIFIED | §1.C: must not "**Cache, for longer than 6 months, any information obtained through or from TMDB or the TMDB APIs**"; must not "Use TMDB as an image hosting service for banner advertisements, graphics, etc."; must not "Make derivatives of the TMDB APIs or TMDB Content"; must not use TMDB content for ML/AI training; §2: commercial use needs a written agreement and the listed examples include "charging users a fee" and "operating a website that generates revenue … through recommend content, such as movies, television shows"; §3: TMDB logo + the sentence "This [website, program, service, application, product] uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB." must be shown prominently, with the logo less prominent than the app's own marks |
| CSP `img-src` does not allow `image.tmdb.org`; `connect-src` allows only supabase + `www.googleapis.com` | VERIFIED | `next.config.ts:29,31` |
| `images.remotePatterns`: supabase storage, `i.ytimg.com`, `yt3.ggpht.com` | VERIFIED | `next.config.ts:43-58` |
| YouTube thumbnails for videos can be derived from the id without storing anything; the legacy card detail already does it | VERIFIED | `CardView.tsx:97` renders a stored thumbnail only when `!youtubeVideoId(node.url)` |
| Legacy YouTube client uses the user's OAuth bearer token, no key, cache or guard | VERIFIED | V2-INV E1; `app/api/youtube/search/route.ts:16-30` returns 401 `not_connected` without a stored token |

### 6.2 TMDB proxy routes

* `GET /api/ask/search?q=&src=tmdb|youtube` (guest, cookie + token). TMDB branch: server-side `GET https://api.themoviedb.org/3/search/multi?query=<q>&include_adult=false&language=<viewer tag>&page=1` with `Authorization: Bearer ${TMDB_API_READ_ACCESS_TOKEN}` (v4 read token, **server-only env, never `NEXT_PUBLIC_`**), results filtered to `media_type IN ('movie','tv')`, mapped to `{source:'tmdb', kind: movie|series, external_id, title, year, poster_path, vote_average}`. Typeahead: ≥ 2 chars, 300 ms debounce, `ask_search_c` 30/min.
* **Posters are hotlinks everywhere** (`https://image.tmdb.org/t/p/…` built from the TMDB `poster_path`): search results are not stored, and stored items keep only the path text on `items.poster_path` — no poster bytes are ever copied to our storage or proxied (PRD v2.6 §7; DV-2 vetoed → hotlink). Requires `img-src https://image.tmdb.org` in the CSP and the host in `images.remotePatterns` (small `next.config.ts` change, task P0-11). `poster_path` is TMDB data and stays inside the 6-month refresh rule (§6.5).
* `POST /api/ask/resolve` body `{source,kind,external_id}` (picked result) **or** `{url}` (paste). The server never fetches the user-supplied URL; it only **parses** it against an allowlist:

| Input | Parse | Calls |
|---|---|---|
| `themoviedb.org/(movie|tv)/<id>` | regex → id | 1 TMDB `GET /movie|tv/<id>` (existence + base facts) |
| `imdb.com/title/tt\d+` | regex → imdb id | 1 TMDB `GET /find/<imdb_id>?external_source=imdb_id`; take `movie_results[0]` else `tv_results[0]` |
| YouTube `watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/` | regex → 11-char id | `videos.list?part=snippet,contentDetails&id=` = 1 YouTube unit |
| YouTube `/channel/UC…` | regex → channel id | `channels.list?part=snippet&id=` = 1 unit |
| YouTube `/@handle` | regex | `channels.list?forHandle=` = 1 unit |
| YouTube `/c/<name>` custom URL | — | not resolvable through the API (carried from PLAN-V2-001 F.1; **UNVERIFIED** this pass) → `422 UNSUPPORTED_URL` with the "paste a video link instead" hint |

  The route calls `upsert_item(...)` (§2.11; `INSERT … ON CONFLICT (source,kind,external_id) DO NOTHING`, then returns the row), skipping the provider call when the row exists with `fetched_at` newer than 5 months (TMDB) / 20 days (YouTube), and returns `{item_id, kind, name, year, poster_path|thumb_url}`. All provider data is written server-side only (T8).

### 6.3 `LANGUAGES` config, TMDB tag mapping, CI check, fallback rule

Single config `lib/i18n/languages.ts` (DESIGN), consumed by `i18n/locales.ts`, `app/lib/actions/profile.ts`, the `set_language` migration, the language switcher, the TMDB client and the CI script:

| UI code | Native name | TMDB default tag | Variant rule |
|---|---|---|---|
| `en` | English | `en-US` | — |
| `fr` | Français | `fr-FR` | — |
| `es` | Español | `es-ES` | `es-MX` when the first `Accept-Language` region is Latin-American (`MX, AR, CL, CO, PE, VE, UY, PY, EC, BO, CR, DO, GT, HN, NI, PA, SV, CU, PR, 419`); one Spanish UI catalog (PRD §6.8) |
| `th` | ไทย | `th-TH` | — |

The chosen tag is stored in cookie `LIKED_TMDB_LANG` (guests) and `user_prefs.tmdb_lang` (owners; also the language used for enrichment and `get_inbox`). Changing the UI language resets the tag to that language's default.

**CI check `scripts/check-languages.mjs`** (runs in `.github/workflows/ci.yml`, which today runs `tsc`, `eslint`, `build` only — VERIFIED): (1) calls `GET https://api.themoviedb.org/3/configuration/primary_translations` with the GitHub secret `TMDB_API_READ_ACCESS_TOKEN` and fails if any tag of the config (default tags and variants) is absent from the response; (2) flattens `messages/en|fr|es|th.json` and fails on any missing or extra key; (3) fails if the `user_prefs.tmdb_lang` CHECK list or the `set_language` body differs from the config; (4) greps `i18n/` and `lib/i18n/` for `x-vercel-ip`, `geolocation`, `ip` usage (D17: never IP for language). If the secret is absent the check prints `SKIPPED (UNVERIFIED)` locally and **fails on `main` and on PRs**.

**th-TH / es-MX in `primary_translations` — UNVERIFIED against the real endpoint:** no TMDB key exists in the environment (VERIFIED above), so the endpoint was not called. Secondary evidence only (third-party API reference mirror, `https://starlight.mintlify.app/api-reference/configuration/primary-translations`, fetched in this task) lists `en-US`, `es-ES`, `es-MX`, `fr-FR` and `th-TH` among the returned tags. Thai metadata completeness (title/overview coverage) is also UNVERIFIED; the English fallback will be hit often (PRD §9.9). Task P0-11 runs the live check as soon as the key exists and records the result in `docs/PROGRESS.md`.

**Fallback rule (PRD §6.8), implemented in SQL in the read functions, never at read time via a network call (I-14):**
`display_name = COALESCE(NULLIF(localized->:tag->>'name',''), NULLIF(localized->'en-US'->>'name',''), items.name)`; same for `overview`/`tagline`. The enrichment job requests the selected tag first and requests `en-US` only when the selected tag returns empty fields (+1 TMDB call). Images: `include_image_language=<ui>,en,null`. Genre names come from `tmdb_genres` for the tag with an `en-US` fallback.

### 6.4 YouTube search design (D26)

**Quota facts** (PRD §9.4; Google's quota table, **not re-fetched in this task**): default 10 000 units/day per Cloud **project** (the PRD's "≈ 100 `search.list` calls"); `search.list` = 100 units, `videos.list` = 1, `channels.list` = 1; quota is per project, not per OAuth user; raising it needs a compliance audit; spreading load over several projects is prohibited. The quota day resets at midnight Pacific Time (UNVERIFIED this pass), hence the budget table keys on the Pacific date.

**Shared quota warning (VERIFIED by construction):** the legacy OAuth search/sync already consume the **same project's** quota (V2-INV E1; cron `0 6`, `0 18`), and the legacy consumption is not measured anywhere (UNVERIFIED). The guest budget therefore leaves headroom.

| Budget | Value (env-tunable) | Units |
|---|---|---|
| Global searches per day | `YT_SEARCH_DAILY_GLOBAL = 50` | 5 000 |
| Per-contributor searches per day | `YT_SEARCH_DAILY_PER_CONTRIBUTOR = 5` | ≤ 500 each |
| Resolve/enrich/refresh pool (1 unit each; `videos.list` takes up to 50 ids per call) | `YT_UNITS_DAILY_HARD_CAP = 8 000` total server-key units | 3 000 for non-search calls |
| Headroom for legacy OAuth traffic and growth | ≈ 2 000 | — |

Quota math examples: 50 searches = 5 000 units; a 30-day refresh of N stored videos costs `ceil(N/50)` units per day (1 000 videos ≈ 20 units/day); a paste-link resolve = 1 unit. With the cache a popular query costs 100 units **once per 12 h**.

**Flow (route `GET /api/ask/search?src=youtube&q=…`):**
1. Search runs **on submit only** (Enter / Search button, never typeahead); TMDB search is independent and continues to work.
2. `rl_hit` checks, then normalize the query (`NFKC`, lower-case, trim, collapse spaces) and compute `query_key = sha256(normalized | lang | 'any')`.
3. Cache hit (`expires_at > now()`) → return it; **costs no budget**.
4. Miss → `yt_budget_consume(contributor, 'search')`. `{allowed:false}` → respond `200 {youtube:{status:'busy'}, tmdb:[…]}`; the UI shows "Search is busy — paste a link instead" (PRD §5.2).
5. Allowed → `GET https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=<q>&key=${YOUTUBE_API_KEY}` (public data, API key, no user token). Persist `{ids + display fields}` in `youtube_search_cache` with `expires_at = now() + 12 h`; on HTTP 403/429/5xx cache `{status:'error'}` for 5 minutes (stops hammering) and answer `busy`.
6. Selecting a result needs no further call: the item is created from the cached snippet (title, channel) with `fetched_at = cache.fetched_at`; the `details` job later fills duration/language/category with one batched `videos.list`.

**Env vars (new):** `YOUTUBE_API_KEY` (server only; restrict the key to "YouTube Data API v3" in the Cloud console — an IP restriction is impractical on Vercel's dynamic egress), `YT_SEARCH_DAILY_GLOBAL`, `YT_SEARCH_DAILY_PER_CONTRIBUTOR`, `YT_SEARCH_CACHE_TTL_HOURS`, `YT_UNITS_DAILY_HARD_CAP`.

### 6.5 What is persisted, and the 30-day / 6-month refresh-delete job

| Data | Where | Rule |
|---|---|---|
| YouTube **video/channel ids** | `items.external_id`, `recommendations` via `item_id` | kept indefinitely (ids are allowed) |
| YouTube title, channel title, channel avatar | `items.name`, `creator_name`, `thumb_url` | cached ≤ 30 days; refreshed at **20 days** (10-day margin) or nulled |
| YouTube video thumbnail | **not stored**; derived `https://i.ytimg.com/vi/<id>/hqdefault.jpg` (host already in CSP/`remotePatterns`) | — |
| YouTube search results | `youtube_search_cache` | TTL 12 h, purged daily |
| TMDB text/ratings | `items.*`, `localized` | cached ≤ **6 months**; refreshed at **5 months** or nulled |
| TMDB poster | **not stored** — `items.poster_path` keeps the TMDB path text; cards render `https://image.tmdb.org/t/p/…` hotlinks (PRD v2.6 §7) | `poster_path` is refreshed/nulled with the 5-month TMDB refresh; nothing is copied to the `thumbnails` bucket |
| Promoted YouTube node (P1) | `nodes.title` | the legacy exposure is **not** fixed (D-G out of scope), but the new job also refreshes/clears titles of nodes linked through `node_items` (§11 DV-5) |

**Job: `GET /api/cron/housekeeping`** (daily, `Authorization: Bearer ${CRON_SECRET}`; fits the existing daily-cron pattern in `vercel.json`):
1. **YouTube refresh**: `items` (source youtube) with `fetched_at < now() - interval '20 days'` → batched `videos.list`/`channels.list` (≤ 50 ids per call, ≤ 200 items per run); returned → update fields and `fetched_at`; not returned/private/deleted → `display_status='unavailable'` and `name, creator_name, thumb_url = NULL`.
2. **TMDB refresh**: `items` (source tmdb) with `fetched_at < now() - interval '5 months'` → refetch details for each tag present in `localized` (including `poster_path`); 404 → null the display fields. No poster re-download: posters are hotlinks (§6.5 table).
3. **Unreferenced items**: delete `items` with no `recommendations`, `owner_item_state`, `node_items`, `owner_picks` row and `fetched_at` older than 25 days (YouTube) / 5 months (TMDB) (FKs are RESTRICT, so a referenced item can never be deleted by mistake).
4. `housekeeping_purge()` (cache, rate limits, budgets, finished deletion jobs), resume stuck `account_deletion_jobs` (§3.5), expire `deletion_requests` unconfirmed after 7 days.
5. Inactive guest purge — **decided (§11.2 D-5, PRD v2.6 §10.1): contributors with no activity for 18 months and no claim; implemented in P1-11**, disclosed in the privacy policy.

A test (`P0-22`) fast-forwards `fetched_at` in a rollback transaction and asserts the job leaves **no YouTube display field older than 30 days** (PRD §13 item 15).

### 6.6 Enrichment worker (PRD §7)

* All worker writes use the class-S functions of §2.11 (`item_apply_details`, `item_apply_availability`, `enrichment_finish`, `item_refresh_apply`); no direct table writes (REPO-15).
* Queue `enrichment_jobs` (§1.4); claim with `FOR UPDATE SKIP LOCKED`; retry `run_after = now() + 2^attempts minutes`, 5 attempts then `failed`; all writes idempotent (upserts on unique keys).
* `details` (param = TMDB tag): TMDB `GET /{movie|tv}/{id}?language=<tag>&append_to_response=videos`, fills base columns (first time), `localized[tag]`, genres, documentary flag (genre 99), trailer URL, rating/votes, `poster_path`; `availability` (param = region): `GET /{movie|tv}/{id}/watch/providers` → `item_availability` rows (Stream/Rent/Buy, link, **no prices**) + an `item_availability_fetch` row (so "Not available in {region}" is an explicit state); TTL 7 days.
* Triggers: `after()` in the submit route (VERIFIED available), an opportunistic kick when the owner opens the inbox with stale/pending items (read path stays pure SQL; the kick is a separate server call), and `/api/cron/enrich` every minute **only if the Vercel plan allows it** — the plan is UNVERIFIED (existing crons are daily; Hobby limits crons to once per day). On Hobby the worker runs from `after()` and the kicks; the PRD metric "≥ 90 % enriched within 60 s" (§11) is a hypothesis, not a §13 criterion, and is measured, not guaranteed.
* Skeleton cards: `enrichment_status = 'pending'` renders the title placeholder from the original `items.name` when known (resolve already fetched base facts), so cards are never blank.
* Attribution: Credits screen with the official TMDB logo (less prominent than the LIKED mark) and the exact notice sentence above, plus the official JustWatch logo and "Streaming availability data is provided by JustWatch." (PRD §6.9). **Commercial-use risk:** TMDB treats fee-charging or revenue-generating recommendation apps as commercial use needing a written agreement (VERIFIED terms text above) — acceptable for the portfolio build; **blocks monetisation and affects store pricing/ads (P3)**.

---

## 7. i18n and theming P0 foundations

### 7.1 Current state (VERIFIED at `dc2a187`)

| Fact | Evidence |
|---|---|
| Supported locales are hard-coded in three unrelated places | `i18n/locales.ts:2` (`["en","fr","th"]`), `app/lib/actions/profile.ts:176` (`['en','fr','th']`), SQL `set_language` (`NOT IN ('en','fr','th')`) |
| Locale = cookie `LIKED_LOCALE` only; otherwise English. No `Accept-Language` handling | `i18n/request.ts` (reads `cookies()`, falls back to `DEFAULT_LOCALE`); comment: the profile language is synced into the cookie by `setLocaleAction` (`app/lib/actions/mvp2.ts:591-598`, which also calls `set_language`) |
| `<html lang>` already follows the locale | `app/layout.tsx:68-72` (`getLocale()`) |
| Catalogs | `messages/en.json`, `fr.json`, `th.json`: 216 leaf keys each (counted today) → parity holds; no `es.json` |
| Fonts | `app/layout.tsx` loads `inter`, `fraunces`, `caveat` through `next/font` (self-hosted; CSP `font-src 'self'`) — none covers Thai glyphs (UNVERIFIED how the system fallback renders) |
| Theme | tokens in `app/globals.css` (`:root` dark default, `[data-theme="dark"]` line 152, `[data-theme="light"]` lines 221/240); applied **client-side after hydration** by `app/(app)/_components/ThemeSync.tsx` from `localStorage` key `liked.theme` (so the `(app)` group can flash the wrong theme); legacy accent `--accent: #ff3b30` (`globals.css:58`), 3.55:1 against white (computed today) |
| Hard-coded colours | 81 hex literals in `app/globals.css`; 7 `.tsx` files under `app/`/`components/` contain `#rrggbb` literals (grep) |

### 7.2 i18n plan (DESIGN)

1. **Single config** `lib/i18n/languages.ts` (§6.3) replaces the three lists; `set_language` is re-created from it in a migration; CI check (§6.3) keeps them aligned.
2. **Default language, first match wins (PRD D17):** (1) saved choice — cookie `LIKED_LOCALE`, which is written at explicit choice and, for signed-in users, at login from `user_prefs` when `language_set_at IS NOT NULL` (keeps `i18n/request.ts` free of any per-render DB call, as today); (2) `Accept-Language`: parse comma list with `q` values (default 1, ignore `q=0` and `*`), take each tag's primary subtag in descending q order, first one in `LANGUAGES` wins; (3) English. Table-driven unit tests = the PRD §13 cases: `fr-FR,en;q=0.5` → `fr`; `de-DE` → `en`; `th` → `th`; `en,fr;q=0.9` → `en`; saved choice always wins; `es-MX` → `es` + tag `es-MX`.
3. **IP is never used for language.** The only IP-derived value is the suggested streaming region at first run (`x-vercel-ip-country`, platform header, UNVERIFIED), written to `user_prefs.region_code` only after the owner sees it. Guard: the CI grep in §6.3.
4. **No redirects, no URL prefixes** (cookie-based already). `<html lang>` and the TMDB `language` parameter follow the selection; server-rendered pages are dynamic (they read `cookies()`/`headers()`), so they naturally vary per viewer.
5. **Switcher** (guest: globe + code on the landing; owner: Settings): a server action sets `LIKED_LOCALE` (+ `LIKED_TMDB_LANG`) and, for owners, calls `set_language` (extended) → `router.refresh()`; no full page reload. Hint text from PRD §6.8.
6. **`es` catalog:** machine-draft from `en.json` plus the new v2 keys, reviewed by Lolo (FR/ES) and by an **external native Thai reviewer** (PRD §9.7; blocker for release, not for P0 start). ICU plurals via `next-intl` (installed 4.14.7, VERIFIED in V2-INV F2); Thai uses only the `other` branch.
7. **Thai font:** add a self-hosted Thai-capable family through `next/font` (e.g. Noto Sans Thai) as a fallback in the font stack; no CSP change needed (`font-src 'self'`). Layout rule: no fixed widths on text containers, `overflow-wrap: anywhere` on user text; verified by a Playwright check at 360 px in all four languages that no key element has `scrollWidth > clientWidth` (PRD §13 item 20).
8. **Not translated:** owner prompt/note, friend comments, names, platform names (displayed as written). Only UI strings are ours; TMDB provides titles/overviews/genre names in the selected tag (D18).
9. **New-code guard:** ESLint `react/jsx-no-literals` (or equivalent) scoped by glob to the new v2 directories only (`app/inbox`, `app/r`, `app/settings`, `app/delete-account`, `components/v2`), so legacy files do not generate noise; plus the key-parity script.
10. **Legacy coexistence:** `es` is added to the legacy catalogs too (the `LOCALES` list is shared); legacy screens keep their existing 216 keys. Behaviour change for existing users with no cookie: they now get the browser language instead of unconditional English (they all stored `en`, VERIFIED, so none of them made an explicit choice that is overridden).

### 7.3 Theming plan (DESIGN)

* **Token layer:** new `app/v2-tokens.css`, scoped under `[data-ui="v2"]` (set on the wrapper of the new route groups), defining `--v2-bg`, `--v2-surface`, `--v2-text`, `--v2-text-muted`, `--v2-border`, `--v2-accent`, `--v2-on-accent`, plus ring/score colours. Legacy pages keep `globals.css` and their red `--accent` untouched, so the two UIs coexist without regressions (UIX plan "frozen files" discipline).
* **Light/dark/system without flash:** the root layout (already dynamic) reads cookies `LIKED_THEME` (`light|dark|system`, default `system`) and `LIKED_ACCENT` and writes `data-theme`/`data-accent` on `<html>` on the **server**; `system` is resolved in pure CSS (`@media (prefers-color-scheme: dark)` on `html[data-theme="system"]`). Result: dark OS ⇒ dark first paint with no script and no flash (PRD §13 item 26). Owners: `user_prefs` is copied to the cookies at login and on every change; guests: cookies only (device-local, no personal data).
* **Single source of truth:** the legacy `ThemeSync.tsx` (client, `localStorage`) would fight the cookie, so task P0-10 changes it to read/write the same `LIKED_THEME` cookie. It is the only legacy file touched.
* **Presets and contrast (computed today with the WCAG 2.1 relative-luminance formula; proposed values, DESIGN):**

| Preset | Light accent | White text on it (≥ 4.5) | vs `#FFFFFF` (UI ≥ 3) | Dark accent | `#111111` text on it (≥ 4.5) | vs dark bg `#0A0A12` (UI ≥ 3) |
|---|---|---|---|---|---|---|
| **Orange (default)** | `#C2410C` | **5.18** | 5.18 | `#FF9552` | **8.70** (white would be 2.17: fails) | 9.08 |
| Blue | `#1D4ED8` | 6.70 | 6.70 | `#60A5FA` | 7.43 | 7.76 |
| Violet | `#6D28D9` | 7.10 | 7.10 | `#A78BFA` | 6.94 | 7.25 |
| Teal | `#0F766E` | 5.47 | 5.47 | `#2DD4BF` | 10.14 | 10.59 |
| Green | `#15803D` | 5.02 | 5.02 | `#4ADE80` | 10.84 | 11.32 |
| Pink | `#BE185D` | 6.04 | 6.04 | `#F472B6` | 7.13 | 7.44 |

  All 12 combinations pass; `#C2410C` / `#FF9552` match PRD §9.8. Also computed: light accent on the light surface `#F2F2F6` ≥ 4.49 for every preset (green is the lowest at 4.49, still ≥ 3 for UI use), dark accent on `#14141E` ≥ 6.72.
* **Custom colour:** input `#RRGGBB` (validated by the `user_prefs.accent` CHECK); `lib/theme/contrast.ts` picks `on-accent` = white or `#111111`, whichever contrasts more; if the best ratio is < 4.5 it steps the HSL lightness (darker in light theme, lighter in dark theme) by 2 % until ≥ 4.5 **and** ≥ 3:1 against the surface. The same function is used by the UI and by CI.
* **CI `scripts/check-contrast.mjs`:** asserts the 12 preset pairs above and runs 1 000 random custom colours through the adjust function, failing if any output is below 4.5 (text) or 3 (UI) in either theme.
* **No hard-coded colours/strings in new code (REPO-17):** grep for `#[0-9A-Fa-f]{3,8}\b` over the new directories fails the build; allowed only in `app/v2-tokens.css` and `lib/theme/*`.
* **Coexistence summary:** new routes `/r/*`, `/inbox/*`, `/delete-account`, `/s/*` use the v2 layout and tokens; `(app)` routes (`/feed`, `/folders`, `/friends`, …) keep the legacy chrome until the P2 restyle; the Library screens reached from v2 (P1) are the legacy screens (PRD §6.6).

---

## 8. Task breakdown

**Conventions.** Size S ≤ ½ day, M ≈ 1–2 days, L ≈ 3–5 days of focused work (relative, not a delivery promise). **Mode:** `AUTO` = may run as an autonomous batch under the executor rules (single file/function per sub-step, grep/tsc/lint/build proof, no judgement calls); `REVIEW` = must pass CTO review before it merges or before anything is applied to the database (security, auth, destructive, schema, legal). Every migration task: DDL audited **before** apply (PRD §8), applied with `scripts/apply-migration.mjs` (records its `schema_migrations` row), followed by verbatim `pg_proc`/`pg_policies`/`information_schema.role_table_grants` output in the task report. Every code task: `tsc --noEmit` = 0, `eslint` = 0, `npm run build` passes. **Migration PRs:** merging a PR that contains `supabase/migrations/*` to main applies it to the live database — CONFIRMED in V2-W1A-CLOSEOUT-001 (observed in V2-W1A-APPLY-001): the `supabase` GitHub App runs migrations on merge to main. The DDL audit therefore happens BEFORE merge; do not run `scripts/apply-migration.mjs` after merging.

**LINKS-PAUSE (Lolo, 2026-11-22):** the original LIKED link-management product is PAUSED, not removed. The marketing pitch pivots to the Recommendation Inbox. No task may delete or drop existing link-management routes, components, tables, RPCs, translations or tests. Hiding behind a flag or nav change is allowed only if reversible in one commit. Link work will be reinstated later.

**Tier-0 / verification scripts introduced (extend `scripts/check-invariants-001.mjs`; the ids below continue its existing numbering — DB-1…DB-19 and REPO-8…REPO-15 are already taken):**

| ID | Check | Type |
|---|---|---|
| DB-20 | every v2 table: `relrowsecurity = true`, **zero** rows in `pg_policies`, **no** privileges for `anon`/`authenticated` (`information_schema.role_table_grants`) | DB |
| DB-21 | every v2 function: `SECURITY DEFINER`, `proconfig` contains `search_path`, `proacl` has no `PUBLIC`/`anon`; class S has no `authenticated`; unauthenticated call → `42501` | DB |
| DB-22 | `delete_account` FK-coverage guard (§3.7): every FK to `users`/`auth.users` and every unreferenced user-uuid column is in the covered list | DB |
| DB-23 | no `INSERT/UPDATE/DELETE` on `edges`, `causes`, `folder_edges` inside any v2 function except via `import_url`, `add_node_to_folder`, `remove_node_from_folder`, cause deletion in `delete_account` (grep of `pg_get_functiondef`) | DB |
| REPO-16 | `app/api/ask/**` and `lib/ask/**`: guest functions are called only through `getSupabaseServiceClient()` and only after `verifyGuest`/token validation; no guest function name appears in client components | REPO |
| REPO-17 | no hex colour literal or hard-coded user-visible string in the new v2 directories (§7.3, §7.2) | REPO |
| REPO-18 | `youtube.readonly` appears only in `lib/youtube/*` and `app/api/youtube/connect/route.ts`; `persistYouTubeConnectionFromSession` has zero importers | REPO |
| REPO-19 | no IP/geo header read in `i18n/**` or `lib/i18n/**` | REPO |
| REPO-15 (existing) | extend its `domainWriteRe` table list (`scripts/check-invariants-001.mjs:290`, VERIFIED) with every v2 table, so app code can reach them **only through RPCs** | REPO |
| `check-languages` / `check-contrast` | §6.3 / §7.3 | CI |
| `verify-v2-security` | anon/authenticated probes per table and function (T11), run in BEGIN … ROLLBACK | CI + manual |

### 8.1 P0 tasks

| ID | Title and scope | Depends | Acceptance (binary) | Tests / checks | Size | Mode |
|---|---|---|---|---|---|---|
| **P0-01** | Migration 142: `user_prefs`, `contributors`, `asks`, `items`, `item_availability`, `item_availability_fetch`, `tmdb_genres`, `submissions`, `recommendations`, `owner_item_state`, `owner_contributor_blocks` + §1.3 grants/RLS block + ledger row | — | verbatim `\d` for each table; `pg_policies` returns 0 rows for them; `role_table_grants` shows no `anon`/`authenticated`; UNIQUEs/CHECKs present; migration number = live max + 1 | DB-20 | L | REVIEW |
| **P0-02** | Migration 143: `node_items`, `enrichment_jobs`, `email_outbox`, `rate_limits`, `youtube_search_cache`, `youtube_search_budget`, `account_deletion_jobs`, `deletion_requests` + infra/worker functions `rl_hit`, `yt_budget_consume`, `enrichment_claim`, `enrichment_finish`, `item_apply_details`, `item_apply_availability`, `item_refresh_apply`, `housekeeping_purge` | P0-01 | same evidence; `rl_hit` unit test: 11th call in window returns false; `enrichment_claim` concurrency test (two sessions never get the same row) | DB-20, DB-21; RPC authz test | M | REVIEW |
| **P0-03** | Migration 144 (class S): `guest_get_ask`, `guest_create_contributor`, `guest_rename`, `guest_touch`, `guest_verify`, `submit_recommendations`, `guest_get_receipt`, `delete_guest_data`, `upsert_item` | P0-01, P0-02 | `proacl` has only `service_role`; call as `authenticated`/`anon` → `42501`; rollback test: 1 valid + 1 invalid item → zero rows in `submissions`/`recommendations`/`notifications`/`enrichment_jobs`/`email_outbox`; same batch id twice → 1 submission, 1 notification | DB-21, DB-23; vitest RPC-shape tests; rollback harness | L | REVIEW |
| **P0-04** | Migration 145 (class O): `ensure_my_ask`, `get_my_ask`, `regenerate_my_ask`, `set_ask_active`, `update_ask_settings`, `get_inbox`, `get_friend_rail`, `mark_friend_seen`, `get_my_prefs`, `set_my_prefs`, re-created `set_language` (adds `es`, writes `language_set_at`), `enqueue_stale_enrichment` | P0-01 | `authenticated` EXECUTE only (+service); no owner/user-id parameter; two contributors + same item → one card with `recommender_count = 2`; `all_unseen` = sum; `mark_friend_seen` reduces `all_unseen` by exactly `cleared_recommendations`; token regeneration kills the old token | DB-21; RPC authz test (user B cannot read user A's inbox: B's call returns B's data only); rollback harness | L | REVIEW |
| **P0-05** | Migration 146: `delete_account(p_user_id, p_email)` per §3.2 + coverage list | P0-01, P0-02 | rollback harness on 2 real accounts (like Appendix A) leaves zero residue; placement scenario (Appendix B) passes; second call `{already:true}`; includes inbox fixtures | DB-22, DB-23; `verify-delete-account.mjs` | L | REVIEW |
| **P0-06** | Security/Tier-0 scripts: DB-20..23, REPO-16..19, `verify-v2-security.mjs` | P0-01..05 (DB parts); REPO parts can start earlier | script exits 0 on the final state; seeded violations (a table with a policy, a function granted to `anon`) make it fail | itself | M | AUTO (scripts), REVIEW (thresholds) |
| **P0-07** | **Auth (D25):** remove scopes/offline/consent from `login` + `signup`; remove `persistYouTubeConnectionFromSession` call; `safeNext` in callback; `/inbox` in `proxy.ts`; update 3 e2e specs | — | §5.4 table all green; `grep` guard REPO-18 | vitest (callback, `safeNext`), e2e (authorize URL scope), rollback snapshot test | M | REVIEW (auth) |
| **P0-08** | `lib/ask/*`: cookie sign/verify, Origin/JSON guard, IP hashing, `rl` wrapper, `verifyHuman` interface (Turnstile + PoW), error mapping; v2 route-group skeleton with `data-ui="v2"` layout | P0-02, P0-03 | forged/tampered cookie rejected with **zero** DB calls (spy); `timingSafeEqual` used; production without `TURNSTILE_SECRET_KEY` → 503 | vitest unit tests; REPO-16 | M | REVIEW (security) |
| **P0-09** | **i18n foundation:** `lib/i18n/languages.ts`; `i18n/request.ts` with `Accept-Language`; `es.json` drafts + new v2 keys; Thai font; switcher server action; ESLint literals rule (v2 dirs); `check-languages.mjs` | — | PRD §13 items 17–19 table tests pass; key parity en/fr/es/th; the three hard-coded lists are gone (grep) | vitest (negotiation table), REPO-19, `check-languages` | L | AUTO + REVIEW of catalogs |
| **P0-10** | **Theme foundation:** `app/v2-tokens.css`, cookie-based SSR `data-theme`/`data-accent`, `ThemeSync` → cookie, `lib/theme/contrast.ts`, `check-contrast.mjs` | — | dark OS first paint with no light flash (Playwright `emulateMedia` + screenshot at first paint); 12 preset pairs + 1 000 random colours pass; REPO-17 | e2e, `check-contrast` | M | AUTO |
| **P0-11** | **TMDB:** `lib/tmdb/*`, `/api/ask/search` (TMDB branch), `/api/ask/resolve` (TMDB/IMDb), genre sync, CSP + `remotePatterns`, `scripts/tmdb-th-check.mjs` (provider coverage ≥ 20 titles for TH) and the live `primary_translations` check | P0-03, P0-08, L-TMDB | search returns movies+series in the viewer tag; `fr-FR` request carries `language=fr-FR` (request log); IMDb URL resolves; key absent from client bundle (grep) | vitest with mocked TMDB; live scripts record results in `PROGRESS` | L | REVIEW |
| **P0-12** | **YouTube guarded search/resolve:** `lib/youtube/serverKey.ts`, cache, budgets, `/api/ask/search` (YT branch), resolve for video/channel URLs | P0-02, P0-03, P0-08, L-YT | repeated identical query = 1 upstream call; global/per-contributor exhaustion → `{status:'busy'}` and TMDB still works; no user OAuth needed | vitest with mocked fetch; budget race test (parallel requests never exceed cap) | L | REVIEW |
| **P0-13** | `/api/ask/session`, `/r/[token]` landing (server component), name field, Turnstile component, cookie mint | P0-03, P0-08, L-CAPTCHA | no Supabase cookie ever set on `/r/*` (PRD §13 item 1); invalid token → identical 404; 11th mint/h/IP → 429 | e2e (cookie jar assertion), T1/T6 tests | M | REVIEW |
| **P0-14** | **Friend UI:** add screen (search, tray, Paste row), details with score slider (a11y), `Send to {owner} (N titles)`, single after-submit screen with receipt, language/appearance sheet | P0-09..P0-13 | slider: keyboard + `aria-valuetext`; untouched = null, 0 = 0, Clear = null; receipt shows only own data; 360 px no clipping in 4 languages | e2e (axe + keyboard), Playwright width checks | L | AUTO + REVIEW (UX sign-off) |
| **P0-15** | **Enrichment worker:** `lib/enrich/processJobs`, TMDB details/availability, YouTube details, `after()` kicks, `/api/cron/enrich`, skeleton→complete transitions | P0-02, P0-11 | job states pending→partial→complete; failed path retries ≤ 5; submit latency unaffected (no provider call in the request) | vitest + timed e2e | L | REVIEW |
| **P0-16** | **Owner inbox UI** `/inbox`: cards (ring, avatars, quote, chips, platforms, skeletons), detail sheet (two rings, trailer, Stream/Rent/Buy), share bar (copy/share, regenerate, disable), `ensure_my_ask` on first load, v2 home switch | P0-04, P0-15, P0-09, P0-10 | two friends, same TMDB title → one card with two recommenders; "In library" marker hidden in P0; Friends/TMDB rings separate and unblended; no TMDB logo/colours/wording in score UI | e2e (two guest sessions + owner) | L | AUTO + REVIEW (design) |
| **P0-17** | **Friend rail:** avatars, ring, count badge, All sum, single-select, mark-seen on open | P0-16 | PRD §13 item 8 exactly | e2e | M | AUTO |
| **P0-18** | **Notifications:** `recommendation_received` case in `NotificationsView.tsx` (+ i18n key); email sender (Resend) draining `email_outbox`; owner toggle | P0-03, L-EMAIL | one notification per submission; outbox row only when `notify_email`; sender idempotent; unread count via existing `get_unread_notification_count` | vitest; manual send | M | AUTO |
| **P0-19** | **Settings + Credits + Sign out:** all §6.9 groups (language works; theme/colour rows hidden until P1), region suggestion, email toggle, version footer, Credits (official TMDB/JustWatch logos + exact notice) | P0-04, P0-09, P0-10 | every row works; Sign out ends this device's session only and deletes nothing | e2e | M | AUTO + REVIEW (legal wording) |
| **P0-20** | **Account/guest deletion:** reauth routes, `/api/account/delete`, Storage purge, ledger resume, Delete sheet (checkbox), `/account-deleted`, guest "Delete my data", public `/delete-account` + `deletion_requests` routes + `scripts/process-deletion-requests.mjs` | P0-05, P0-08, P0-19 | §3.7 e2e list; wrong Google account → nothing deleted; proof expiry → `REAUTH_REQUIRED`; Ask link → "no longer active"; the delete sheet lists owned groups, chat messages and direct chats | e2e with a throw-away account; rollback harness | L | REVIEW (destructive) |
| **P0-21** | Privacy policy + Terms updates (guests/contributors, TMDB, YouTube/Google privacy policy reference, JustWatch, retention, backups ≤ provider retention, deletion paths); footer + Settings links | P0-03, P0-05, P0-11, P0-15, P0-19, P0-20, P0-22 | pages reachable from Settings and landing footer; mentions every third party above; the privacy policy lists owned groups, chat messages and direct chats; the policy states NO retention, purge, deletion path, data collection or third-party behavior that is not shipped: a claim-vs-implementation table has every row IMPLEMENTED (format of CTO review V2-W1B-P0-21-REVIEW-001 §2d) | e2e link check | M | REVIEW (legal) |
| **P0-22** | **Housekeeping cron** §6.5 | P0-02, P0-11, P0-12, P0-15 | after fast-forwarding `fetched_at` by 31 days no YouTube display field older than 30 days remains; TMDB 6-month purge likewise; stuck deletion jobs resume | vitest + rollback harness | M | REVIEW |
| **P0-23** | **Threat-model test suite** T1–T17 (automatable subset) | P0-13, P0-14 | all listed tests green (PRD §13 item 13) | vitest route tests + e2e | M | AUTO |
| **P0-24** | **e2e v2 suite:** guest flow, merge, rail, owner inbox, settings, delete account, language cases, dark first paint, YouTube budget degradation | all UI tasks | `npx playwright test` v2 specs green on CI | e2e | L | AUTO |
| **P0-25** | CI wiring (add `vitest run`, `check-*` scripts, GitHub secrets list) + `docs/PROGRESS.md` rows | — | `ci.yml` runs them; secrets documented | CI | S | AUTO |

Dependency waves: **W0** Lolo manual steps (§10) → **W1** P0-01, P0-02, P0-07, P0-09, P0-10, P0-25 (parallel) → **W2** P0-03, P0-04, P0-05, P0-06 → **W3** P0-08, P0-11, P0-12, P0-13 → **W4** P0-14, P0-15, P0-16, P0-18 → **W5** P0-17, P0-19, P0-20, P0-22 → **W6** P0-23, P0-24 then **P0-21 launch gate** (after W5; legal review). Review gates: every migration (P0-01..05), P0-07, P0-08, P0-11, P0-12, P0-13, P0-15, P0-20, P0-21, P0-22.

### 8.2 P1 tasks

| ID | Title and scope | Depends | Acceptance | Size | Mode |
|---|---|---|---|---|---|
| **P1-01** | Watched / Dismissed actions (`set_item_status`) + tabs with counts un-hidden | P0-16 | status persists; dismissed not resurrected; "recommended again" marker only in Dismissed | M | AUTO |
| **P1-02** | Filters sheet + sort inside the sheet over `get_inbox` | P0-16 | OR within category, AND across, rail ANDs; filter badge counts categories (sort excluded) | M | AUTO |
| **P1-03** | Owner note (≤ 140) + genre picker (≤ 5 from `tmdb_genres`) + landing read-only tags | P0-04, P0-11 | 6th genre blocked (UI and RPC); landing shows them | M | AUTO |
| **P1-04** | Migration 147 (`owner_picks`, `share_links` + RPCs; `node_items` already exists from migration 143) + pick designation control + `/s/[token]` + "Want to see {owner}'s picks?" block | P0-04, P0-13 | block absent when no visible picks; tiers behave as §2.9; public link read-only and revocable; guests never read `nodes` | L | REVIEW; **UI for pick designation not designed (PRD §6.6) → needs design first** |
| **P1-05** | `promote_recommendation` + "Add to my library" sheet | P1-04 | atomic; "In library" marker; promoting twice idempotent; duplicate URL path works. Promoted YouTube nodes: `translations` rows (title/description) for the node are cleared or refreshed together with `nodes.title` (item_refresh_apply today only updates `nodes.title`); a Library card with `title = NULL` renders safely in get_feed and the card UI (U14). Promoted TMDB cards: the Library UI renders `thumbnail_key`, which is NULL for them; P1-05 must define how the poster is shown (design pending). | L | REVIEW; **sheet not designed (PRD §6.2/§6.6) → BLOCKED until design** |
| **P1-06** | Library sharing reachable from v2 (links into the legacy `/folders`, `/friends` screens) + e2e of the collaborative-folder rule | P1-05 | member with `contribute` adds → every member sees it; Ask-link guests never gain folder access | M | AUTO |
| **P1-07** | `claim_guest` + "Continue with Google" + intent cookie + own Ask link by default | P0-13, P0-07 | claim into new and into an existing account keeps all submissions; shared-device case does not auto-claim | L | REVIEW |
| **P1-08** | Edit/remove own recommendations (guest) + owner remove/block contributor | P0-14, P0-16 | edit = latest wins; block → `CONTRIBUTOR_BLOCKED` | M | AUTO |
| **P1-09** | Theme and primary-colour controls (Settings + landing sheet), custom colour | P0-10, P0-19 | persists (cookie for guests, `user_prefs` for owners, copied on claim); all presets pass contrast | M | AUTO |
| **P1-10** | Re-enrichment on language change | P0-15 | after changing language new enrichment stores `localized[newTag]`, existing items re-enriched in background | S | AUTO |
| **P1-11** | Guest retention purge (D-5 / PRD v2.6 §10.1): contributors inactive 18 months with no claim are purged; disclosed in the privacy policy | P0-02, P0-20 | purge removes only contributors with `last_seen_at` older than 18 months AND `claimed_by_user_id IS NULL`; claimed contributors and all owners untouched; privacy policy states the 18-month guest retention | S | REVIEW |

### 8.3 PRD §13 → task map (every item)

| # | PRD §13 acceptance item | Task(s) | Verified by |
|---|---|---|---|
| 1 | Guest opens `/r/{token}`, name, ≥ 1 title, submit, no Supabase session | P0-13, P0-14 | e2e asserting no `sb-*` cookie |
| 2 | Submission = one atomic RPC; rollback leaves no partial rows | P0-03 | rollback harness |
| 3 | Two friends, same TMDB title → ONE card, two recommenders | P0-04, P0-16 | SQL test + e2e |
| 4 | Re-adding same title by same contributor = no duplicate | P0-03 | `ON CONFLICT` test |
| 5 | Score 0–100 (step 5), tooltip, null/0/Clear semantics, server range check, accessible slider | P0-03 (range), P0-14 (UI) | RPC test (101, -1, 1.5) + axe/keyboard e2e |
| 6 | Card ring + rater count; detail Friends/TMDB rings; no TMDB branding in score UI | P0-16 | e2e + REPO-17 |
| 7 | Owner gets email and in-app unread per submission | P0-03, P0-18 | notification + outbox assertions |
| 8 | Friend rail: ring, per-friend badge, All = sum, open clears, tap/untap | P0-04, P0-17 | e2e + SQL |
| 9 | Quote rules; status tabs with counts; To watch count = default list | P0-04, P0-16 | SQL + e2e |
| 10 | Receipt = exactly what the guest sent, nothing from others | P0-03, P0-14 | two-guest e2e |
| 11 | Skeleton cards; enrichment non-blocking | P0-15, P0-16 | timed e2e |
| 12 | No guest table/RPC access; RLS on all new tables, no `anon` policy | P0-01..03, P0-06 | DB-20/21, T11 probe |
| 13 | Rate limits + abuse control on every `/api/ask/*`; threat-model tests | P0-08, P0-13, P0-23 | T1–T17 suite |
| 14 | YouTube guest search via server key; cache; budgets; "paste a link" degradation | P0-12 | budget/race tests |
| 15 | No YouTube data > 30 days; ids only | P0-12, P0-22 | fast-forward test |
| 16 | Sign-in requests only openid/email/profile; YouTube import still works | P0-07 | e2e scope + snapshot test |
| 17 | Language first-render cases | P0-09 | negotiation table tests |
| 18 | Switching updates strings instantly, persists, changes TMDB `language` | P0-09, P0-11 | request-log assertion |
| 19 | Single config; CI fails on missing TMDB tag or key; fallback never empty | P0-09, P0-11 | `check-languages`, fallback SQL test |
| 20 | Prompt/note/comments as written; Thai font; no clipping at 360 px | P0-09, P0-14 | Playwright width checks |
| 21 | Settings groups work; Sign out ends this device only | P0-19 | e2e |
| 22 | Delete account (checkbox, fresh re-auth, everything removed, Ask link inactive, sent recs vanish, folder rule, email, idempotent) | P0-05, P0-20 | rollback harness + e2e |
| 23 | Guest "Delete my data" | P0-03, P0-20 | e2e |
| 24 | `/delete-account` public; email path creates `deletion_requests`; Privacy/Terms reachable | P0-20, P0-21 | e2e |
| 25 | TMDB + JustWatch attribution (official logos + wording) | P0-19 | e2e text/logo assertion |
| 26 | No hard-coded hex/strings in new code; dark first paint | P0-09, P0-10 | REPO-17, e2e |
| P1-a | Note + ≤ 5 genres, 6th blocked | P1-03 | e2e |
| P1-b | Picks block absent when none; tiers; public link read-only + revocable | P1-04 | e2e + T-tests |
| P1-c | Promote atomic, nested folder, "In library", idempotent | P1-05 | rollback harness |
| P1-d | Shared-folder collaborative rule; guests never gain folder access | P1-06 | e2e |
| P1-e | Theme/colour persist (device vs profile, copied on claim); default Orange; presets pass contrast | P1-09, P0-10 | e2e + `check-contrast` |
| P1-f | Re-enrichment after language change | P1-10 | job assertion |
| P1-g | Claim incl. existing Google account keeps all submissions | P1-07 | rollback harness |

---

## 9. P3 store outline (prerequisites, risks, spikes only — D28)

**Starting facts (VERIFIED unless marked).** No PWA manifest, service worker, Capacitor/Cordova/Expo config or iOS/Android project exists (V2-INV F1). `next.config.ts` has **no** `output` key — no static export (re-read today). Next `16.3.8`, `@supabase/ssr 0.10.2`, `next-intl 4.14.7` (V2-INV F2). Auth is cookie-based: `proxy.ts`, `getSupabaseServerClient`, `/callback` code exchange, `yt_oauth_state`/`yt_oauth_next` cookies (V2-INV F3). A bearer-token precedent exists for the Chrome extension: `lib/supabase/bearer.ts` (read today). v2 adds the `__Host-liked_guest` cookie (§4.1).

| Topic | Prerequisites / facts | Risk | Spike (exit criterion) |
|---|---|---|---|
| **macOS build path** | Devin Cloud is Linux (PRD §10.3). Needs Xcode: a Mac, Xcode Cloud, or a hosted-Mac CI; plus an Apple Developer Program membership and App Store Connect access. Costs/availability: UNVERIFIED | no signed binary can be produced without it | **S1:** produce a signed archive from the chosen path and upload a build to TestFlight |
| **WebView shell** | Server-rendered Next app (no static export) ⇒ the shell must load the hosted origin (e.g. Capacitor-style `server.url`) or ship a native UI. A pure remote-URL wrapper is exactly the "thin website wrapper" pattern Apple 4.2 rejects (PRD §10.3). Cookies live in the WebView store: `Secure`/`__Host-` cookies are fine on a real HTTPS origin. Any Capacitor-style plugin for the Share Extension: **no maintained plugin verified (PRD)** | rejection under 4.2; session handoff complexity | **S2:** hosted-origin shell loads `/r/<token>` and `/inbox`, guest cookie persists across app restarts |
| **Google OAuth in a WebView** | Google blocks OAuth in embedded WebViews (`disallowed_useragent`; Google policy, **UNVERIFIED this pass**). The usual route is the system browser session (ASWebAuthenticationSession / Custom Tabs) and a deep link/universal link back, which does **not** share cookies with the WebView | login impossible without handoff | **S3:** sign in via system browser, return through a universal link, exchange a one-time code server-side into a session cookie inside the WebView (or issue a bearer token like the extension). Universal links need an `apple-app-site-association` file on the app's domain; whether to move to a custom domain first is open (§10 L12) |
| **iOS Share Extension** (the reason for stores, PRD §10.3) | Native Swift target; shared container (App Group) and Keychain access group to hand the shared URL and a credential to the app/extension; the extension calls a new server route that reuses `/api/ask/resolve`-style URL parsing. **Open product question (PRD):** who receives the shared video — proposal: choose among owners the user already sent to, or "save for me". UNVERIFIED: any existing Capacitor plugin, extension-size/time limits | highest native effort; PRD marks it a spike | **S4:** share a YouTube URL from the YouTube app → LIKED receives the id → recommendation created for a chosen owner |
| **Sign in with Apple** | Apple 4.8 requires an equivalent login when Google is offered (PRD §10.3 table; guideline text not re-fetched). Supabase has an Apple provider (native `signInWithIdToken`); needs an Apple Services ID/key (Apple Developer account). The claim flow is identity-agnostic (keyed on `users.id`, §2.8). Apple also expects revocation of Sign-in-with-Apple tokens when the account is deleted — UNVERIFIED this pass — which would add a step to the §3.4 pipeline | blocks iOS submission (D22) | **S5:** Apple sign-in end to end incl. claim and account deletion |
| **Account deletion** | In-app deletion (§3) already satisfies the in-app requirement; Play Console needs the public `/delete-account` URL (§3.6) | low | covered by P0-20 |
| **Report action + objectionable-text filter** (Apple 1.2) | Owner block/remove exists (PRD §10.1); needs a `reports` table, a Report control on recommendation rows, and a server-side text filter on names/comments (D22) | rejection risk | **S6:** word-list filter + Report flow demonstrated |
| **Privacy / policy** | Privacy policy, Terms, support contact, age rating, privacy labels / Data safety (PRD §10.3); privacy page must cover contributors, TMDB, YouTube/Google, JustWatch, retention (P0-21) | store rejection | checklist task at P3 start |
| **Push notifications** | PRD cites push as a genuine native feature (4.2); web push is P2 and on iOS needs an installed PWA or the native app. APNs setup UNVERIFIED | — | decide at P3 start |
| **Monetisation boundary** | TMDB forbids revenue-generating recommendation use without a written agreement (§6.6) | paid app/ads/IAP would be commercial use | keep the iOS app free and ad-free, or obtain the TMDB agreement before listing |
| **Android** | An installed PWA can receive shares, but there is no manifest/service worker today | optional | out of this plan |

Exit of P3 planning: S1–S6 each produce a go/no-go note before any store submission work is scheduled.

---

## 10. Lolo-required manual steps (one consolidated list)

**Nothing on this list blocks the start of P0 Wave 1** (P0-01, P0-02, P0-07, P0-09, P0-10, P0-21, P0-25 need no external credential). "Blocks" below names the first task that cannot finish without the item. **No Supabase Auth setting needs to change** (anonymous sign-ins stay disabled — V2-INV A1 — and no Supabase CAPTCHA setting is used).

| # | Step | Where | Used by | Blocks |
|---|---|---|---|---|
| L1 | Create a **TMDB API Read Access Token (v4)**; set `TMDB_API_READ_ACCESS_TOKEN` in Vercel (Production + Preview), Devin secrets, and **GitHub Actions secrets** (CI language check) | themoviedb.org → Settings → API | P0-11, P0-15; live `th-TH`/`es-MX` check; TH provider spot-check | **Wave 3** (P0-11) |
| L2 | In the Google Cloud project of the OAuth client: enable **YouTube Data API v3**, create an **API key restricted to that API**; set `YOUTUBE_API_KEY` (Vercel, Devin). Record the **project name** (V2-INV E2 UNVERIFIED) and open the Quotas page once to confirm the daily limit | Google Cloud Console → APIs & Services | P0-12 | Wave 3 (P0-12) |
| L3 | **CAPTCHA:** either create a Cloudflare **Turnstile** widget (hostnames: production host, preview host pattern, `localhost`) and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`, **or** approve the proof-of-work fallback (`CAPTCHA_PROVIDER=pow`) | Cloudflare dashboard | P0-13 | Wave 3 (local dev can use a dev bypass flag that is rejected in production) |
| L4 | **Email:** choose the provider (proposal: Resend), **own a sending domain** and verify DNS (the app is on `liked-zeta.vercel.app`, a shared domain — UNVERIFIED that any owned domain exists), set `RESEND_API_KEY`, `EMAIL_FROM` | resend.com + DNS | P0-18 sending, deletion-confirmation mails | email **delivery** only; the outbox works without it |
| L5 | Generate and set secrets: `GUEST_COOKIE_SECRET`, `ACCOUNT_REAUTH_SECRET`, `RATE_LIMIT_PEPPER` (e.g. `openssl rand -base64 48`, different per environment); `CRON_SECRET` already exists in Vercel (`app/api/youtube/sync/route.ts:17`, UNVERIFIED that it is set in production) | Vercel env, Devin secrets | P0-08, P0-20 | Wave 3 (P0-08) |
| L6 | Set the optional tuning env vars with the §6.4 defaults: `YT_SEARCH_DAILY_GLOBAL=50`, `YT_SEARCH_DAILY_PER_CONTRIBUTOR=5`, `YT_SEARCH_CACHE_TTL_HOURS=12`, `YT_UNITS_DAILY_HARD_CAP=8000` | Vercel env | P0-12 | — |
| L7 | **Google OAuth consent screen:** status **In production**; scopes `openid`, `email`, `profile`; app name, support email, developer contact, authorized domains, privacy-policy and terms URLs; confirm that the OAuth client configured in **Supabase → Authentication → Providers → Google** is the same client as `GOOGLE_CLIENT_ID`; confirm redirect URIs (`/auth/v1/callback`, `/api/youtube/callback`). Report what the consent screen shows after P0-07 ships | Google Cloud Console + Supabase dashboard | P0-07 **rollout** (§5.5) | production rollout of P0-07, not its development |
| L8 | Confirm the **Vercel plan** (cron frequency, function max duration) | Vercel → team settings | P0-15 enrichment cadence | — (design is plan-agnostic) |
| L9 | Legal: developer legal name and contact for `/delete-account` and the policies, support email, legal review of privacy policy and terms (GDPR for EU/French users) | — | P0-20, P0-21 | **release**, not start |
| L10 | Translation review: FR and ES by Lolo; **Thai by an external native reviewer** (PRD §9.7) | — | P0-09 catalogs | **release** |
| L11 | Commit the PRD to the repo — **done by DOCS-V2-001**: `docs/05_PRD_V2_RECOMMENDATION_INBOX.md` committed as v2.6 on `devin/PLAN-V2-002` (PR #37) | git | traceability | — |
| L12 | Decide whether to buy/attach a **custom domain** (email sender, Google authorized domain, universal links for P3) | registrar + Vercel | L4, P3 | — |
| L13 | Answer the open decisions in §11 (D-1 … D-8) | — | various | per decision |
| L14 | **Later — YouTube quota audit:** after launch, watch the Quotas page; if usage stays above ~60 % of the daily limit for a week, file Google's quota-extension/compliance-audit form; record the legacy OAuth consumption separately (§6.4 headroom) | Google Cloud Console | operations | — |
| L15 | CTO audit of each migration's DDL **before** it is applied (PRD §8 rule) | review process | P0-01…05 | each migration |

---

## 11. Risks, UNVERIFIED items, Deviation proposals

### 11.1 Deviation proposals (binding decisions stay as planned; each item is a proposal with evidence)

**No binding decision (D23–D28) was found unworkable.** The following are corrections or additions the CTO may veto:

| # | Proposal | Evidence | If vetoed | CTO 2026-11-21 |
|---|---|---|---|---|
| DV-1 | Do **not** extend `public.users`; use `user_prefs` (§1.2) although PRD §8 lists `users (existing, extended)` | `users_select_scoped` is row-level, so new columns leak to edge-connected friends (VERIFIED) | add the columns to `users`; accept region/email-toggle visibility to friends, or restrict with column privileges | ACCEPTED (PRD v2.6 §8, D30) |
| DV-2 | Was: keep PRD §7's **internal poster copy** (bucket `thumbnails`, `tmdb/<uuid>.jpg`) with a 5-month refresh/purge | TMDB terms: 6-month cache cap (VERIFIED, fetched today) | amend PRD §7 to hotlink `image.tmdb.org`; drop the poster copy step in P0-15 | **VETOED -> hotlink** — PRD v2.6 §7/§8, D29: posters hotlinked from `image.tmdb.org`, never copied; applied throughout this plan (`items.poster_path` text only, inside the 6-month rule) |
| DV-3 | New table `account_deletion_jobs` (not in PRD §8) so deletion finalisation (Storage, auth user, email) is retriable after the DB transaction commits | Storage cannot be deleted with SQL (`protect_objects_delete`, VERIFIED); no FK links `users` to `auth.users` (VERIFIED) | run all stages inline and accept manual repair on failure | ACCEPTED |
| DV-4 | "Fresh Google re-auth < 5 minutes" is implemented with a signed one-time proof cookie created after a Google round trip, **not** by reading the JWT `amr` claim | `amr`/`max_age` support UNVERIFIED | none needed; replace with the claim if later verified | ACCEPTED |
| DV-5 | The refresh job also refreshes/clears `nodes.title` of **promoted** YouTube nodes (linked through `node_items`), so the new write path does not recreate the legacy 30-day exposure; the legacy exposure itself stays out of scope (D-G) | legacy persists titles/thumbnails and never refreshes (V2-INV E3) | promoted YouTube nodes inherit the legacy exposure | ACCEPTED |
| DV-6 | All TMDB posters — search results **and** stored items — are hotlinks to `image.tmdb.org` (CSP `img-src https://image.tmdb.org` + `images.remotePatterns`, task P0-11); no poster bytes are stored or proxied | PRD v2.6 §7/D29; CSP currently blocks the host (`next.config.ts:29`, VERIFIED) | proxy posters through our server (that would be caching and falls under the 6-month rule) | ACCEPTED |
| DV-7 | Tables added beyond PRD §8: `user_prefs`, `owner_contributor_blocks`, `tmdb_genres`, `item_availability_fetch`, `enrichment_jobs`, `email_outbox`, `rate_limits`, `account_deletion_jobs`, and (P1) `node_items`, `owner_picks`; `share_links` kept | each is required by a PRD requirement (block, genres picker, explicit "not available", async enrichment, email, rate limits, deletion, promote, picks) | each can be folded elsewhere at a cost stated in its section | ACCEPTED (support tables enumerated in PRD v2.6 §8 → PLAN-V2-002 §1.4) |
| DV-8 | `asks.token` stored raw (PRD §8) rather than hashed (PLAN-V2-001) | owner must re-copy the link; DB read access already exposes everything | hash + show-once UX | ACCEPTED |
| DV-9 | `owner_item_state.library_node_id` (PRD §8) is **not created**; "In library" is derived from `node_items` | the existing Tier-0 check DB-18 requires every FK referencing `nodes` to be `ON DELETE CASCADE` (`scripts/check-invariants-001.mjs:122-128`); a nullable link that survives node deletion needs `SET NULL`, which that check would fail | keep the column without an FK (dangling ids resolved by a join) and relax DB-18 for it | ACCEPTED (PRD v2.6 §8, change-log item 3) |

### 11.2 Decisions needed from Lolo/CTO (none blocks Wave 1)

| # | Question | Default used in this plan | Decision (CTO 2026-11-21) |
|---|---|---|---|
| D-1 | Default post-login home: `/inbox` (v2) or `/feed` (legacy)? Feature flag `V2_DEFAULT_HOME=inbox\|feed` | flag, default `feed` until P0 completes | feature flag, default `feed` |
| D-2 | Is the card's friends' average computed over **all** recommenders or only the selected friend? | all recommenders (PRD §6.5 merge rule) | all recommenders |
| D-3 | CAPTCHA provider (§4.4) | Turnstile | Turnstile; proof-of-work fallback if no Cloudflare account by Wave 3 |
| D-4 | Email provider and sending domain (L4) | Resend + owned domain | Resend; owned domain still to be confirmed by Lolo |
| D-5 | **Guest retention** (PRD silent): purge contributors with no activity (`last_seen_at`) for 18 months and no claim | proposed, **not implemented** until decided | 18 months, no claim; built in P1 (P1-11); PRD v2.6 §10.1 |
| D-6 | Streaming-region default when the IP country is unavailable | no stored default; suggestion from `x-vercel-ip-country` (UNVERIFIED), fallback `US`, always editable | as proposed |
| D-7 | Promoting a YouTube **channel** to the Library | not in P1 (`UNSUPPORTED_KIND`) | channel promote not in P1 |
| D-8 | May an account holder recommend to another owner through the same flow? | yes, as an account-backed contributor via the same cookie path (§2.2 step 6); recommending to oneself is rejected | account holders may recommend to other owners; self-recommend rejected |

### 11.3 Risks

| # | Risk | Severity | Mitigation / note |
|---|---|---|---|
| R1 | YouTube quota is per project and shared with the legacy OAuth search/sync, whose consumption is not measured | Medium | conservative caps (50 searches/day, 8 000-unit hard cap), cache, budgets, later audit (L14) |
| R2 | TMDB commercial-use terms (§6.6) — monetisation or store pricing/ads would breach | High if monetised | free, ad-free app; written agreement otherwise |
| R3 | Google consent-screen status unknown; the legacy `youtube.readonly` **connect** path stays a sensitive scope (unverified-app warning/user cap) | Medium | impact now confined to legacy YouTube import (§5.5 G5) |
| R4 | If Supabase's Google client ≠ `GOOGLE_CLIENT_ID`, existing refresh tokens fail | Medium | verify (L7); reconnect banner as fallback |
| R5 | `delete_account` is irreversible and wide | High | rollback harness on real data, FK-coverage guard (DB-22), 3-step review; inbox steps and the actor-notification/token steps are **not simulable until P0-05 exists** (the Appendix runs cover legacy steps 3–8 and 10) |
| R6 | `rl_hit` costs one DB write per guest request | Low–Medium | limits are coarse; purge daily; swap to a managed store later if load demands |
| R7 | Client-IP header trust on Vercel | Medium | layered limits (§4.3); UNVERIFIED |
| R8 | Thai/Spanish metadata and Thai provider coverage unknown | Medium | live `primary_translations` check, TH provider spot-check (P0-11), explicit "not available in {region}" state |
| R9 | `after()` work is bounded by the function's max duration and the Vercel plan | Medium | small batches, retries via the queue, opportunistic kicks; UNVERIFIED limits (L8) |
| R10 | Guest identity is per browser: clearing cookies loses it (merge is P2) | Low | documented in the receipt UI; claim by Google |
| R11 | Supabase default ACLs grant new objects to `anon`/`authenticated` | High if forgotten | mandatory REVOKE block (§1.3) + DB-20/DB-21 |
| R12 | PRD v2.5 was uncommitted | — | resolved: committed as v2.6 on `devin/PLAN-V2-002` (DOCS-V2-001, PR #37) |
| R13 | `get_inbox` aggregates per request | Low | indexes in §1.4; EXPLAIN on a 5 000-recommendation fixture in P0-04 |
| R14 | Pre-existing: callback open redirect | Medium | fixed in P0-07 (T15) |
| R15 | Pre-existing: 2 `users.avatar_key` rows hold external Google URLs against invariant I-12 | Low | outside v2 scope; noted |
| R16 | Catalog growth from valid-but-useless ids | Low | caps, rate limits, purge of unreferenced items (§6.5) |

**Out of scope per D-G, listed as risks only:** audit P1-1 (card-click bug) and P1-2 (`extract-node-metadata`) remain unfixed (V2-INV G3, "not fixed"); the legacy YouTube data persists beyond 30 days (V2-INV E3) — a store-review and Google-audit exposure for the legacy import; group feed dead code (`group_nodes` has no live writer, V2-INV C1) means "groups" in the Library are share-time snapshots; direct-write RLS surfaces for any authenticated account (`friend_invites` INSERT, `thumbnails` INSERT, PLAN-V2-001 E.1) are unchanged.

### 11.4 UNVERIFIED items (consolidated, with the reason)

| # | Item | Why unverified |
|---|---|---|
| U1 | `th-TH` and `es-MX` in TMDB `primary_translations`; Thai metadata completeness | no TMDB key in the environment (only secondary evidence, §6.3) |
| U2 | Thailand watch-provider coverage | same; spot-check is task P0-11 |
| U3 | Default scope string Supabase's Google provider requests | needs a dashboard/consent-screen look after P0-07 |
| U4 | Same OAuth client in Supabase provider and `GOOGLE_CLIENT_ID` | dashboard only |
| U5 | Consent-screen publishing status, scopes list, branding verification, redirect URIs | Cloud Console only |
| U6 | JWT `amr` claim and Google `max_age`/`prompt=login` behaviour | not probed; the design avoids both |
| U7 | Whether a deleted user's JWT is rejected before expiry | not probed; the design does not rely on it |
| U8 | Vercel plan, cron limits, function max duration, IP-header spoofing, `x-vercel-ip-country` | platform dashboard/docs not consulted |
| U9 | YouTube quota table numbers, Pacific-time reset, API-key use for public `search.list`, `/c/<name>` resolvability | Google docs not re-fetched in this task; PRD §9.4 carries the figures |
| U10 | Cloud project name/ownership and quota visibility (V2-INV E2) | no Cloud access |
| U11 | Turnstile CSP needs and the existence of a Cloudflare account | docs not re-fetched; account unknown |
| U12 | Owned domain for email / Google authorized domain | none known |
| U13 | Google's per-account refresh-token cap | not re-fetched |
| U14 | Legacy feed rendering of a YouTube node with `thumbnail_key = NULL` | covered by P1-05 test |
| U15 | Apple 1.2/4.2/4.8/5.1.1, Play deletion, Apple token revocation on deletion, Google embedded-WebView policy | store/Google pages not re-fetched (PRD §10.3 asserts them) |
| U16 | YouTube API Services privacy-policy requirement | not re-fetched; checked in P0-21 |
| U17 | Inbox-side steps of `delete_account` (actor notifications, token deletes, orphan guests) | the inbox tables do not exist yet; legacy steps are verified by rollback simulation |

---

## Appendix A — rollback simulation: delete ordering on two real accounts

**Type:** `BEGIN … ROLLBACK` simulation (no persisted write), run with `psql` on the Supabase pooler as `postgres`; JWT claims set to `{"role":"service_role"}` so `remove_node_from_folder` takes its service branch. The `:'uid'` placeholder was replaced by the account UUID with `sed` (psql variables are not interpolated inside `$$`). Accounts: `laurent.martenot` (`5355c879-…`, 908 nodes) and `a@a.com` (`8d10c9d1-…`).

```sql
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE
  u uuid := :'uid'::uuid;
  r record; n int; msg text := '';
  nodes_owned int; folders_owned int; placements_removed int := 0; rated_nodes uuid[];
BEGIN
  SELECT count(*) INTO nodes_owned FROM nodes WHERE owner_id=u;
  SELECT count(*) INTO folders_owned FROM folders WHERE owner_id=u;
  RAISE NOTICE 'BEFORE nodes_owned=% folders_owned=% edges_user=% edges_sender=% grants_grantee=% grants_by=% ratings=% groups_owned=% group_member_rows=% notifs=% activity=%',
    nodes_owned, folders_owned,
    (SELECT count(*) FROM edges WHERE user_id=u),(SELECT count(*) FROM edges WHERE sender_id=u),
    (SELECT count(*) FROM folder_grants WHERE grantee_id=u),(SELECT count(*) FROM folder_grants WHERE granted_by=u),
    (SELECT count(*) FROM ratings WHERE user_id=u),(SELECT count(*) FROM groups WHERE owner_id=u),
    (SELECT count(*) FROM group_members WHERE user_id=u),(SELECT count(*) FROM notifications WHERE user_id=u),(SELECT count(*) FROM activity_log WHERE user_id=u);

  -- Step 1: placements the user made in other people's folders of nodes owned by others
  FOR r IN SELECT fe.node_id, fe.folder_id FROM folder_edges fe JOIN folders f ON f.id=fe.folder_id JOIN nodes nd ON nd.id=fe.node_id
           WHERE fe.added_by=u AND f.owner_id<>u AND nd.owner_id<>u LOOP
    PERFORM public.remove_node_from_folder(r.node_id, r.folder_id); placements_removed := placements_removed+1;
  END LOOP;
  RAISE NOTICE 'step1 placements_removed=%', placements_removed;

  -- Step 2: ratings (recompute averages for others' nodes in same tx)
  SELECT array_agg(DISTINCT node_id) INTO rated_nodes FROM ratings WHERE user_id=u;
  DELETE FROM ratings WHERE user_id=u;
  IF rated_nodes IS NOT NULL THEN
    UPDATE nodes_sort_cache c SET avg_rating=(SELECT AVG(score) FROM ratings WHERE node_id=c.node_id), updated_at=now() WHERE c.node_id=ANY(rated_nodes);
  END IF;

  -- Step 3: NO ACTION tables
  DELETE FROM node_messages WHERE sender_id=u;
  DELETE FROM messages WHERE sender_id=u OR chat_id IN (SELECT id FROM direct_chats WHERE user_1_id=u OR user_2_id=u);
  DELETE FROM direct_chats WHERE user_1_id=u OR user_2_id=u;
  DELETE FROM group_messages WHERE sender_id=u OR group_id IN (SELECT id FROM groups WHERE owner_id=u);
  DELETE FROM group_nodes WHERE group_id IN (SELECT id FROM groups WHERE owner_id=u);
  DELETE FROM group_admins WHERE user_id=u OR granted_by=u OR group_id IN (SELECT id FROM groups WHERE owner_id=u);
  DELETE FROM group_members WHERE user_id=u OR group_id IN (SELECT id FROM groups WHERE owner_id=u);
  DELETE FROM groups WHERE owner_id=u;
  DELETE FROM folder_admins WHERE user_id=u OR granted_by=u;
  DELETE FROM blocks WHERE blocker_id=u OR blocked_id=u;
  DELETE FROM categorization_suggestions WHERE user_id=u;
  DELETE FROM categorization_suggestions_backup_20260927 WHERE user_id=u;
  DELETE FROM notifications WHERE user_id=u;
  DELETE FROM activity_log WHERE user_id=u;
  DELETE FROM causes WHERE created_by=u;  -- cascades edges incl. sender_id references (I-03)

  -- Step 4: the users row
  BEGIN
    DELETE FROM users WHERE id=u;
    RAISE NOTICE 'step4 DELETE users OK';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'step4 FAILED: % %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'AFTER nodes_owned=% folders_owned=% edges_user=% edges_sender=% grants_any=% ratings=% orphan_folder_edges_added_by=%',
    (SELECT count(*) FROM nodes WHERE owner_id=u),(SELECT count(*) FROM folders WHERE owner_id=u),
    (SELECT count(*) FROM edges WHERE user_id=u),(SELECT count(*) FROM edges WHERE sender_id=u),
    (SELECT count(*) FROM folder_grants WHERE grantee_id=u OR granted_by=u),(SELECT count(*) FROM ratings WHERE user_id=u),
    (SELECT count(*) FROM folder_edges WHERE added_by=u);
END $$;
ROLLBACK;
SELECT 'post-rollback users_row_exists', count(*) FROM users WHERE id=:'uid'::uuid;
```

**Run 1 — the same script WITHOUT the `DELETE FROM causes WHERE created_by=u;` line (verbatim NOTICE lines, psql file prefix removed):**

```
##### uid=5355c879-a734-40be-9699-1cb1b2572cff  (laurent.martenot)
NOTICE:  BEFORE nodes_owned=908 folders_owned=18 edges_user=936 edges_sender=40 grants_grantee=0 grants_by=2 ratings=3 groups_owned=0 group_member_rows=0 notifs=8 activity=45
NOTICE:  step1 placements_removed=0
NOTICE:  step4 FAILED: 23503 update or delete on table "users" violates foreign key constraint "edges_sender_id_fkey" on table "edges"
NOTICE:  AFTER nodes_owned=908 folders_owned=18 edges_user=936 edges_sender=40 grants_any=2 ratings=0 orphan_folder_edges_added_by=910
 post-rollback users_row_exists |     1
##### uid=8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7  (a@a.com)
NOTICE:  BEFORE nodes_owned=23 folders_owned=15 edges_user=33 edges_sender=0 grants_grantee=0 grants_by=0 ratings=6 groups_owned=0 group_member_rows=0 notifs=10 activity=25
NOTICE:  step1 placements_removed=0
NOTICE:  step4 DELETE users OK
NOTICE:  AFTER nodes_owned=0 folders_owned=0 edges_user=0 edges_sender=0 grants_any=0 ratings=0 orphan_folder_edges_added_by=0
 post-rollback users_row_exists |     1
```

The `edges` that blocked run 1: `SELECT … FROM edges e JOIN causes c … WHERE e.sender_id = <laurent>` grouped → `folder_grant_expand` 14 + 14 and `direct_share` 4 + 4 (all with `causes.created_by = sender_id`), plus 4 folder edges.

**Run 2 — the script as printed above (with the causes step):**

```
##### uid=5355c879-a734-40be-9699-1cb1b2572cff  (laurent.martenot)
NOTICE:  BEFORE nodes_owned=908 folders_owned=18 edges_user=936 edges_sender=40 grants_grantee=0 grants_by=2 ratings=3 groups_owned=0 group_member_rows=0 notifs=8 activity=45
NOTICE:  step1 placements_removed=0
NOTICE:  step4 DELETE users OK
NOTICE:  AFTER nodes_owned=0 folders_owned=0 edges_user=0 edges_sender=0 grants_any=0 ratings=0 orphan_folder_edges_added_by=0
 post-rollback users_row_exists |     1
##### uid=8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7  (a@a.com)
NOTICE:  BEFORE nodes_owned=23 folders_owned=15 edges_user=33 edges_sender=0 grants_grantee=0 grants_by=0 ratings=6 groups_owned=0 group_member_rows=0 notifs=10 activity=25
NOTICE:  step1 placements_removed=0
NOTICE:  step4 DELETE users OK
NOTICE:  AFTER nodes_owned=0 folders_owned=0 edges_user=0 edges_sender=0 grants_any=0 ratings=0 orphan_folder_edges_added_by=0
 post-rollback users_row_exists |     1
```

## Appendix B — rollback simulation: placement in another person's shared folder (rule R2)

**Type:** `BEGIN … ROLLBACK`. A = `laurent.martenot` (`5355c879-…`), B = `a@a.com` (`8d10c9d1-…`). A creates a folder and grants B `contribute`, creates a node and shares it to B; **B adds A's node to A's folder**; then the service-role deletion sequence runs for B.

```sql
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"5355c879-a734-40be-9699-1cb1b2572cff","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT create_folder('P2SIM Folder', NULL, NULL, NULL) AS fid \gset
SELECT share_folder_v2(:'fid'::uuid, 'contribute', ARRAY['8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7'::uuid], false, NULL) AS grant_count;
SELECT * FROM create_node_with_metadata('5355c879-a734-40be-9699-1cb1b2572cff'::uuid,'https://example.com/p2sim-node',NULL,'P2SIM A-owned node',NULL,'en',NULL,'link',NULL,NULL) \gset
SELECT share_node(:'id'::uuid,'view',ARRAY['8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7'::uuid],false) AS shared_to_b;
SELECT set_config('request.jwt.claims','{"sub":"8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7","role":"authenticated"}',true);
SELECT add_node_to_folder(:'id'::uuid, :'fid'::uuid);
-- BEFORE-DELETE counts, then:
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE u uuid := '8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7'; r record; n int := 0;
BEGIN
  FOR r IN SELECT fe.node_id, fe.folder_id FROM folder_edges fe JOIN folders f ON f.id=fe.folder_id JOIN nodes nd ON nd.id=fe.node_id
           WHERE fe.added_by=u AND f.owner_id<>u AND nd.owner_id<>u LOOP
    PERFORM public.remove_node_from_folder(r.node_id, r.folder_id); n := n+1;
  END LOOP;
  RAISE NOTICE 'placements_removed=%', n;
  DELETE FROM ratings WHERE user_id=u; DELETE FROM node_messages WHERE sender_id=u;
  DELETE FROM messages WHERE sender_id=u OR chat_id IN (SELECT id FROM direct_chats WHERE user_1_id=u OR user_2_id=u);
  DELETE FROM direct_chats WHERE user_1_id=u OR user_2_id=u;
  DELETE FROM group_messages WHERE sender_id=u; DELETE FROM group_admins WHERE user_id=u OR granted_by=u; DELETE FROM group_members WHERE user_id=u;
  DELETE FROM folder_admins WHERE user_id=u OR granted_by=u; DELETE FROM blocks WHERE blocker_id=u OR blocked_id=u;
  DELETE FROM categorization_suggestions WHERE user_id=u; DELETE FROM notifications WHERE user_id=u; DELETE FROM activity_log WHERE user_id=u;
  DELETE FROM causes WHERE created_by=u;
  DELETE FROM users WHERE id=u;
  RAISE NOTICE 'users row deleted OK';
END $$;
-- AFTER-DELETE counts (folder, node, placement, A's edges, B's edges, grants), then:
ROLLBACK;
```

Verbatim results:

```
 grant_count = 1      shared_to_b = 1
     phase     | placement_by_b | edges_on_node | expand_causes
 BEFORE-DELETE |              1 |             2 |             0
NOTICE:  placements_removed=1
NOTICE:  users row deleted OK
    phase     | folder_still_exists | a_node_still_exists | placement_left | a_edges_on_node | b_edges_on_node | grants_left
 AFTER-DELETE |                   1 |                   1 |              0 |               2 |               0 |           0
       chk       | count
 residue_folders |     0
 residue_nodes   |     0
 b_user_exists   |     1
```

Reading: B's placement of A's node in A's folder was removed (`placement_by_b 1 → placement_left 0`), A's node and folder survive, A keeps both of its own edges on the node, B's edges and the grant to B are gone, and nothing remained after `ROLLBACK` (`residue_* = 0`, B's user row still present). In this scenario no `folder_grant_expand` cause existed (`expand_causes = 0`), so the revocation-of-expansion-edges branch of `remove_node_from_folder` was **not** exercised by this run; it is covered by the existing function body (read above) and by task P0-05's fixtures.

*End of PLAN-V2-002.*
