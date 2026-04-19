"use server";

/**
 * Server actions for the Trash view (P7-T04, PRD §20).
 *
 * - `listTrashedNodes`: fetch the current user's soft-deleted nodes
 * - `restoreTrashedNode`: clears `deleted_at` — edges/causes preserved
 *   automatically re-grant visibility to friends
 * - `hardDeleteTrashedNode`: irreversible hard DELETE; must be called
 *   from behind a confirmation dialog per §20.2
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  getTrashedCount,
  getTrashedNodes,
  hardDeleteNode,
  restoreNode,
  type TrashedNode,
} from "@/lib/db/nodes";

export type TrashActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireUserId(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function getTrashCount(): Promise<number> {
  try {
    const userId = await requireUserId();
    return await getTrashedCount(userId);
  } catch {
    return 0;
  }
}

export async function listTrashedNodes(): Promise<
  { ok: true; items: TrashedNode[] } | { ok: false; error: string }
> {
  try {
    const userId = await requireUserId();
    const items = await getTrashedNodes(userId);
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to list trash" };
  }
}

export async function restoreFromTrash(nodeId: string): Promise<TrashActionResult> {
  try {
    const userId = await requireUserId();
    await restoreNode(nodeId, userId);
    revalidatePath("/trash");
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Restore failed" };
  }
}

export async function permanentlyDeleteFromTrash(
  nodeId: string
): Promise<TrashActionResult> {
  try {
    const userId = await requireUserId();
    await hardDeleteNode(nodeId, userId);
    revalidatePath("/trash");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Permanent delete failed",
    };
  }
}
