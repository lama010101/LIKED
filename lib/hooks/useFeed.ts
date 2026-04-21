/**
 * Feed data fetching hook
 * P2-T03 + P6-T03 (sort wiring)
 * P9-T03-B: Sort mapping removed — buildFeedParams is single authority
 */

import { useState, useEffect, useCallback } from "react";
import { Node, FeedState, SortOption, FeedFilters } from "@/lib/types/app";
import { useFilterStore } from "@/lib/store/filterStore";
import { buildFeedParams } from "@/lib/utils/feedParams";
import { supabaseBrowser } from "@/lib/supabase/client";

interface UseFeedOptions {
  userId: string;
  feedState?: FeedState;
  sortOption?: SortOption;
  filters?: FeedFilters;
  folderId?: string;
  friendId?: string;
  groupId?: string;
}

interface UseFeedResult {
  nodes: Node[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

export function useFeed(options: UseFeedOptions): UseFeedResult {
  const { userId, folderId, sortOption: sortOverride } = options;
  const storeSort = useFilterStore((s) => s.sort);
  const sortOption = sortOverride ?? storeSort;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadMore = useCallback(() => {
    // Pagination not yet implemented; RPCs return full result set.
  }, []);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      setNodes([]);
      return;
    }

    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        let data: Node[] | null = null;

        // Use buildFeedParams as single mapping authority for sort
        const feedParams = buildFeedParams(
          { ...useFilterStore.getState(), sort: sortOption },
          userId
        );

        if (folderId) {
          const res = await supabaseBrowser.rpc("get_nodes_in_folder", {
            p_user_id: userId,
            p_folder_id: folderId,
            p_sort: feedParams.p_sort,
          });
          if (res.error) throw res.error;
          data = (res.data ?? null) as unknown as Node[] | null;
        } else {
          const res = await supabaseBrowser.rpc("get_visible_nodes", {
            p_user_id: userId,
            p_sort: feedParams.p_sort,
          });
          if (res.error) throw res.error;
          data = (res.data ?? null) as unknown as Node[] | null;
        }

        if (!cancelled) {
          setNodes(data ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setNodes([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [userId, folderId, sortOption, refreshTick]);

  return {
    nodes,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
