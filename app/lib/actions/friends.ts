"use server";

import { removeFriend, sendFriendInvite } from "@/lib/db/friends";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type FriendActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function getActorId(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  return user.id;
}

export async function removeFriendAction(
  targetUserId: string
): Promise<FriendActionResult> {
  try {
    const actorId = await getActorId();
    await removeFriend(actorId, targetUserId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to remove friend" };
  }
}

export async function blockUserAction(
  blockedId: string
): Promise<FriendActionResult> {
  try {
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

    revalidatePath("/feed");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to block user" };
  }
}

export async function sendFriendInviteAction(
  toEmail: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actorId = await getActorId();
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      return { ok: false, error: "INVALID_EMAIL" };
    }

    await sendFriendInvite(actorId, toEmail);
    revalidatePath("/feed");
    return { ok: true };
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes("duplicate") || error.message.includes("unique"))) {
      return { ok: false, error: "ALREADY_SENT" };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Failed to send invite" };
  }
}
