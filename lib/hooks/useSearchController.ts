/**
 * Search controller hook - connects debounced input to filterStore
 * P9-T04: Search Input System
 *
 * Responsibilities:
 * 1. Hold local input state (raw user typing)
 * 2. Debounce via useDebouncedSearch
 * 3. Normalize via normalizeSearch from feedParams.ts
 * 4. Update filterStore only on debounced, normalized value
 *
 * INVARIANTS:
 * - Immediate typing does NOT update store
 * - Only debounced value updates store
 * - Empty input → null (not empty string)
 * - Normalization reused from feedParams.ts (no duplicate logic)
 *
 * Compliance: 01_PRD.md §16 (filtering), §33 (search behavior)
 *             04_FEED_SQL_SPEC.md (search query handling)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDebouncedSearch } from './useDebouncedSearch';
import { normalizeSearch, normalizeFilterState, serializeFilterStateToURL } from '@/lib/utils/feedParams';
import { useFilterStore } from '@/lib/store/filterStore';

export interface UseSearchControllerOptions {
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
}

export interface UseSearchControllerResult {
  /** Raw input value for controlled input */
  inputValue: string;
  /** Set raw input value (call onChange) */
  setInputValue: (value: string) => void;
  /** Current debounced + normalized search query */
  searchQuery: string | null;
  /** Clear search (sets input to empty, stores null) */
  clearSearch: () => void;
  /** Whether search is currently debouncing */
  isPending: boolean;
}

/**
 * Search controller - binds input to filterStore via debounce + normalization.
 *
 * Example:
 * ```tsx
 * const { inputValue, setInputValue, clearSearch } = useSearchController();
 * return <input value={inputValue} onChange={e => setInputValue(e.target.value)} />;
 * ```
 */
export function useSearchController(
  options: UseSearchControllerOptions = {}
): UseSearchControllerResult {
  const { debounceMs = 300 } = options;

  const router = useRouter();
  const pathname = usePathname();
  // Holds the pending off-/feed nav push for the current typing episode.
  // Re-armed on every store write (trailing edge): each write's push is
  // superseded by the next write's URLSync replace while in flight, so only
  // the last write's push must survive to commit — earlier ones are cleared.
  const feedNavPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current store value for initialization
  const storeSearchQuery = useFilterStore((s) => s.searchQuery);
  const setStoreSearch = useFilterStore((s) => s.setSearch);

  // Local raw input state
  const [inputValue, setInputValue] = useState<string>(storeSearchQuery ?? '');
  const [isPending, setIsPending] = useState(false);

  // Debounced value
  const debouncedValue = useDebouncedSearch(inputValue, debounceMs);

  // Track if debounce is pending
  useEffect(() => {
    setIsPending(inputValue !== debouncedValue);
  }, [inputValue, debouncedValue]);

  // Clear a pending off-feed nav push on unmount so no stale timer fires.
  useEffect(() => {
    return () => {
      if (feedNavPushTimer.current) clearTimeout(feedNavPushTimer.current);
    };
  }, []);

  // Sync debounced value to filterStore (normalized)
  useEffect(() => {
    const normalized = normalizeSearch(debouncedValue);
    // Only update if different from current store value
    if (normalized !== storeSearchQuery) {
      setStoreSearch(normalized);
      if (pathname !== '/feed') {
        if (feedNavPushTimer.current) clearTimeout(feedNavPushTimer.current);
        // Deferred so useFeedURLSync's store-change router.replace on the
        // current route is issued first and cannot discard this push.
        feedNavPushTimer.current = setTimeout(() => {
          const qs = serializeFilterStateToURL(normalizeFilterState(useFilterStore.getState()));
          router.push(`/feed${qs ? `?${qs}` : ''}`);
          feedNavPushTimer.current = null;
        }, 0);
      }
    }
  }, [debouncedValue, storeSearchQuery, setStoreSearch, pathname, router]);

  // Clear search
  const clearSearch = useCallback(() => {
    setInputValue('');
    setStoreSearch(null);
  }, [setStoreSearch]);

  return {
    inputValue,
    setInputValue,
    searchQuery: storeSearchQuery,
    clearSearch,
    isPending,
  };
}
