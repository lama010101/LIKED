/**
 * Folder database operations
 * P4-T01, P13-T01 implementation
 *
 * Per P13-T01:
 * - Admin rights are expressed as edges.permission = 'admin'
 * - Owner (owner_id) retains implicit full rights without an edge
 * - is_project: TRUE when parent_folder_id IS NULL (root-level)
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/db/rpc";
import { Folder } from "@/lib/types/app";
import {
  hasFolderPermission,
  assertFolderPermission,
} from "./permissions";

/**
 * Create a new folder
 *
 * Per P13-T01 E1:
 * - If parentFolderId is null: set is_project = TRUE
 * - If parentFolderId is provided: set is_project = FALSE
 *
 * Uses the create_folder RPC function for atomic transaction with folder_tree setup.
 * Owner is derived from auth context (auth.uid()) inside the RPC.
 */
export async function createFolder(input: {
  name: string;
  parentFolderId: string | null;
}): Promise<{ id: string }> {
  const id = (await rpc("create_folder", {
    p_name: input.name,
    p_parent_folder_id: input.parentFolderId,
  })) as string;
  return { id };
}

/**
 * Fetch folders owned by the current authenticated user.
 * Server-only — derives user from auth context.
 *
 * Uses the get_user_folders RPC (single SQL query with aggregated counts
 * and thumbnails). Replaces the 4-query + in-memory aggregation (AUDIT-06 P2-11).
 */
export async function getUserFolders(): Promise<Folder[]> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const data = await rpc<Folder[]>("get_user_folders", { p_user_id: user.id });
  return data ?? [];
}

/**
 * Rename a folder
 *
 * Per P13-T01 C5:
 * - Check hasFolderPermission(requestingUserId, folderId, 'edit')
 * - Owner always has edit permission
 */
export async function renameFolder(
  folderId: string,
  newName: string,
  requestingUserId: string
): Promise<void> {
  // Verify user has edit permission
  await assertFolderPermission(requestingUserId, folderId, "edit");

  await rpc("rename_folder", {
    p_folder_id: folderId,
    p_name: newName,
  });
}


/**
 * Get folder tree for a user
 *
 * Per P13-T01 E2:
 * - Returns folders owned by user OR shared with user via folder shares
 * - Add is_project to returned folder object
 * - Root-level folders (is_project=TRUE) are returned first
 *
 * Uses the get_folder_tree RPC (single SQL query, RLS-respecting).
 * Replaces the TS in-memory join that used the service client (AUDIT-06 P1-11).
 */
export async function getFolderTree(userId: string): Promise<Folder[]> {
  const data = await rpc<Folder[]>("get_folder_tree", { p_user_id: userId });
  return data ?? [];
}

/**
 * Add a node to a folder
 *
 * Per P13-T01 C5:
 * - Check hasFolderPermission(requestingUserId, folderId, 'contribute')
 * - Owner always has contribute permission
 *
 * This is organizational only - NO edge creation.
 */
export async function addNodeToFolder(
  nodeId: string,
  folderId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // Verify user has contribute permission
  await assertFolderPermission(requestingUserId, folderId, "contribute");

  const { error } = await supabase.rpc("add_node_to_folder", {
    p_node_id: nodeId,
    p_folder_id: folderId,
  });

  if (error) {
    throw new Error(`Failed to add node to folder: ${error.message}`);
  }
}

/**
/**
 * Remove a node from a folder
 *
 * Per P13-T01 C5:
 * - Check hasFolderPermission(requestingUserId, folderId, 'edit')
 * - Owner always has edit permission
 */
export async function removeNodeFromFolder(
  nodeId: string,
  folderId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // Verify user has edit permission
  await assertFolderPermission(requestingUserId, folderId, "edit");

  const { error } = await supabase.rpc("remove_node_from_folder", {
    p_node_id: nodeId,
    p_folder_id: folderId,
  });

  if (error) {
    throw new Error(`Failed to remove node from folder: ${error.message}`);
  }
}

/**
 * Move a folder to a new parent
 *
 * Per P13-T01 A3:
 * - If a folder is given a parent (moved inside another folder), is_project is automatically set to FALSE
 * - A folder with parent_folder_id IS NOT NULL cannot have is_project = TRUE
 */
export async function moveFolder(
  folderId: string,
  newParentFolderId: string | null,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // Verify user has edit permission
  await assertFolderPermission(requestingUserId, folderId, "edit");

  const { error } = await supabase.rpc("move_folder", {
    p_folder_id: folderId,
    p_new_parent_id: newParentFolderId,
  });

  if (error) {
    throw new Error(`Failed to move folder: ${error.message}`);
  }
}

/**
 * Get folder by ID
 */
export async function getFolderById(
  folderId: string,
  userId: string
): Promise<Folder | null> {
  const supabase = getSupabaseServiceClient();

  // Check if user has at least view permission
  const hasAccess = await hasFolderPermission(userId, folderId, "view");
  if (!hasAccess) {
    return null;
  }

  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`Failed to fetch folder: ${error.message}`);
  }

  return data as unknown as Folder;
}

/** Node → folder map via folder_edges (RLS: any authenticated user may
 *  read folder_edges). Used by the feed to label each card with the
 *  folder it belongs to (UX-BATCH-004). First folder wins when a node
 *  sits in several folders. */
export async function getFoldersForNodes(nodeIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (nodeIds.length === 0) return map;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("folder_edges")
    .select("node_id, folder_id")
    .in("node_id", nodeIds);
  if (error) throw new Error(`Failed to fetch node folders: ${error.message}`);
  for (const row of data ?? []) {
    if (!map[row.node_id]) map[row.node_id] = row.folder_id;
  }
  return map;
}
