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
  PermissionError,
} from "./permissions";
import { logger } from "@/lib/utils/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

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
 */
export async function getUserFolders(): Promise<Folder[]> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Step 1: fetch all folders owned by user
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch user folders: ${error.message}`);
  }

  const folders = (data ?? []) as Array<{
    id: string;
    name: string;
    owner_id: string;
    parent_folder_id: string | null;
    is_project: boolean;
    color_hex: string;
    deleted_at: string | null;
    created_at: string;
  }>;

  if (folders.length === 0) return [];

  const folderIds = folders.map(f => f.id);

  // Step 2: fetch card counts per folder from folder_edges
  const { data: edgeCounts, error: edgeError } = await supabase
    .from('folder_edges')
    .select('folder_id')
    .in('folder_id', folderIds);

  if (edgeError) {
    logger.error('Failed to fetch folder edge counts:', edgeError.message);
  }

  // Build card count map
  const cardCountMap: Record<string, number> = {};
  for (const edge of edgeCounts ?? []) {
    const fid = (edge as { folder_id: string }).folder_id;
    cardCountMap[fid] = (cardCountMap[fid] ?? 0) + 1;
  }

  // Step 3: fetch thumbnail keys for child nodes (up to 4 per folder)
  const { data: nodeThumbnails, error: thumbError } = await supabase
    .from('folder_edges')
    .select('folder_id, nodes!inner(thumbnail_key)')
    .in('folder_id', folderIds)
    .not('nodes.thumbnail_key', 'is', null);

  if (thumbError) {
    logger.error('Failed to fetch folder thumbnails:', thumbError.message);
  }

  // Build thumbnail map (up to 4 per folder)
  const thumbnailMap: Record<string, string[]> = {};
  for (const item of (nodeThumbnails ?? []) as unknown as Array<{ folder_id: string; nodes: { thumbnail_key: string } }>) {
    const edge = item;
    const fid = edge.folder_id;
    const thumbKey = edge.nodes.thumbnail_key;
    if (!thumbnailMap[fid]) {
      thumbnailMap[fid] = [];
    }
    if (thumbnailMap[fid].length < 4) {
      thumbnailMap[fid].push(thumbKey);
    }
  }

  // Step 4: map folders with card counts + thumbnails + subfolder counts
  const mapped: Folder[] = folders.map(f => ({
    ...f,
    node_count: cardCountMap[f.id] ?? 0,
    thumbnails: thumbnailMap[f.id] ?? [],
  }));

  // Add subfolder counts to node_count
  return mapped.map(folder => ({
    ...folder,
    node_count: folder.node_count + mapped.filter(f => f.parent_folder_id === folder.id).length,
  }));
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

  const { error } = await (supabase as AnySupabase).rpc("delete_folder", {
    p_folder_id: folderId,
  });

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
  // Use two parallel queries to avoid N+1 pattern
  const [userEdgesResult, sharedCausesResult] = await Promise.all([
    // Query 1: all cause_ids where user has an edge
    supabase
      .from("edges")
      .select("cause_id")
      .eq("user_id", userId),
    // Query 2: all direct_share causes with a folder_id
    supabase
      .from("causes")
      .select("id, metadata")
      .eq("cause_type", "direct_share")
      .not("metadata->>folder_id", "is", null)
  ]);

  const { data: userEdges, error: edgesError } = userEdgesResult;
  const { data: sharedCauses, error: causesError } = sharedCausesResult;

  if (edgesError) {
    throw new Error(`Failed to fetch user edges: ${edgesError.message}`);
  }

  if (causesError) {
    throw new Error(`Failed to fetch shared causes: ${causesError.message}`);
  }

  // Join in memory — O(N) but 2 queries total, not N+1
  const userCauseIds = new Set((userEdges ?? []).map(e => e.cause_id));
  const folderIdsWithAccess: string[] = [];
  for (const cause of sharedCauses ?? []) {
    if (!userCauseIds.has(cause.id)) continue;
    const folderId = (cause.metadata as Record<string, string> | null)?.folder_id;
    if (folderId) folderIdsWithAccess.push(folderId);
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

  // Map to Folder type with computed is_project
  const foldersWithProject = uniqueFolders.map((folder) => ({
    ...folder,
    is_project: folder.parent_folder_id === null,
  })) as Folder[];

  // Sort: projects first (is_project=TRUE), then by name
  foldersWithProject.sort((a, b) => {
    if (a.is_project && !b.is_project) return -1;
    if (!a.is_project && b.is_project) return 1;
    return a.name.localeCompare(b.name);
  });

  return foldersWithProject;
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

  const { error } = await (supabase as AnySupabase).rpc("add_node_to_folder", {
    p_node_id: nodeId,
    p_folder_id: folderId,
  });

  if (error) {
    throw new Error(`Failed to add node to folder: ${error.message}`);
  }
}

/**
 * Find or create the user's "Unsorted" folder.
 * Every user gets one on first node creation so that no node is ever
 * without a folder (home page shows only folders).
 *
 * @returns The folder UUID of the user's "Unsorted" folder.
 */
export async function getOrCreateUnsortedFolder(userId: string): Promise<string> {
  const supabase = getSupabaseServiceClient();

  // Check if user already has an "Unsorted" folder
  const { data: existing } = await supabase
    .from("folders")
    .select("id")
    .eq("owner_id", userId)
    .eq("name", "Unsorted")
    .is("deleted_at", null)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id as string;
  }

  // Create "Unsorted" folder
  const { data: created, error: createError } = await supabase
    .from("folders")
    .insert({
      name: "Unsorted",
      owner_id: userId,
      parent_folder_id: null,
      is_project: true,
      color_hex: "#6b7280",
      deleted_at: null,
    })
    .select("id")
    .single();

  if (createError || !created) {
    // Race condition: another request may have created it concurrently.
    // Retry the fetch.
    const { data: retry } = await supabase
      .from("folders")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", "Unsorted")
      .is("deleted_at", null)
      .limit(1);
    if (retry && retry.length > 0) {
      return retry[0].id as string;
    }
    throw new Error(`Failed to create Unsorted folder: ${createError?.message ?? "unknown"}`);
  }

  const folderId = created.id as string;

  // Insert folder_tree self-reference (required by folder_tree schema)
  await supabase
    .from("folder_tree")
    .insert({ folder_id: folderId, ancestor_id: folderId, depth: 0 });

  return folderId;
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

  const { error } = await (supabase as AnySupabase).rpc("remove_node_from_folder", {
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

  const { error } = await (supabase as AnySupabase).rpc("move_folder", {
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

  return data as Folder;
}
