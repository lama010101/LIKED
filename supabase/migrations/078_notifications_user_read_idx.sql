-- P1-1: Add partial index on notifications(user_id, read) for unread queries
--
-- The notifications table is queried by (user_id, read=false) in:
--   app/lib/actions/notifications.ts (getUnreadNotificationCountAction, getNotificationsAction)
--   app/(app)/layout.tsx (unread count on mount)
--
-- Without this index, every notification query does a full table scan filtered by RLS.
-- Partial index (WHERE read = false) keeps it small — only unread rows are indexed.
--
-- Ref: AUDIT-05-REPORT.md P1-1

CREATE INDEX IF NOT EXISTS notifications_user_read_idx
  ON notifications(user_id, read) WHERE read = false;
