-- ============================================================
-- Migration 113 — MVP2 P0-04 (F7 follow-up): one-time invite backfill
-- LIKED-MVP2-EXEC-002
-- ============================================================
-- Friend-invite backfill used to run on every login from two callback
-- routes (dual path). It now lives only in the ensure_user_profile trigger
-- (new signups) and in invite_friend (resolves existing users by auth email
-- at invite time). This one-time data fix links any invite rows that are
-- still pending although the invitee already has an account — including
-- rows written by the old sendFriendInvite, which looked the invitee up by
-- normalized_display_name instead of email.
-- ============================================================
UPDATE public.friend_invites fi
   SET to_user_id = au.id
  FROM auth.users au
 WHERE fi.to_user_id IS NULL
   AND lower(au.email) = lower(fi.to_email)
   AND au.id <> fi.from_user_id
   AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = au.id);
