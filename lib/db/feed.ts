/**
 * Feed data access layer — server-side wrapper for get_feed RPC.
 * P9-T06-FIX: Canonical Feed System Implementation
 *
 * COMPLIANCE: 04_FEED_SQL_SPEC.md §2 (get_feed function), §8 (TypeScript wrapper)
 *
 * INVARIANTS:
 * - Calls get_feed RPC directly with NO added logic (no filtering,
 *   sorting, or deduplication — all done in SQL).
 * - All parameters come from buildFeedParams (single mapping authority).
 * - Returns data exactly as SQL produces it.
 *
 * Two legitimate callers of get_feed exist (both call the RPC directly):
 *   1. This file (getFeed) — server-side, used by SSR pages.
 *   2. lib/hooks/useFeed.ts — client-side, for infinite-scroll cursor
 *      pagination (cannot route through a server action without breaking
 *      pagination and adding a round-trip per page).
 * The invariant is "no logic around the RPC", not "single caller".
 *
 * DO NOT:
 * - Add client-side filtering or sorting
 * - Create alternative feed query paths
 * - Transform or reshape SQL output
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PAGINATION, DEFAULT_LANGUAGE } from "@/lib/constants";
import type { FeedNode, FeedParams, FeedResult } from "@/lib/types/feed";

// Re-export so existing `import { FeedNode } from "@/lib/db/feed"` keeps working.
export type { FeedNode, FeedParams, FeedResult };

// ── Pagination constants ────────────────────────────────────────

const FEED_INITIAL_LOAD = PAGINATION.initialLoadSize;
const FEED_PAGE_SIZE = PAGINATION.defaultPageSize;

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
    p_exclude_foldered: params.p_exclude_foldered ?? false,
    p_custom_order_ids: params.p_custom_order_ids,
  });

  if (error) throw new Error(`Feed query failed: ${error.message}`);

  const nodes = (data ?? []) as FeedNode[];
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
