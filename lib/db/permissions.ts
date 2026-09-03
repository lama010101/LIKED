/**
 * Permission system database operations
 * P13-T01 implementation - Unified Permissions + Projects Naming
 *
 * Permission hierarchy (from PRD):
 *   view < comment < contribute < edit < reshare < admin
 *   1      2        3            4     5         6
 *
 * Semantics per object type:
 * - Nodes:   view | comment | edit | reshare
 * - Folders: view | contribute | edit | admin
 *            (comment and reshare are invalid for folders)
 *
 * Owner always has implicit admin rights regardless of edges.
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { Permission, PERMISSION_RANK } from "@/lib/types/app";

export type { Permission };
export { PERMISSION_RANK };

/**
 * Check if user has required permission on a node
 *
 * Returns TRUE if:
 *   - user is nodes.owner_id (owner has implicit admin)
 *   OR
 *   - MAX(permission_rank) on edges for this node/user >= required_rank
 *
 * @param userId - The user to check
 * @param nodeId - The node to check permissions on
 * @param required - The minimum permission required
 * @returns Promise<boolean>
 */
export async function hasNodePermission(
  userId: string,
  nodeId: string,
  required: Permission
): Promise<boolean> {
  const supabase = getSupabaseServiceClient();

  // Use the RPC function for permission check
  const { data, error } = await supabase.rpc("has_node_permission", {
    p_user_id: userId,
    p_node_id: nodeId,
    p_required_permission: required,
  });

  if (error) {
    throw new Error(`Failed to check node permission: ${error.message}`);
  }

  return data ?? false;
}

/**
 * Check if user has required permission on a folder
 *
 * Returns TRUE if:
 *   - user is folders.owner_id (owner has implicit admin)
 *   OR
 *   - MAX(permission_rank) on edges where cause.metadata->>'folder_id' matches
 *     this folder and user_id matches >= required_rank
 *
 * Folder permissions are stored on the edges of nodes inside the folder,
 * created during shareFolder().
 *
 * @param userId - The user to check
 * @param folderId - The folder to check permissions on
 * @param required - The minimum permission required
 * @returns Promise<boolean>
 */
export async function hasFolderPermission(
  userId: string,
  folderId: string,
  required: Permission
): Promise<boolean> {
  const supabase = getSupabaseServiceClient();

  // Use the RPC function for permission check
  const { data, error } = await supabase.rpc("has_folder_permission", {
    p_user_id: userId,
    p_folder_id: folderId,
    p_required_permission: required,
  });

  if (error) {
    throw new Error(`Failed to check folder permission: ${error.message}`);
  }

  return data ?? false;
}

/**
 * Get the effective permission level a user has on a node
 *
 * Returns the highest permission level, or null if:
 *   - user is not owner
 *   - user has no edges for this node
 *
 * @param userId - The user to check
 * @param nodeId - The node to check
 * @returns Promise<Permission | null>
 */
export async function getEffectiveNodePermission(
  userId: string,
  nodeId: string
): Promise<Permission | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("get_node_permission", {
    p_user_id: userId,
    p_node_id: nodeId,
  });

  if (error) {
    throw new Error(`Failed to get node permission: ${error.message}`);
  }

  if (!data) return null;

  // Validate the returned permission is a valid Permission type
  const validPermissions: Permission[] = [
    "view",
    "comment",
    "contribute",
    "edit",
    "reshare",
    "admin",
  ];
  if (validPermissions.includes(data as Permission)) {
    return data as Permission;
  }

  return null;
}

/**
 * Get the effective permission level a user has on a folder
 *
 * Returns the highest permission level, or null if:
 *   - user is not owner
 *   - user has no edges for nodes in this folder
 *
 * @param userId - The user to check
 * @param folderId - The folder to check
 * @returns Promise<Permission | null>
 */
export async function getEffectiveFolderPermission(
  userId: string,
  folderId: string
): Promise<Permission | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("get_folder_permission", {
    p_user_id: userId,
    p_folder_id: folderId,
  });

  if (error) {
    throw new Error(`Failed to get folder permission: ${error.message}`);
  }

  if (!data) return null;

  // Validate the returned permission is a valid Permission type
  const validPermissions: Permission[] = [
    "view",
    "comment",
    "contribute",
    "edit",
    "reshare",
    "admin",
  ];
  if (validPermissions.includes(data as Permission)) {
    return data as Permission;
  }

  return null;
}

/**
 * PermissionError class for permission-related failures
 */
export class PermissionError extends Error {
  constructor(
    message: string,
    public readonly required: Permission,
    public readonly actual: Permission | null
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

/**
 * Assert that user has required permission on a folder
 *
 * @throws PermissionError if user lacks required permission
 */
export async function assertFolderPermission(
  userId: string,
  folderId: string,
  required: Permission
): Promise<void> {
  const hasPermission = await hasFolderPermission(userId, folderId, required);

  if (!hasPermission) {
    const actual = await getEffectiveFolderPermission(userId, folderId);
    throw new PermissionError(
      `User ${userId} lacks required permission '${required}' on folder ${folderId}`,
      required,
      actual
    );
  }
}
