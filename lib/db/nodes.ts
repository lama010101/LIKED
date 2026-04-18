/**
 * Node database operations
 * P2-T02 implementation
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * DuplicateNodeError - thrown when a node with the same URL already exists for the owner
 */
export class DuplicateNodeError extends Error {
  constructor(url: string, ownerId: string) {
    super(`A node with URL "${url}" already exists for owner ${ownerId}`);
    this.name = "DuplicateNodeError";
  }
}

/**
 * Node type matching the database schema
 */
export interface Node {
  id: string;
  url: string | null;
  text_content: string | null;
  title: string | null;
  thumbnail_key: string | null;
  owner_id: string;
  language_code: string;
  origin_user_id: string;
  origin_created_at: string;
  deleted_at: string | null;
  created_at: string;
}

/**
 * NodeInput type for creating nodes
 */
export interface NodeInput {
  url?: string;
  textContent?: string;
}

/**
 * Create a new node (URL or text-only card)
 * 
 * Rules:
 * 1. Either url or textContent must be provided
 * 2. If url is provided, check for duplicate (url, owner_id)
 * 3. Atomic transaction: INSERT nodes + INSERT nodes_sort_cache
 * 4. No edges or causes created (node is private by default)
 * 5. origin_user_id and origin_created_at are set to creator and now()
 */
export async function createNode(userId: string, input: NodeInput): Promise<Node> {
  const supabase = getSupabaseServiceClient();

  const { url, textContent } = input;

  // 1. Validation: Either url or textContent must be provided
  if (!url && !textContent) {
    throw new Error("Either url or textContent must be provided");
  }

  // 2. If URL provided, check for duplicate (url, owner_id)
  if (url) {
    const { data: existingNode, error: checkError } = await supabase
      .from("nodes")
      .select("id")
      .eq("url", url)
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (checkError) {
      throw new Error(`Failed to check for duplicate: ${checkError.message}`);
    }

    if (existingNode) {
      throw new DuplicateNodeError(url, userId);
    }
  }

  // 3. Atomic transaction via RPC function
  // Both INSERTs (nodes + nodes_sort_cache) happen in one Postgres transaction
  const { data, error } = await supabase.rpc("create_node", {
    p_owner_id: userId,
    p_url: url || null,
    p_text_content: textContent || null,
    p_language_code: "en",
  });

  if (error) {
    throw new Error(`Failed to create node: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("Node creation returned no data");
  }

  // Return the created node (first and only row)
  return data[0] as Node;
}

export async function getNodeById(nodeId: string): Promise<Node | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("nodes")
    .select("id, url, text_content, title, thumbnail_key, owner_id, language_code, origin_user_id, origin_created_at, deleted_at, created_at")
    .eq("id", nodeId)
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;
  return data as Node;
}

export async function softDeleteNode(nodeId: string, userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: Implement soft delete per PRD §6.9
  // Set deleted_at = now() but preserve edges and causes
  
  throw new Error("Not implemented");
}
