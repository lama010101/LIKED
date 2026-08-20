"use server";

/**
 * Server actions for the Card Detail sheet (P8-T03, PRD §14).
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCardDetail,
  incrementViewCount,
  updateNodeTitle,
  type CardDetail,
  getFriendRatingsForNode,
} from "@/lib/db/cardDetail";
import { upsertRating } from "@/lib/db/ratings";
import { softDeleteNode } from "@/lib/db/nodes";
import { addTagToNode, removeTagFromNode } from "@/lib/db/tags";

async function requireUserId(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function fetchCardDetail(
  nodeId: string,
  languageCode = "en"
): Promise<
  { ok: true; detail: CardDetail } | { ok: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const detail = await getCardDetail(userId, nodeId, languageCode);
    if (!detail) {
      return { ok: false, error: "Node not found or not visible" };
    }
    // Fire-and-forget view-count bump.
    void incrementViewCount(nodeId).catch(() => {});
    return { ok: true, detail };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load card",
    };
  }
}

export async function rateCardAction(
  nodeId: string,
  score: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId();
    await upsertRating(userId, nodeId, score);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Rate failed" };
  }
}

export async function updateNodeTitleAction(
  nodeId: string,
  title: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId();
    await updateNodeTitle(userId, nodeId, title);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update title",
    };
  }
}

export async function trashCardAction(
  nodeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId();
    await softDeleteNode(nodeId, userId);
    revalidatePath("/feed");
    revalidatePath("/trash");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Trash failed",
    };
  }
}

export async function addTagToNodeAction(
  nodeId: string,
  tagId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUserId();
    await addTagToNode(tagId, nodeId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Add tag failed",
    };
  }
}

export async function removeTagFromNodeAction(
  nodeId: string,
  tagId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUserId();
    await removeTagFromNode(tagId, nodeId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Remove tag failed",
    };
  }
}

export async function getFriendRatingsAction(
  nodeId: string
): Promise<
  { ok: true; ratings: Array<{ userId: string; displayName: string; avatarKey: string | null; score: number; updatedAt: string }> } | { ok: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const ratings = await getFriendRatingsForNode(nodeId, userId);
    return { ok: true, ratings };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load friend ratings",
    };
  }
}
