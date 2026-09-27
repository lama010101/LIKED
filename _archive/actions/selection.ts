"use server";

/**
 * Server actions for multi-select context menu operations (P7-T03, PRD §17).
 *
 * Thin wrappers over the db layer that resolve the authenticated user and
 * return `{ok, ...}` result objects so the client can show toasts without
 * throwing.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { softDeleteNode, restoreNode } from "@/lib/db/nodes";
import { deleteFolder } from "@/lib/db/folders";

export type SelectionActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type BatchTrashResult =
  | { ok: true; trashedIds: string[] }
  | { ok: false; error: string; trashedIds: string[] };

async function requireUserId(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/** Soft-delete a single node (used by single-(×) tap). */
export async function trashNode(nodeId: string): Promise<SelectionActionResult> {
  try {
    const userId = await requireUserId();
    await softDeleteNode(nodeId, userId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trash failed" };
  }
}

/** Restore a soft-deleted node (Undo toast). */
export async function restoreTrashedNode(
  nodeId: string
): Promise<SelectionActionResult> {
  try {
    const userId = await requireUserId();
    await restoreNode(nodeId, userId);
    revalidatePath("/feed");
    revalidatePath("/trash");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Restore failed" };
  }
}

/**
 * Soft-delete every node in `nodeIds`. Best-effort: any individual failure
 * is collected but does not abort the rest. Returns the set of ids that
 * were actually trashed so the client can update optimistic state.
 */
export async function trashNodes(nodeIds: string[]): Promise<BatchTrashResult> {
  const trashedIds: string[] = [];
  try {
    const userId = await requireUserId();
    const errors: string[] = [];
    for (const id of nodeIds) {
      try {
        await softDeleteNode(id, userId);
        trashedIds.push(id);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "unknown");
      }
    }
    revalidatePath("/feed");
    if (errors.length > 0) {
      return {
        ok: false,
        error: `${errors.length} item(s) failed: ${errors[0]}`,
        trashedIds,
      };
    }
    return { ok: true, trashedIds };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Trash failed",
      trashedIds,
    };
  }
}

/**
 * Soft-delete folders (SEL-MENU-001). Reuses lib/db/folders.deleteFolder —
 * owner/admin authz + soft delete preserving causes/edges.
 */
export async function trashFolders(folderIds: string[]): Promise<BatchTrashResult> {
  const trashedIds: string[] = [];
  try {
    const userId = await requireUserId();
    const errors: string[] = [];
    for (const id of folderIds) {
      try {
        await deleteFolder(id, userId);
        trashedIds.push(id);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "unknown");
      }
    }
    revalidatePath("/feed");
    if (errors.length > 0) {
      return { ok: false, error: `${errors.length} folder(s) failed: ${errors[0]}`, trashedIds };
    }
    return { ok: true, trashedIds };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trash failed", trashedIds };
  }
}

/**
 * Soft-delete groups (SEL-MENU-001). Calls the delete_group RPC with the
 * session client — owner/group_admin authz is enforced by auth.uid()
 * inside SQL (migration 108). Members, causes and edges are preserved.
 */
export async function trashGroups(groupIds: string[]): Promise<BatchTrashResult> {
  const trashedIds: string[] = [];
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const errors: string[] = [];
    for (const id of groupIds) {
      const { error } = await (supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).rpc("delete_group", { p_group_id: id });
      if (error) errors.push(error.message);
      else trashedIds.push(id);
    }
    revalidatePath("/feed");
    if (errors.length > 0) {
      return { ok: false, error: `${errors.length} group(s) failed: ${errors[0]}`, trashedIds };
    }
    return { ok: true, trashedIds };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trash failed", trashedIds };
  }
}
