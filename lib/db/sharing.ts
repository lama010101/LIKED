/**
 * Sharing system database operations
 * P3-T01, P3-T02, P3-T04, P13-T01 implementation
 *
 * Constraints per PRD §6.1-6.4:
 * - All writes are atomic transactions via RPC
 * - Cause deletion cascades to edges (ON DELETE CASCADE)
 * - No UNIQUE(node_id, user_id) on edges
 * - No path checks in unshare operations
 * - Permission levels supported per P13-T01
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { Tables } from "@/lib/types/database";

export type Cause = Tables<"causes">;

export interface ShareInput {
  sharerId: string;
  nodeId: string;
  targetUserId: string;
}

export interface FolderShareInput {
  sharerId: string;
  folderId: string;
  targetUserIds: string[];
}

/**
 * Direct share: creates cause + 2 edges (sent + received)
 * Per P3-T01, P13-T01 - NOT idempotent by design
 *
 * Creates exactly 1 cause and 2 edges per call:
 * - 1 cause: cause_type = 'direct_share' with permission in metadata
 * - 1 edge: direction = 'received' for target user with permission
 * - 1 edge: direction = 'sent' for sharer with permission
 *
 * Permission validation:
 * - Only 'view', 'comment', 'edit', 'reshare' are valid for nodes
 * - 'contribute' and 'admin' are invalid for node shares
 *
 * Calling twice creates 2 causes and 4 edges - no error.
 * All writes happen in a single atomic Postgres transaction.
 *
 * Before sharing: verifies sharerId is owner OR hasNodePermission(sharerId, nodeId, 'reshare').
 * If neither: throws PermissionError('Reshare not permitted').
 *
 * @returns The created cause_id for reference
 */
export async function directShare(input: ShareInput): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("direct_share", {
    p_sharer_id: input.sharerId,
    p_node_id: input.nodeId,
    p_target_user_id: input.targetUserId,
  });

  if (error) {
    throw new Error(`Direct share failed: ${error.message}`);
  }

  return data;
}

/**
 * Unshare: delete cause → edges cascade automatically
 * Per P3-T02 - deterministic, no path checks
 *
 * 1. Verifies cause was created by requestingUserId
 * 2. DELETEs the cause row
 * 3. ON DELETE CASCADE removes all associated edges
 *
 * No path checks. No "other edges remaining" logic.
 * Pure deterministic deletion per invariant I-06.
 *
 * @throws Error if cause not found or user not authorized
 */
export async function unshare(
  causeId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("unshare", {
    p_cause_id: causeId,
    p_requesting_user_id: requestingUserId,
  });

  if (error) {
    // Handle specific error codes from the RPC function
    if (error.message.includes("not found")) {
      throw new Error(`Cause not found: ${causeId}`);
    }
    if (error.message.includes("Unauthorized")) {
      throw new Error(`Unauthorized: cannot delete cause ${causeId}`);
    }
    throw new Error(`Unshare failed: ${error.message}`);
  }
}

/**
 * Get all direct_share causes for a node created by a specific user
 *
 * Returns all causes where:
 * - cause_type = 'direct_share'
 * - created_by = userId
 * - metadata->>'node_id' = nodeId
 *
 * Used to display "who you shared this with" and for unshare UI.
 * Simple SELECT query - no RPC needed.
 */
export async function getShareCausesForNode(
  nodeId: string,
  userId: string
): Promise<Cause[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("causes")
    .select("id, cause_type, created_by, metadata, created_at")
    .eq("cause_type", "direct_share")
    .eq("created_by", userId)
    .filter("metadata->>node_id", "eq", nodeId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch share causes: ${error.message}`);
  }

  return (data ?? []) as Cause[];
}

/**
 * Group share: creates cause + group_node + edges for all members
 * Per P3-T04, P13-T01
 *
 * In ONE atomic transaction:
 * 1. INSERT cause: cause_type = 'group_share', metadata={node_id, group_id, permission}
 * 2. INSERT group_nodes row
 * 3. For each member: INSERT edge with direction='received', depth=1, permission
 *
 * Permission validation:
 * - Only 'view', 'comment', 'edit', 'reshare' are valid for nodes
 * - Default is 'view'
 *
 * @returns The created cause_id
 */
export async function groupShare(
  sharerId: string,
  nodeId: string,
  groupId: string
): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("group_share", {
    p_sharer_id: sharerId,
    p_node_id: nodeId,
    p_group_id: groupId,
  });

  if (error) {
    throw new Error(`Group share failed: ${error.message}`);
  }

  return data;
}

/**
 * Group unshare: delete group_node + cause → edges cascade
 * Per P3-T04
 *
 * In ONE atomic transaction:
 * 1. DELETE from group_nodes WHERE node_id=X AND group_id=Y
 * 2. DELETE from causes WHERE cause_type='group_share' AND metadata matches
 *    (CASCADE deletes all associated edges automatically)
 *
 * No path checks. No "other edges remaining" logic.
 */
export async function groupUnshare(
  sharerId: string,
  nodeId: string,
  groupId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("group_unshare", {
    p_sharer_id: sharerId,
    p_node_id: nodeId,
    p_group_id: groupId,
  });

  if (error) {
    throw new Error(`Group unshare failed: ${error.message}`);
  }
}

export interface CreateGroupInput {
  ownerId: string;
  name: string;
  memberIds: string[]; // Will include owner automatically
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  deleted_at: string | null;
  created_at: string;
}

/**
 * Create a new group with members
 * Per P3-T04
 *
 * In ONE atomic transaction:
 * 1. INSERT into groups: name, owner_id
 * 2. INSERT owner as member
 * 3. INSERT additional members (skipping duplicates, including owner)
 *
 * @returns The created group row
 */
export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("create_group", {
    p_owner_id: input.ownerId,
    p_name: input.name,
    p_member_ids: input.memberIds,
  });

  if (error) {
    throw new Error(`Create group failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("Create group returned no data");
  }

  return data[0] as Group;
}

/**
 * Folder share: creates N causes for all nodes + users in folder
 * Per P4-T02, P13-T01
 *
 * Allowed permission values for folders: 'view' | 'contribute' | 'edit' | 'admin'
 * 'comment' and 'reshare' are invalid for folder shares — throws if passed.
 *
 * Verify sharerId is folder owner OR hasFolderPermission(sharerId, folderId, 'admin').
 *
 * @returns folder_share_op_id for grouped revocation
 */
export async function shareFolder(input: FolderShareInput): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("share_folder", {
    p_sharer_id: input.sharerId,
    p_folder_id: input.folderId,
    p_target_user_ids: input.targetUserIds,
  });

  if (error) {
    throw new Error(`Folder share failed: ${error.message}`);
  }

  return data;
}

/**
 * Folder unshare: delete all causes with matching folder_share_op_id
 * Per P4-T02, P13-T01
 *
 * Verify requestingUserId is folder owner or has 'admin' permission on folder.
 * DELETE all causes WHERE metadata->>'folder_share_op_id' = $op_id.
 * Edges cascade automatically.
 */
export async function unshareFolderOp(
  folderShareOpId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("causes")
    .delete()
    .filter("metadata->>folder_share_op_id", "eq", folderShareOpId)
    .eq("created_by", requestingUserId);

  if (error) {
    throw new Error(`Folder unshare failed: ${error.message}`);
  }
}

