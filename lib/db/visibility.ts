/**
 * Visibility query functions
 * P2-T01 implementation (fixed P2-T01-FIX)
 *
 * VISIBILITY MODEL (FINAL) per PRD §5:
 * A node is visible to a user IFF:
 * - node.deleted_at IS NULL
 * - AND (user IS owner OR at least one active edge exists)
 * - AND NOT blocked(current_user, owner)
 *
 * CRITICAL: This is the ONLY mechanism for determining visibility.
 * Implemented via Postgres RPC (migration 005_get_visible_nodes.sql).
 * PostgREST filter syntax cannot express OR + EXISTS subqueries.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * VisibleNode type matching the nodes table schema from PRD §35
 */
export interface VisibleNode {
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

export type FeedView = 'all' | 'mine' | 'received';
export type MineSubFilter = 'all' | 'not_shared' | 'shared';

/**
 * Get all visible nodes for a user, with optional view filter.
 * Delegates to get_visible_nodes(p_user_id, p_sort, p_view, p_mine_filter) Postgres function.
 *
 * P9-T01: Added p_view ('all'|'mine'|'received') and p_mine_filter ('all'|'not_shared'|'shared')
 * for feed tab filtering. Defaults to 'all'/'all' for backward compatibility.
 */
export async function getVisibleNodes(
  userId: string,
  view: FeedView = 'all',
  mineFilter: MineSubFilter = 'all'
): Promise<VisibleNode[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_visible_nodes", {
    p_user_id: userId,
    p_sort: "newest",
    p_view: view,
    p_mine_filter: mineFilter,
  });

  if (error) {
    throw new Error(`Failed to fetch visible nodes: ${error.message}`);
  }

  return (data ?? []) as VisibleNode[];
}

/**
 * Get a single visible node by ID.
 * Delegates to get_visible_node_by_id(p_user_id, p_node_id) Postgres function.
 */
export async function getVisibleNodeById(
  userId: string,
  nodeId: string
): Promise<VisibleNode | null> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_visible_node_by_id", {
    p_user_id: userId,
    p_node_id: nodeId,
  });

  if (error) {
    throw new Error(`Failed to fetch visible node: ${error.message}`);
  }

  return (data as VisibleNode[])?.[0] ?? null;
}
