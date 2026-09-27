"use server";

/**
 * UIX-PORT-00 / UIX-02: additive server actions for group reads.
 * Group creation reuses `dndAutoCreateGroup` (app/lib/actions/dnd.ts)
 * which already wraps `create_group`.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getGroupMembers, GroupMemberEntry } from "@/lib/db/groups";

export async function getGroupMembersAction(
  groupId: string
): Promise<GroupMemberEntry[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return [];
    return await getGroupMembers(user.id, groupId);
  } catch {
    return [];
  }
}
