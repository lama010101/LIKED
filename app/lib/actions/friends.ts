"use server";

import { blockUser, removeFriend, sendFriendInvite } from "@/lib/db/friends";
import { revalidatePath } from "next/cache";

export type FriendActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function removeFriendAction(
  targetUserId: string
): Promise<FriendActionResult> {
  try {
    await removeFriend(targetUserId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to remove friend" };
  }
}

export async function blockUserAction(
  blockedId: string
): Promise<FriendActionResult> {
  try {
    await blockUser(blockedId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to block user" };
  }
}

export async function sendFriendInviteAction(
  toEmail: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      return { ok: false, error: "INVALID_EMAIL" };
    }
    const status = await sendFriendInvite(toEmail);
    if (status === "already") return { ok: false, error: "ALREADY_SENT" };
    if (status === "self") return { ok: false, error: "SELF" };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to send invite" };
  }
}
