-- ============================================================
-- LIKED Database Schema - Initial Migration
-- Based on PRD §35 - Complete SQL Schema
-- ============================================================

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name                TEXT NOT NULL,
  normalized_display_name     TEXT NOT NULL UNIQUE,
  language_code               TEXT NOT NULL DEFAULT 'en',
  avatar_key                  TEXT,                     -- internal storage key; NULL = deterministic default
  username_changed_at         TIMESTAMPTZ,
  avatar_change_count_today   INTEGER NOT NULL DEFAULT 0,
  avatar_last_reset_date      DATE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- NODES
-- ============================================================
CREATE TABLE nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url               TEXT,                                 -- nullable; NULL = pure text card
  text_content      TEXT,                                 -- optional rich text / markdown for text-only cards
  title             TEXT,
  thumbnail_key     TEXT,                               -- internal storage key
  owner_id          UUID NOT NULL REFERENCES users(id),
  language_code     TEXT NOT NULL DEFAULT 'en',
  origin_user_id    UUID NOT NULL REFERENCES users(id), -- immutable
  origin_created_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- immutable
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(url, owner_id) -- text-only cards (url=NULL) are still deduplicated by owner + text_content in app logic
);

-- ============================================================
-- CAUSES
-- ============================================================
CREATE TABLE causes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cause_type   TEXT NOT NULL CHECK (cause_type IN ('direct_share', 'group_share', 'import')),
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB         -- e.g., {node_id, target_user_id, group_id, folder_id, folder_share_op_id}
);

-- ============================================================
-- EDGES
-- No UNIQUE(node_id, user_id) — multiple edges per pair are valid
-- Deletion via cause cascade ONLY
-- ============================================================
CREATE TABLE edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  cause_id    UUID NOT NULL REFERENCES causes(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id),
  direction   TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  depth       INTEGER,        -- 0 for import; parent_depth + 1 for shares; written once
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX edges_node_user_idx ON edges(node_id, user_id);
CREATE INDEX edges_cause_idx ON edges(cause_id);

-- ============================================================
-- RATINGS
-- ============================================================
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  score       NUMERIC(3,1) NOT NULL
              CHECK (score >= 0 AND score <= 10 AND MOD(score * 2, 1) = 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(node_id, user_id)
);

-- ============================================================
-- NODES SORT CACHE
-- ============================================================
CREATE TABLE nodes_sort_cache (
  node_id      UUID PRIMARY KEY REFERENCES nodes(id),
  avg_rating   NUMERIC(4,2),
  view_count   INTEGER NOT NULL DEFAULT 0,
  share_count  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- GROUPS
-- ============================================================
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_nodes (
  group_id    UUID NOT NULL REFERENCES groups(id),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id, node_id)
);

CREATE TABLE group_members (
  group_id    UUID NOT NULL REFERENCES groups(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(group_id, user_id)
);

CREATE TABLE group_admins (
  group_id    UUID NOT NULL REFERENCES groups(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  granted_by  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(group_id, user_id)
);

-- ============================================================
-- FOLDERS
-- ============================================================
CREATE TABLE folders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  owner_id         UUID NOT NULL REFERENCES users(id),
  parent_folder_id UUID REFERENCES folders(id),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE folder_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  folder_id   UUID NOT NULL REFERENCES folders(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(node_id, folder_id)
);

CREATE TABLE folder_tree (
  folder_id   UUID NOT NULL REFERENCES folders(id),
  ancestor_id UUID NOT NULL REFERENCES folders(id),
  depth       INTEGER NOT NULL,
  PRIMARY KEY(folder_id, ancestor_id)
);

CREATE TABLE folder_admins (
  folder_id   UUID NOT NULL REFERENCES folders(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  granted_by  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(folder_id, user_id)
);

-- ============================================================
-- TAGS (CANONICAL MODEL)
-- ============================================================
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_hex   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tag_translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id        UUID NOT NULL REFERENCES tags(id),
  language_code TEXT NOT NULL,
  label         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tag_id, language_code)
);

CREATE INDEX tag_translations_lookup_idx ON tag_translations(language_code, label);

CREATE TABLE tag_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id      UUID NOT NULL REFERENCES tags(id),
  node_id     UUID REFERENCES nodes(id),
  folder_id   UUID REFERENCES folders(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (node_id IS NOT NULL AND folder_id IS NULL) OR
    (node_id IS NULL AND folder_id IS NOT NULL)
  )
);

-- ============================================================
-- TRANSLATIONS (NODE CONTENT I18N)
-- ============================================================
CREATE TABLE translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       UUID NOT NULL REFERENCES nodes(id),
  language_code TEXT NOT NULL,
  title         TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(node_id, language_code)
);

-- ============================================================
-- BLOCKS
-- ============================================================
CREATE TABLE blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id),
  blocked_id  UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY(blocker_id, blocked_id)
);

-- ============================================================
-- IMPORT TABLES
-- ============================================================
CREATE TABLE external_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE external_items_map (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_source_id UUID NOT NULL REFERENCES external_sources(id),
  external_id        TEXT NOT NULL,
  node_id            UUID NOT NULL REFERENCES nodes(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(external_source_id, external_id)
);

-- ============================================================
-- SYSTEM TABLES
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  payload     JSONB,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,
  target_id    UUID,
  target_type  TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CHAT TABLES (Deferred - Last Phase per PRD §28)
-- ============================================================
CREATE TABLE direct_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_1_id   UUID NOT NULL REFERENCES users(id),
  user_2_id   UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_1_id, user_2_id)
);

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID NOT NULL REFERENCES direct_chats(id),
  sender_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  sender_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE node_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES nodes(id),
  sender_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
