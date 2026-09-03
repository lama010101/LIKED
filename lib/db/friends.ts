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

export interface GroupBarEntry {
  id: string;
  name: string;
  owner_id: string;
  member_count?: number;
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

  // PostgREST filter DSL (NOT raw SQL): the .or() with .and() sub-filters
  // is the idiomatic PostgREST API for compound conditions. The values are
  // UUID parameters interpolated into the filter string — they are not
  // user input and are validated as UUIDs by the caller. This is not SQL
  // concatenation (AUDIT-06 P3-17: documented as PostgREST DSL).
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

/**
 * Returns all groups the user is a member of for the Friends & Groups Strip.
 * UX-002: Add Groups to BottomBar
 */
export async function getGroupBar(userId: string): Promise<GroupBarEntry[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("groups")
    .select(`
      id,
      name,
      owner_id,
      group_members!inner(user_id)
    `)
    .eq("group_members.user_id", userId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch group bar: ${error.message}`);
  }

  // Count members for each group
  const groups = (data ?? []) as Array<{ id: string; name: string; owner_id: string }>;
  const groupIds = groups.map(g => g.id);

  let memberCounts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const { data: memberData } = await supabase
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds);

    if (memberData) {
      memberCounts = (memberData as Array<{ group_id: string }>).reduce((acc, m) => {
        acc[m.group_id] = (acc[m.group_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }
  }

  return groups.map(g => ({
    id: g.id,
    name: g.name,
    owner_id: g.owner_id,
    member_count: memberCounts[g.id] || 0,
  }));
}
