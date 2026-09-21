/**
 * Feed data fetching hook — canonical path
 * P9-T06-FIX: Unified feed system with cursor-based pagination
 *
 * COMPLIANCE: 04_FEED_SQL_SPEC.md §2 (get_feed function)
 *
 * INVARIANTS:
 * - Fetches ONLY via fetchFeedPageAction → getFeed → get_feed RPC
 *   (lib/db/feed.ts is the sole get_feed caller — AUDIT-06 P1-1)
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
import { fetchFeedPageAction } from "@/app/lib/actions/feed";
import { getCustomOrderAction } from "@/app/lib/actions/customOrder";
import { PAGINATION, DEFAULT_LANGUAGE } from "@/lib/constants";
import type { FeedNode } from "@/lib/types/feed";

// Re-export so existing `import { FeedNode } from "@/lib/hooks/useFeed"` keeps working.
export type { FeedNode };

// ── Types ──────────────────────────────────────────────────────

interface Cursor {
  createdAt: string;
  nodeId: string;
}

interface UseFeedOptions {
  userId: string;
  languageCode?: string;
  /** Scope key for custom-order lookup (user_node_preferences single source of truth). */
  scopeKey?: string;
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

const FEED_INITIAL_LOAD = PAGINATION.initialLoadSize;
const FEED_PAGE_SIZE = PAGINATION.defaultPageSize;

// ── Hook ────────────────────────────────────────────────────────

export function useFeed(options: UseFeedOptions): UseFeedResult {
  const { userId, languageCode = DEFAULT_LANGUAGE, scopeKey } = options;

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

  const [nodes, setNodes] = useState<FeedNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Custom order from DB (user_node_preferences — single source of truth,
  // AUDIT-06 P2-1). Resolved async, keyed to the current
  // (sort, scopeKey, refreshTick) — a stale resolved value is never used.
  const orderKey = `${sort}|${scopeKey ?? ""}|${refreshTick}`;
  const [customOrder, setCustomOrder] = useState<{ key: string; ids: string[] } | null>(null);
  useEffect(() => {
    if (sort !== "custom" || !scopeKey) return;
    let cancelled = false;
    getCustomOrderAction(scopeKey)
      .then((ids) => {
        if (!cancelled) setCustomOrder({ key: orderKey, ids });
      })
      .catch(() => {
        if (!cancelled) setCustomOrder({ key: orderKey, ids: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [orderKey, sort, scopeKey]);
  // null = not yet resolved for the current key → feed fetch waits for it.
  const customOrderIds = useMemo(
    () =>
      sort === "custom" && scopeKey
        ? customOrder?.key === orderKey
          ? customOrder.ids
          : null
        : [],
    [sort, scopeKey, customOrder, orderKey]
  );

  // Stable identity for the params builder — [] fallback memoized so the
  // feedParams useMemo doesn't see a new array every render.
  const resolvedCustomOrderIds = useMemo(() => customOrderIds ?? [], [customOrderIds]);

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
        languageCode,
        resolvedCustomOrderIds
      ),
    [view, sort, mineSubTab, friendId, folderId, groupId, searchQuery, userId, languageCode, viewMode, zoom, tagIds, filterFriendIds, filterFolderIds, resolvedCustomOrderIds]
  );

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
    // Wait for the DB custom order before fetching a 'custom' feed —
    // the order is a get_feed input (p_custom_order_ids), sourced from
    // user_node_preferences, never from local state.
    if (sort === "custom" && scopeKey && customOrderIds === null) return;

    let cancelled = false;
    cursorRef.current = null;

    async function fetchFirstPage() {
      setIsLoading(true);
      setError(null);
      try {
        const limit = FEED_INITIAL_LOAD;

        const res = await fetchFeedPageAction(feedParams, true);
        const data = res.nodes;

        if (!cancelled) {
          setNodes(data);
          setTotalCount(res.totalCount);
          setHasMore(data.length === limit);
          cursorRef.current = res.nextCursor;
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
  }, [feedParams, refreshTick, userId, sort, scopeKey, customOrderIds]);

  // Load more (next page via cursor)
  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || isLoadingMoreRef.current) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    isLoadingMoreRef.current = true;

    const limit = FEED_PAGE_SIZE;

    try {
      // Standard cursor-based pagination
      const res = await fetchFeedPageAction(
        {
          ...feedParams,
          p_cursor_created_at: cursor.createdAt,
          p_cursor_node_id: cursor.nodeId,
        },
        false
      );
      const newNodes = res.nodes;
      setNodes((prev) => [...prev, ...newNodes]);
      setHasMore(newNodes.length === limit);
      cursorRef.current = res.nextCursor;
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
