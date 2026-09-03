-- ============================================================
-- Migration 088 — AUDIT-06 P2-8: Add missing indexes
-- ============================================================
-- Indexes on frequently-queried columns that currently do full scans.
-- All use CREATE INDEX IF NOT EXISTS for idempotency.
-- ============================================================

-- causes: filtered by created_by in unshare + causes_select_policy
CREATE INDEX IF NOT EXISTS causes_created_by_idx ON causes(created_by);

-- groups: owner lookups
CREATE INDEX IF NOT EXISTS groups_owner_id_idx ON groups(owner_id);

-- group_members: user_id-only queries (PK is composite group_id+user_id)
CREATE INDEX IF NOT EXISTS group_members_user_id_idx ON group_members(user_id);

-- group_admins: admin checks by user_id
CREATE INDEX IF NOT EXISTS group_admins_user_id_idx ON group_admins(user_id);

-- folder_admins: admin checks by user_id
CREATE INDEX IF NOT EXISTS folder_admins_user_id_idx ON folder_admins(user_id);

-- direct_chats: chat existence/lookups by either user
CREATE INDEX IF NOT EXISTS direct_chats_user_1_id_idx ON direct_chats(user_1_id);
CREATE INDEX IF NOT EXISTS direct_chats_user_2_id_idx ON direct_chats(user_2_id);

-- messages: by chat and by sender
CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages(chat_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);

-- group_messages: by group and by sender
CREATE INDEX IF NOT EXISTS group_messages_group_id_idx ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS group_messages_sender_id_idx ON group_messages(sender_id);

-- node_messages: by node and by sender
CREATE INDEX IF NOT EXISTS node_messages_node_id_idx ON node_messages(node_id);
CREATE INDEX IF NOT EXISTS node_messages_sender_id_idx ON node_messages(sender_id);

-- activity_log: rate-limit query (user_id, action, created_at)
-- Used by extract-node-metadata Edge Function _rateLimit.ts
CREATE INDEX IF NOT EXISTS activity_log_user_action_created_idx
  ON activity_log(user_id, action, created_at);
