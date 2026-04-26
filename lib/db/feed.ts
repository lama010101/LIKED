/**
 * Feed data access layer — SINGLE ownership boundary for feed queries.
 * P9-T06-FIX: Canonical Feed System Implementation
 *
 * COMPLIANCE: 04_FEED_SQL_SPEC.md §2 (get_feed function), §8 (TypeScript wrapper)
 *
 * INVARIANTS:
 * - This is the ONLY file that calls get_feed RPC
 * - Contains NO business logic, filtering, or sorting
 * - All parameters come from buildFeedParams (single mapping authority)
 * - Returns data exactly as SQL produces it
 *
 * DO NOT:
 * - Add client-side filtering or sorting
 * - Create alternative feed query paths
 * - Transform or reshape SQL output
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PAGINATION, DEFAULT_LANGUAGE } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────────────

/** Feed node as returned by get_feed RPC — matches SQL RETURN TABLE exactly */
export interface FeedNode {
  node_id: string;
  url: string | null;
  text_content: string | null;
  title: string | null;
  thumbnail_key: string | null;
  owner_id: string;
  language_code: string;
  origin_user_id: string;
  origin_created_at: string;
  created_at: string;

  avg_rating: number | null;
  view_count: number | null;
  share_count: number | null;

  direction: "own" | "sent" | "received";

  sender_id: string | null;
  sender_name: string | null;
  sender_avatar_key: string | null;

  tags: Array<{ tag_id: string; color_hex: string; label: string }>;

  total_count: number;
}

/** Parameters for getFeed — mirrors buildFeedParams output */
export interface FeedParams {
  p_user_id: string;
  p_language_code: string;
  p_view?: string;
  p_friend_id?: string;
  p_folder_id?: string;
  p_group_id?: string;
  p_filter_tag_ids?: string[];
  p_filter_friend_ids?: string[];
  p_filter_folder_ids?: string[];
  p_search_query?: string;
  p_sort?: string;
  p_cursor_created_at?: string;
  p_cursor_node_id?: string;
  p_limit?: number;
}

/** Result from getFeed call */
export interface FeedResult {
  nodes: FeedNode[];
  totalCount: number;
  nextCursor: { createdAt: string; nodeId: string } | null;
}

// ── Pagination constants ────────────────────────────────────────

const FEED_INITIAL_LOAD = 30;
const FEED_PAGE_SIZE = PAGINATION.defaultPageSize;

// ── Context key builder for custom sort ────────────────────────

function buildContextKey(params: FeedParams): string {
  if (params.p_folder_id) return `folder:${params.p_folder_id}`;
  if (params.p_friend_id) return `friend:${params.p_friend_id}`;
  if (params.p_group_id) return `group:${params.p_group_id}`;
  return "personal";
}

// ── Canonical feed function ─────────────────────────────────────

/**
 * Get feed data via canonical get_feed RPC.
 * This is the ONLY function that fetches feed data.
 *
 * @param params - Parameters from buildFeedParams (single mapping authority)
 * @param isInitialLoad - Use larger page size for first load
 * @returns FeedResult with nodes, total count, and next cursor
 */
export async function getFeed(
  params: FeedParams,
  isInitialLoad = false
): Promise<FeedResult> {
  const supabase = await getSupabaseServerClient();
  const limit = isInitialLoad ? FEED_INITIAL_LOAD : FEED_PAGE_SIZE;

  // Standard path — uses get_feed with cursor pagination
  const { data, error } = await supabase.rpc("get_feed", {
    p_user_id: params.p_user_id,
    p_language_code: params.p_language_code || DEFAULT_LANGUAGE,
    p_view: params.p_view ?? "all",
    p_friend_id: params.p_friend_id,
    p_folder_id: params.p_folder_id,
    p_group_id: params.p_group_id,
    p_filter_tag_ids: params.p_filter_tag_ids,
    p_filter_friend_ids: params.p_filter_friend_ids,
    p_filter_folder_ids: params.p_filter_folder_ids,
    p_search_query: params.p_search_query,
    p_sort: params.p_sort ?? "newest",
    p_cursor_created_at: params.p_cursor_created_at,
    p_cursor_node_id: params.p_cursor_node_id,
    p_limit: limit,
  });

  if (error) throw new Error(`Feed query failed: ${error.message}`);

  const nodes = (data ?? []) as unknown as FeedNode[];
  const totalCount = nodes.length > 0 ? (nodes[0].total_count ?? 0) : 0;

  // Derive next cursor from last item if page is full
  const nextCursor =
    nodes.length === limit
      ? {
          createdAt: nodes[nodes.length - 1].created_at,
          nodeId: nodes[nodes.length - 1].node_id,
        }
      : null;

  return { nodes, totalCount, nextCursor };
}
