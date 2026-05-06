/**
 * Node database operations
 * P2-T02 implementation
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { rpc } from "@/lib/db/rpc";
import { getVisibleNodeById } from "@/lib/db/visibility";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = ReturnType<typeof getSupabaseServiceClient> & { rpc: (...a: any[]) => any };

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
 * Metadata returned by the `extract-node-metadata` Edge Function
 * (PRD §15.1) and accepted by `createNode` as the second argument.
 * When omitted, the RPC persists a node with defaults (title from URL
 * or first 120 chars of text, no tags, no thumbnail).
 */
export interface NodeMetadata {
  title?: string | null;
  thumbnailKey?: string | null;
  languageCode?: string | null;
  suggestedTags?: string[];
}

/**
 * Create a new node (URL or text-only card).
 *
 * Rules:
 * 1. Either url or textContent must be provided
 * 2. If url is provided, check for duplicate (url, owner_id)
 * 3. Atomic transaction via `create_node_with_metadata` RPC:
 *    nodes INSERT + nodes_sort_cache INSERT + tag lookups/creates +
 *    tag_edges INSERT all in a single Postgres transaction (§22).
 * 4. No edges or causes created (node is private by default).
 * 5. origin_user_id / origin_created_at = creator / now().
 *
 * P8-T02: accepts optional `metadata` from the extract-node-metadata
 * Edge Function. On Edge Function failure the caller should still call
 * `createNode(userId, input)` without metadata and defaults are applied.
 */
export async function createNode(
  userId: string,
  input: NodeInput,
  metadata?: NodeMetadata
): Promise<Node> {
  const supabase = getSupabaseServiceClient();

  const { url, textContent } = input;

  // 1. Validation
  if (!url && !textContent) {
    throw new Error("Either url or textContent must be provided");
  }

  // 2. Duplicate URL check per owner
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

  // 3. Default title fallback: URL if present, else first 120 chars of text.
  const fallbackTitle = url
    ? url
    : textContent
      ? textContent.trim().slice(0, 120)
      : null;

  const finalTitle = metadata?.title?.trim() || fallbackTitle;
  const finalThumb = metadata?.thumbnailKey ?? null;
  const finalLang = metadata?.languageCode?.trim() || "en";
  const tagLabels = (metadata?.suggestedTags ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // 4. Atomic transaction (nodes + sort_cache + tags + tag_edges)
  const { data, error } = await (supabase as AnySupabase).rpc(
    "create_node_with_metadata",
    {
      p_owner_id: userId,
      p_url: url ?? null,
      p_text_content: textContent ?? null,
      p_title: finalTitle,
      p_thumbnail_key: finalThumb,
      p_language_code: finalLang,
      p_tag_labels: tagLabels,
    }
  );

  if (error) {
    throw new Error(`Failed to create node: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error("Node creation returned no data");
  }

  return data[0] as Node;
}

/**
 * Fetch a single node by ID, enforcing visibility.
 * Delegates to getVisibleNodeById which includes block check.
 */
export async function getNodeById(
  userId: string,
  nodeId: string
): Promise<Node | null> {
  return getVisibleNodeById(userId, nodeId);
}

/**
 * Soft delete a node per PRD §6.9: set `deleted_at = now()` but preserve
 * all causes and edges so a later restore re-grants visibility to users
 * who already had edges. Only the node owner may soft-delete.
 */
export async function softDeleteNode(nodeId: string, userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: node, error: fetchErr } = await supabase
    .from("nodes")
    .select("owner_id, deleted_at")
    .eq("id", nodeId)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to fetch node: ${fetchErr.message}`);
  }
  if (!node) {
    throw new Error("Node not found");
  }
  if (node.owner_id !== userId) {
    throw new Error("Only the owner can delete this node");
  }
  if (node.deleted_at) {
    return; // already trashed — no-op
  }

  await rpc("set_node_deleted", {
    p_node_id: nodeId,
    p_deleted: true,
  });
}

/**
 * Restore a soft-deleted node (P7-T03, PRD §17.3 Undo). Clears `deleted_at`.
 * Because causes/edges are preserved on soft-delete, clearing deleted_at
 * automatically restores visibility for every friend with an existing edge.
 * Only the owner may restore.
 */
export async function restoreNode(nodeId: string, userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: node, error: fetchErr } = await supabase
    .from("nodes")
    .select("owner_id, deleted_at")
    .eq("id", nodeId)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to fetch node: ${fetchErr.message}`);
  }
  if (!node) {
    throw new Error("Node not found");
  }
  if (node.owner_id !== userId) {
    throw new Error("Only the owner can restore this node");
  }
  if (!node.deleted_at) {
    return; // already live — no-op
  }

  await rpc("set_node_deleted", {
    p_node_id: nodeId,
    p_deleted: false,
  });
}

/**
 * Permanently delete a node (P7-T04, PRD §20.2). Hard DELETE from `nodes`
 * cascades to edges/causes/ratings via FK constraints — irreversible.
 * Only the owner may permanently delete, and only if the node is already
 * soft-deleted (must go through Trash).
 */
export async function hardDeleteNode(nodeId: string, userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: node, error: fetchErr } = await supabase
    .from("nodes")
    .select("owner_id, deleted_at")
    .eq("id", nodeId)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to fetch node: ${fetchErr.message}`);
  }
  if (!node) {
    throw new Error("Node not found");
  }
  if (node.owner_id !== userId) {
    throw new Error("Only the owner can permanently delete this node");
  }
  if (!node.deleted_at) {
    throw new Error("Node must be soft-deleted (in Trash) before permanent delete");
  }

  const { error: deleteErr } = await supabase
    .from("nodes")
    .delete()
    .eq("id", nodeId);

  if (deleteErr) {
    throw new Error(`Failed to permanently delete node: ${deleteErr.message}`);
  }
}

/**
 * Trashed-node row for the Trash view (P7-T04, PRD §20.1).
 * `deleted_at` is non-null by construction here.
 */
export interface TrashedNode {
  id: string;
  url: string | null;
  text_content: string | null;
  title: string | null;
  thumbnail_key: string | null;
  deleted_at: string;
  created_at: string;
}

/**
 * List all soft-deleted nodes owned by `userId`, newest-deleted first.
 */
export async function getTrashedNodes(userId: string): Promise<TrashedNode[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("nodes")
    .select("id, url, text_content, title, thumbnail_key, deleted_at, created_at")
    .eq("owner_id", userId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list trashed nodes: ${error.message}`);
  }
  return (data ?? []) as TrashedNode[];
}

/** Count of soft-deleted nodes owned by the user (for trash-icon badge). */
export async function getTrashedCount(userId: string): Promise<number> {
  const supabase = getSupabaseServiceClient();

  const { count, error } = await supabase
    .from("nodes")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .not("deleted_at", "is", null);

  if (error) {
    throw new Error(`Failed to count trashed nodes: ${error.message}`);
  }
  return count ?? 0;
}
