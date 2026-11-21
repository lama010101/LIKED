-- ============================================================
-- Migration 142 — v2 Recommendation Inbox: core tables
-- (PLAN-V2-002 §1.4, PRD v2.6; task V2-W1A-DDL-001, PLAN P0-01)
-- ============================================================
-- Dedicated inbox tables written ONLY through SECURITY DEFINER
-- functions / server routes (PRD §8 rule, D23/D24). Guests are
-- server-mediated (signed cookie + contributors row); they never
-- hold a Supabase session and never touch these tables.
--
-- Security posture (§1.3, mandatory for EVERY table below):
--   ENABLE ROW LEVEL SECURITY; REVOKE ALL FROM PUBLIC, anon,
--   authenticated; NO CREATE POLICY. pg_default_acl auto-grants
--   new tables to anon/authenticated, so the REVOKE is required.
--   service_role keeps its default grant.
--
-- public.users is NOT extended (DV-1/D30): preferences live in
-- user_prefs. owner_item_state has NO library_node_id (DV-9):
-- "In library" is derived from node_items (migration 143).
-- items has NO poster_key (PRD v2.6 §7/D29): posters are hotlinks
-- from image.tmdb.org built from items.poster_path (text only,
-- inside the 6-month refresh rule).
-- ============================================================

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

ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_prefs FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contributors FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.asks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asks FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.items FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.item_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_availability FROM PUBLIC, anon, authenticated;

CREATE TABLE public.item_availability_fetch (
  item_id     uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  region_code text NOT NULL CHECK (region_code ~ '^[A-Z]{2}$'),
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, region_code)
);

ALTER TABLE public.item_availability_fetch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_availability_fetch FROM PUBLIC, anon, authenticated;

CREATE TABLE public.tmdb_genres (            -- names per TMDB language tag; used by the genre picker + filter chips
  media    text    NOT NULL CHECK (media IN ('movie','tv')),
  id       integer NOT NULL,
  lang     text    NOT NULL,
  name     text    NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media, id, lang)
);

ALTER TABLE public.tmdb_genres ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tmdb_genres FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submissions FROM PUBLIC, anon, authenticated;

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

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recommendations FROM PUBLIC, anon, authenticated;

CREATE TABLE public.owner_item_state (
  owner_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'to_watch' CHECK (status IN ('to_watch','watched','dismissed')),
  updated_at      timestamptz NOT NULL DEFAULT now(),                            -- = status change time ("recommended again" marker)
  PRIMARY KEY (owner_id, item_id)
);
-- NOTE: PRD §8 v2.5 listed `library_node_id` here. It is NOT created (PRD v2.6,
-- PLAN-V2-002 DV-9): an FK to `nodes` would have to be ON DELETE SET NULL, which
-- violates the existing Tier-0 check DB-18 ("every FK referencing nodes/folders
-- is ON DELETE CASCADE", scripts/check-invariants-001.mjs:122-128).
-- "In library" is derived from `node_items` (migration 143).

ALTER TABLE public.owner_item_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_item_state FROM PUBLIC, anon, authenticated;

CREATE TABLE public.owner_contributor_blocks (          -- PRD §10.1 "remove or block a contributor"
  owner_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES public.contributors(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contributor_id)
);

ALTER TABLE public.owner_contributor_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_contributor_blocks FROM PUBLIC, anon, authenticated;
