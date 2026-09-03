"use server";

/**
 * Server actions for drag-and-drop operations (P7-T01).
 *
 * Each action resolves the current user from the session and delegates
 * to the existing db layer. Returns `{ok: true}` on success or
 * `{ok: false, error}` on failure so the client can show inline UX
 * without throwing.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { directShare, groupShare, createGroup, shareFolder } from "@/lib/db/sharing";
import { addNodeToFolder, moveFolder } from "@/lib/db/folders";
import { addTagToNode, removeTagFromNode } from "@/lib/db/tags";
import { softDeleteNode } from "@/lib/db/nodes";
import { setCustomOrder } from "@/lib/db/nodePreferences";

export type DndActionResult =
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

/** Node → Friend avatar: direct share. */
export async function dndShareNodeToFriend(
  nodeId: string,
  friendUserId: string
): Promise<DndActionResult> {
  try {
    const sharerId = await requireUserId();
    await directShare({ sharerId, nodeId, targetUserId: friendUserId });
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Share failed" };
  }
}

/** Node → Group chip: group share. */
export async function dndShareNodeToGroup(
  nodeId: string,
  groupId: string
): Promise<DndActionResult> {
  try {
    const sharerId = await requireUserId();
    await groupShare(sharerId, nodeId, groupId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Group share failed" };
  }
}

/** Node → Folder chip: organizational attach (no edge/visibility effects). */
export async function dndAddNodeToFolder(
  nodeId: string,
  folderId: string
): Promise<DndActionResult> {
  try {
    const userId = await requireUserId();
    await addNodeToFolder(nodeId, folderId, userId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Add to folder failed" };
  }
}

/**
 * Node → Folder chip (move semantics): removes the node from the source
 * folder and adds it to the target folder. If sourceFolderId is null
 * (dragging from the home page), this is equivalent to add-only.
 */
export async function dndMoveNodeToFolder(
  nodeId: string,
  targetFolderId: string,
  sourceFolderId: string | null
): Promise<DndActionResult> {
  try {
    const userId = await requireUserId();
    // Atomic: add to target + remove from source in one RPC transaction
    // (AUDIT-06 P1-5: replaces non-atomic add-then-remove pattern).
    const supabase = await getSupabaseServerClient();
    const { error } = await (supabase as unknown as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }).rpc("move_node_to_folder", {
      p_node_id: nodeId,
      p_target_folder_id: targetFolderId,
      p_source_folder_id: sourceFolderId,
      p_user_id: userId,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Move to folder failed" };
  }
}

/** Node → Tag chip: attach tag. */
export async function dndAttachTagToNode(
  nodeId: string,
  tagId: string
): Promise<DndActionResult> {
  try {
    await requireUserId();
    await addTagToNode(tagId, nodeId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Attach tag failed" };
  }
}

/** Tag chip dragged off a node: remove tag. */
export async function dndDetachTagFromNode(
  nodeId: string,
  tagId: string
): Promise<DndActionResult> {
  try {
    await requireUserId();
    await removeTagFromNode(tagId, nodeId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Remove tag failed" };
  }
}

/** Node → Trash icon: soft delete (owner only). */
export async function dndTrashNode(nodeId: string): Promise<DndActionResult> {
  try {
    const userId = await requireUserId();
    await softDeleteNode(nodeId, userId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trash failed" };
  }
}

/**
 * Card → Card: create a new folder with the given name and add both nodes
 * (P7-T02). The prompt flow lives in the client; this action is only
 * invoked after the user confirms a name.
 */
export async function dndAutoCreateFolder(
  name: string,
  nodeIds: string[]
): Promise<DndActionResult & { folderId?: string }> {
  try {
    const ownerId = await requireUserId();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: "Folder name is required" };
    }
    // Atomic: create folder + folder_tree + bulk folder_edges in one RPC
    // transaction (AUDIT-06 P1-5: replaces non-atomic create-then-loop pattern).
    const supabase = await getSupabaseServerClient();
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc("create_folder_with_nodes", {
      p_name: trimmed,
      p_parent_folder_id: null,
      p_node_ids: nodeIds,
      p_user_id: ownerId,
    });
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Create folder failed" };
    }
    revalidatePath("/feed");
    return { ok: true, folderId: data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Create folder failed",
    };
  }
}

/**
 * Friend avatar → Friend avatar: create a new group with the two users as
 * members (owner always included by createGroup). P7-T02.
 */
export async function dndAutoCreateGroup(
  name: string,
  memberIds: string[]
): Promise<DndActionResult & { groupId?: string }> {
  try {
    const ownerId = await requireUserId();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: "Group name is required" };
    }
    const group = await createGroup({ ownerId, name: trimmed, memberIds });
    revalidatePath("/feed");
    return { ok: true, groupId: group.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Create group failed",
    };
  }
}

/**
 * Friend avatar ↔ Folder chip (bidirectional). Shares the folder with a
 * single target user. Wraps lib/db/sharing.shareFolder. P7-T02.
 */
export async function dndShareFolderToFriend(
  folderId: string,
  friendUserId: string
): Promise<DndActionResult> {
  try {
    const sharerId = await requireUserId();
    await shareFolder({ sharerId, folderId, targetUserIds: [friendUserId] });
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Share folder failed",
    };
  }
}

/**
 * Persist a new custom ordering for (user, scope) after a card reorder.
 * P7-T02. The client is responsible for switching the sort dropdown to
 * "custom" — this action only writes the positions.
 */
export async function dndReorderFeed(
  scopeKey: string,
  orderedNodeIds: string[]
): Promise<DndActionResult> {
  try {
    const userId = await requireUserId();
    await setCustomOrder(userId, scopeKey, orderedNodeIds);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Reorder failed",
    };
  }
}

/**
 * Folder → Folder: nest the dragged folder inside the target folder
 * (or move to root if targetFolderId is null). Uses moveFolder RPC which
 * handles is_project flag update and cycle prevention server-side.
 */
export async function dndMoveFolder(
  folderId: string,
  targetFolderId: string
): Promise<DndActionResult> {
  try {
    if (folderId === targetFolderId) {
      return { ok: false, error: "Cannot move a folder into itself" };
    }
    const userId = await requireUserId();
    await moveFolder(folderId, targetFolderId, userId);
    revalidatePath("/feed");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Move folder failed",
    };
  }
}
