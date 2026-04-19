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
} from "@/lib/db/cardDetail";
import { upsertRating } from "@/lib/db/ratings";
import { softDeleteNode } from "@/lib/db/nodes";

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
