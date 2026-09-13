/**
 * Group read helpers (service client).
 *
 * UIX-PORT-00 / UIX-02: additive read for the PROTO V2 group-context
 * member list. `group_members` RLS only lets a non-owner member see
 * their own row via direct client reads, so member listing for both
 * roles goes through this service-backed path with an explicit
 * caller-membership check — same pattern as `getGroupBar`.
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";

export interface GroupMemberEntry {
  user_id: string;
  display_name: string | null;
  avatar_key: string | null;
}

/**
 * List members of a group with display fields.
 * Caller must be a member of the group (owners are members via
 * create_group). Returns [] when the caller is not a member or the
 * group does not exist.
 */
export async function getGroupMembers(
  callerId: string,
  groupId: string
): Promise<GroupMemberEntry[]> {
  const supabase = getSupabaseServiceClient();

  const { data: callerRow } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", callerId)
    .maybeSingle();

  if (!callerRow) return [];

  const { data: memberRows, error: memberError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  if (memberError || !memberRows || memberRows.length === 0) return [];

  const userIds = memberRows.map((r) => r.user_id);

  const { data: userRows, error: userError } = await supabase
    .from("users")
    .select("id, display_name, avatar_key")
    .in("id", userIds);

  if (userError || !userRows) return [];

  return userRows.map((u) => ({
    user_id: u.id,
    display_name: u.display_name,
    avatar_key: u.avatar_key,
  }));
}
