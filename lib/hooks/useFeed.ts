/**
 * Feed data fetching hook — canonical path
 * P9-T06-FIX: Unified feed system with cursor-based pagination
 *
 * COMPLIANCE: 04_FEED_SQL_SPEC.md §2 (get_feed function)
 *
 * INVARIANTS:
 * - Calls ONLY get_feed RPC (no legacy RPCs)
 * - Uses buildFeedParams as single mapping authority
 * - No client-side filtering or sorting
 * - Cursor pagination: appends without duplicates or reordering
 * - Search uses p_search_query (NOT separate search_nodes RPC)
 *
 * DO NOT:
 * - Add conditional RPC selection
 * - Add client-side filtering/sorting
 * - Use get_visible_nodes, search_nodes, or get_nodes_in_folder
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useFilterStore } from "@/lib/store/filterStore";
import { buildFeedParams } from "@/lib/utils/feedParams";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PAGINATION, DEFAULT_LANGUAGE } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────────────

/** Feed node as returned by get_feed RPC — matches SQL RETURN TABLE */
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

interface Cursor {
  createdAt: string;
  nodeId: string;
}

interface UseFeedOptions {
  userId: string;
  languageCode?: string;
}

interface UseFeedResult {
  nodes: FeedNode[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  refresh: () => void;
}

// ── Pagination constants ────────────────────────────────────────

const FEED_INITIAL_LOAD = 30;
const FEED_PAGE_SIZE = PAGINATION.defaultPageSize;

// ── Hook ────────────────────────────────────────────────────────

export function useFeed(options: UseFeedOptions): UseFeedResult {
  const { userId, languageCode = DEFAULT_LANGUAGE } = options;

  // Subscribe to store state for dependency tracking
  const view = useFilterStore((s) => s.view);
  const sort = useFilterStore((s) => s.sort);
  const mineSubTab = useFilterStore((s) => s.mineSubTab);
  const friendId = useFilterStore((s) => s.friendId);
  const folderId = useFilterStore((s) => s.folderId);
  const groupId = useFilterStore((s) => s.groupId);
  const searchQuery = useFilterStore((s) => s.searchQuery);

  // Get arrays from store state directly (not via selector to avoid INVARIANT 1 violation)
  const tagIds = useFilterStore.getState().tagIds;
  const filterFriendIds = useFilterStore.getState().filterFriendIds;
  const filterFolderIds = useFilterStore.getState().filterFolderIds;

  // Presentation state read for type completeness (not used by get_feed)
  const viewMode = useFilterStore((s) => s.viewMode);
  const zoom = useFilterStore((s) => s.zoom);

  // Memoize feed params to prevent re-render cascade
  const feedParams = useMemo(
    () =>
      buildFeedParams(
        {
          view,
          sort,
          mineSubTab,
          friendId,
          folderId,
          groupId,
          tagIds,
          filterFriendIds,
          filterFolderIds,
          searchQuery,
          viewMode,
          zoom,
          currentContextKey: '',
          folderStack: [],
        },
        userId,
        languageCode
      ),
    [view, sort, mineSubTab, friendId, folderId, groupId, searchQuery, userId, languageCode, viewMode, zoom, tagIds, filterFriendIds, filterFolderIds]
  );

  const [nodes, setNodes] = useState<FeedNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Cursor tracking for pagination
  const cursorRef = useRef<Cursor | null>(null);
  const isLoadingMoreRef = useRef(false);

  // Reset and fetch first page when filters change
  useEffect(() => {
    if (!userId) {
      setNodes([]);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    cursorRef.current = null;

    async function fetchFirstPage() {
      setIsLoading(true);
      setError(null);
      try {
        const limit = FEED_INITIAL_LOAD;

        const res = await Promise.resolve(supabaseBrowser.rpc("get_feed", {
          ...feedParams,
          p_cursor_created_at: undefined,
          p_cursor_node_id: undefined,
          p_limit: limit,
        }));
        if (res.error) throw res.error;
        const data = (res.data ?? []) as unknown as FeedNode[];

        if (!cancelled) {
          setNodes(data);
          const count = data.length > 0 ? (data[0].total_count ?? 0) : 0;
          setTotalCount(count);
          setHasMore(data.length === limit);

          // Set cursor for next page
          if (data.length === limit) {
            const last = data[data.length - 1];
            cursorRef.current = { createdAt: last.created_at, nodeId: last.node_id };
          } else {
            cursorRef.current = null;
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setNodes([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchFirstPage();

    return () => {
      cancelled = true;
    };
  }, [feedParams, refreshTick, userId]);

  // Load more (next page via cursor)
  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || isLoadingMoreRef.current) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    isLoadingMoreRef.current = true;

    const limit = FEED_PAGE_SIZE;

    try {
      // Standard cursor-based pagination
      const res = await Promise.resolve(supabaseBrowser.rpc("get_feed", {
        ...feedParams,
        p_cursor_created_at: cursor.createdAt,
        p_cursor_node_id: cursor.nodeId,
        p_limit: limit,
      }));
      if (res.error) throw res.error;
      const newNodes = (res.data ?? []) as unknown as FeedNode[];
      setNodes((prev) => [...prev, ...newNodes]);
      setHasMore(newNodes.length === limit);

      if (newNodes.length === limit) {
        const last = newNodes[newNodes.length - 1];
        cursorRef.current = { createdAt: last.created_at, nodeId: last.node_id };
      } else {
        cursorRef.current = null;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [userId, hasMore, feedParams]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return {
    nodes,
    isLoading,
    error,
    hasMore,
    totalCount,
    loadMore,
    refresh,
  };
}
