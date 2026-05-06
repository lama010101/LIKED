"use server";

import { removeFriend, sendFriendInvite } from "@/lib/db/friends";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function getActorId(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  return user.id;
}

export async function removeFriendAction(
  targetUserId: string
): Promise<void> {
  const actorId = await getActorId();
  await removeFriend(actorId, targetUserId);
}

export async function blockUserAction(
  blockedId: string
): Promise<void> {
  const actorId = await getActorId();
  const supabase = getSupabaseServiceClient();

  // Check if block already exists
  const { data: existing } = await supabase
    .from("blocks")
    .select("blocker_id")
    .eq("blocker_id", actorId)
    .eq("blocked_id", blockedId)
    .maybeSingle();

  if (!existing) {
    // Insert into blocks table
    await supabase
      .from("blocks")
      .insert({
        blocker_id: actorId,
        blocked_id: blockedId,
      });
  }

  // Remove friend invites in both directions (best-effort)
  try {
    await removeFriend(actorId, blockedId);
  } catch {
    // Ignore error - row may not exist
  }
  try {
    await removeFriend(blockedId, actorId);
  } catch {
    // Ignore error - row may not exist
  }
}

export async function sendFriendInviteAction(
  toEmail: string
): Promise<{ error?: string }> {
  const actorId = await getActorId();
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(toEmail)) {
    return { error: "INVALID_EMAIL" };
  }

  try {
    await sendFriendInvite(actorId, toEmail);
    return {};
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
      return { error: "ALREADY_SENT" };
    }
    throw error;
  }
}
