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
import { Folder, Permission } from "@/lib/types/app";
import {
  hasFolderPermission,
  assertFolderPermission,
  PermissionError,
} from "./permissions";

export interface CreateFolderInput {
  ownerId: string;
  name: string;
  parentFolderId?: string;
}

/**
 * Create a new folder
 *
 * Per P13-T01 E1:
 * - If parentFolderId is null/undefined: set is_project = TRUE
 * - If parentFolderId is provided: set is_project = FALSE
 *
 * Uses the create_folder RPC function for atomic transaction with folder_tree setup.
 */
export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("create_folder", {
    p_owner_id: input.ownerId,
    p_name: input.name,
    p_parent_folder_id: input.parentFolderId,
  });

  if (error) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("Create folder returned no data");
  }

  return data[0] as Folder;
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
  const supabase = getSupabaseServiceClient();

  // Verify user has edit permission
  await assertFolderPermission(requestingUserId, folderId, "edit");

  const { error } = await supabase
    .from("folders")
    .update({ name: newName })
    .eq("id", folderId);

  if (error) {
    throw new Error(`Failed to rename folder: ${error.message}`);
  }
}

/**
 * Soft delete a folder
 *
 * Per P13-T01 C5:
 * - Check hasFolderPermission(requestingUserId, folderId, 'admin') OR is owner
 * - Owner can always delete
 * - Sets deleted_at, preserves causes and edges
 */
export async function deleteFolder(
  folderId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // Verify user is owner or has admin permission
  const { data: folder, error: fetchError } = await supabase
    .from("folders")
    .select("owner_id")
    .eq("id", folderId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch folder: ${fetchError.message}`);
  }

  const isOwner = folder.owner_id === requestingUserId;

  if (!isOwner) {
    // Not owner, check for admin permission
    const hasAdmin = await hasFolderPermission(requestingUserId, folderId, "admin");
    if (!hasAdmin) {
      throw new PermissionError(
        "Only folder owner or admin can delete folder",
        "admin",
        null
      );
    }
  }

  // Soft delete: set deleted_at
  const { error } = await supabase
    .from("folders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", folderId);

  if (error) {
    throw new Error(`Failed to delete folder: ${error.message}`);
  }
}

/**
 * Get folder tree for a user
 *
 * Per P13-T01 E2:
 * - Returns folders owned by user OR shared with user via folder shares
 * - Add is_project to returned folder object
 * - Root-level folders (is_project=TRUE) are returned first
 */
export async function getFolderTree(userId: string): Promise<Folder[]> {
  const supabase = getSupabaseServiceClient();

  // Get folders owned by user
  const { data: ownedFolders, error: ownedError } = await supabase
    .from("folders")
    .select("*")
    .eq("owner_id", userId)
    .is("deleted_at", null);

  if (ownedError) {
    throw new Error(`Failed to fetch owned folders: ${ownedError.message}`);
  }

  // Get folder IDs shared with user via causes metadata
  // First get all causes with folder_id that have edges for this user
  const { data: sharedCauses, error: causesError } = await supabase
    .from("causes")
    .select("id, metadata->>folder_id")
    .not("metadata->>folder_id", "is", null)
    .eq("cause_type", "direct_share");

  if (causesError) {
    throw new Error(`Failed to fetch shared causes: ${causesError.message}`);
  }

  // Filter to only include causes where user has an edge
  const folderIdsWithAccess: string[] = [];
  for (const cause of sharedCauses ?? []) {
    const folderId = cause.folder_id as string | null;
    const causeId = cause.id as string;
    if (!folderId) continue;

    // Check if user has an edge for any node in this folder share
    const { data: hasEdge } = await supabase
      .from("edges")
      .select("id")
      .eq("user_id", userId)
      .eq("cause_id", causeId)
      .limit(1)
      .maybeSingle();

    if (hasEdge) {
      folderIdsWithAccess.push(folderId);
    }
  }

  // Remove duplicates
  const uniqueFolderIds = [...new Set(folderIdsWithAccess)];

  // Fetch shared folder details if any
  let sharedFolders: Folder[] = [];
  if (uniqueFolderIds.length > 0) {
    const { data: shared, error: sharedFetchError } = await supabase
      .from("folders")
      .select("*")
      .in("id", uniqueFolderIds)
      .is("deleted_at", null);

    if (sharedFetchError) {
      throw new Error(`Failed to fetch shared folder details: ${sharedFetchError.message}`);
    }

    sharedFolders = (shared ?? []) as Folder[];
  }

  // Combine and deduplicate
  const allFolders = [...(ownedFolders ?? []), ...sharedFolders];
  const uniqueFolders = allFolders.filter(
    (folder, index, self) => index === self.findIndex((f) => f.id === folder.id)
  );

  // Sort: projects first (is_project=TRUE), then by name
  uniqueFolders.sort((a, b) => {
    if (a.is_project && !b.is_project) return -1;
    if (!a.is_project && b.is_project) return 1;
    return a.name.localeCompare(b.name);
  });

  return uniqueFolders as Folder[];
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

  const { error } = await supabase.from("folder_edges").insert({
    node_id: nodeId,
    folder_id: folderId,
  });

  if (error) {
    if (error.message.includes("unique constraint")) {
      // Node already in folder, not an error
      return;
    }
    throw new Error(`Failed to add node to folder: ${error.message}`);
  }
}

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

  const { error } = await supabase
    .from("folder_edges")
    .delete()
    .eq("node_id", nodeId)
    .eq("folder_id", folderId);

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

  // Determine is_project based on new parent
  const isProject = newParentFolderId === null;

  const { error } = await supabase
    .from("folders")
    .update({
      parent_folder_id: newParentFolderId,
      is_project: isProject,
    })
    .eq("id", folderId);

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

  return data as Folder;
}
