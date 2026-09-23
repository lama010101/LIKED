"use server";

/**
 * ACCESS-RAIL-001 — thin server actions over the N7 access RPCs
 * (get_folder_access_users / get_group_access_users).
 *
 * Calls go through the SESSION client so auth.uid() is the caller inside
 * the RPCs (COMPLETE-APP-002 amendment). Empty array on any failure —
 * the rail is advisory UI, never blocking.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface AccessUser {
  userId: string;
  displayName: string;
  avatarKey: string | null;
}

export async function getFolderAccessUsersAction(folderId: string): Promise<AccessUser[]> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.rpc("get_folder_access_users", {
    p_folder_id: folderId,
    p_requester_id: user.id, // RPC gate: must equal auth.uid()
  });
  if (error || !data) return [];
  return data.map((r) => ({ userId: r.user_id, displayName: r.display_name, avatarKey: r.avatar_key }));
}

export async function getGroupAccessUsersAction(groupId: string): Promise<AccessUser[]> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.rpc("get_group_access_users", { p_group_id: groupId });
  if (error || !data) return [];
  return data.map((r) => ({ userId: r.user_id, displayName: r.display_name, avatarKey: r.avatar_key }));
}
