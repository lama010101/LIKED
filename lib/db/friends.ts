/**
 * Friend system database operations
 * P3-T03 implementation
 *
 * Friendship model (PRD §9.1–9.3):
 * - Based on friend_invites table — NO friends table, NO edge-based derivation.
 * - A user X appears in your Friends bar as soon as you invite them OR they invite you.
 * - No reciprocal acceptance required (WhatsApp model).
 * - Pending invites (to_user_id IS NULL) are included, shown dimmed.
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";

export interface FriendBarEntry {
  user_id: string | null;
  display_name: string | null;
  avatar_key: string | null;
  to_email: string | null;
  is_pending: boolean;
  last_activity: string | null;
}

/**
 * Returns all entries for the Friends & Groups Strip.
 * Uses the get_friend_bar Postgres function (04_FEED_SQL_SPEC §5.1).
 */
export async function getFriendBar(userId: string): Promise<FriendBarEntry[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("get_friend_bar", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to fetch friend bar: ${error.message}`);
  }

  return (data ?? []) as FriendBarEntry[];
}

/**
 * Sends a friend invite from fromUserId to toEmail.
 * Silently ignores duplicate invites (one active invite per pair).
 */
export async function sendFriendInvite(
  fromUserId: string,
  toEmail: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: existing } = await supabase
    .from("friend_invites")
    .select("id")
    .eq("from_user_id", fromUserId)
    .eq("to_email", toEmail.toLowerCase().trim())
    .maybeSingle();

  if (existing) {
    return;
  }

  const { data: toUser } = await supabase
    .from("users")
    .select("id")
    .eq("normalized_display_name", toEmail.toLowerCase().trim())
    .maybeSingle();

  const { error } = await supabase.from("friend_invites").insert({
    from_user_id: fromUserId,
    to_email: toEmail.toLowerCase().trim(),
    to_user_id: toUser?.id ?? null,
  });

  if (error) {
    throw new Error(`Failed to send friend invite: ${error.message}`);
  }
}

/**
 * On signup: links pending invite rows (to_user_id IS NULL) to the new user.
 * Must be called in the signup flow after user row is created.
 */
export async function backfillFriendInvites(
  newUserId: string,
  email: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("friend_invites")
    .update({ to_user_id: newUserId })
    .eq("to_email", email.toLowerCase().trim())
    .is("to_user_id", null);

  if (error) {
    throw new Error(`Failed to backfill friend invites: ${error.message}`);
  }
}

/**
 * Removes a friend by deleting the invite row.
 * Works in both directions: deletes any invite between the two users.
 */
export async function removeFriend(
  fromUserId: string,
  targetUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("friend_invites")
    .delete()
    .or(
      `and(from_user_id.eq.${fromUserId},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${fromUserId})`
    );

  if (error) {
    throw new Error(`Failed to remove friend: ${error.message}`);
  }
}
