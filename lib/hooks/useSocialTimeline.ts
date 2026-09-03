/**
 * Social timeline client hook — cursor-based infinite scroll.
 *
 * Calls get_social_timeline RPC directly via the browser Supabase client.
 * No client-side filtering, sorting, or merging (AUDIT-06 P1-2).
 * Appends pages without duplicates or reordering.
 */

import { useState, useCallback, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DEFAULT_LANGUAGE } from "@/lib/constants";
import type { SocialTimelineItem } from "@/lib/db/socialTimeline";

interface Cursor {
  createdAt: string;
  id: string;
}

interface UseSocialTimelineOptions {
  userId: string;
  languageCode?: string;
  initialItems: SocialTimelineItem[];
  initialCursor: Cursor | null;
}

interface UseSocialTimelineResult {
  items: SocialTimelineItem[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

const PAGE_SIZE = 20;

export function useSocialTimeline(options: UseSocialTimelineOptions): UseSocialTimelineResult {
  const { userId, languageCode = DEFAULT_LANGUAGE, initialItems, initialCursor } = options;

  const [items, setItems] = useState<SocialTimelineItem[]>(initialItems);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const cursorRef = useRef<Cursor | null>(initialCursor);
  const isLoadingMoreRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || isLoadingMoreRef.current) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    isLoadingMoreRef.current = true;
    setIsLoading(true);

    try {
      const res = await supabaseBrowser.rpc("get_social_timeline", {
        p_user_id: userId,
        p_language_code: languageCode,
        p_cursor_created_at: cursor.createdAt,
        p_cursor_id: cursor.id,
        p_limit: PAGE_SIZE,
      });

      if (res.error) throw res.error;

      const newItems = (res.data ?? []) as SocialTimelineItem[];
      setItems((prev) => [...prev, ...newItems]);
      setHasMore(newItems.length === PAGE_SIZE);

      if (newItems.length === PAGE_SIZE) {
        const last = newItems[newItems.length - 1];
        cursorRef.current = { createdAt: last.created_at, id: last.id };
      } else {
        cursorRef.current = null;
      }
    } catch (e) {
      console.error("[useSocialTimeline] loadMore failed:", e instanceof Error ? e.message : e);
      setHasMore(false);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoading(false);
    }
  }, [userId, hasMore, languageCode]);

  return { items, isLoading, hasMore, loadMore };
}
