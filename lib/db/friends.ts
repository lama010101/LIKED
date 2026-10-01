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
import { rpc } from "@/lib/db/rpc";

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
 * Sends a friend invite (single RPC, migration 112). Resolves the invitee by
 * auth email inside SQL; duplicates are ignored by the (from_user_id, to_email)
 * unique constraint. Returns "invited" | "already" | "self".
 */
export async function sendFriendInvite(toEmail: string): Promise<string> {
  return rpc<string>("invite_friend", { p_email: toEmail });
}

/**
 * Removes a friend in both directions (single RPC, migration 112).
 */
export async function removeFriend(targetUserId: string): Promise<void> {
  await rpc<void>("remove_friend", { p_target_user_id: targetUserId });
}

/**
 * Blocks a user and removes invites both ways, atomically (single RPC, migration 112).
 */
export async function blockUser(blockedId: string): Promise<void> {
  await rpc<void>("block_user", { p_blocked_id: blockedId });
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

/** create_group RPC — service client only: migration 093 intentionally
 *  revoked EXECUTE from `authenticated`, so session-client calls throw
 *  "permission denied" (the #441 crash on Friends → New Group). */
export async function createGroup(ownerId: string, name: string, memberIds: string[] = []) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("create_group", {
    p_owner_id: ownerId,
    p_name: name,
    p_member_ids: memberIds,
  });
  if (error) throw new Error(`Failed to create group: ${error.message}`);
  return data;
}
