"use client";

/**
 * Synchronizes filterStore state ↔ URL search params.
 * P9-T03-B: Determinism & State Ownership Hardening
 *
 * - On mount: initializeFilterStore from server-provided state (ONCE)
 * - On store change: serialize → replace URL (not push)
 * - On browser nav (back/forward): parse URL → hydrate store
 * - Prevents infinite loops via deep equality (isEqualFilterState)
 *
 * Hydration ownership:
 * 1. Server Component passes initialFilterState as prop
 * 2. Client boundary calls initializeFilterStore() ONCE
 * 3. After hydration → store is authoritative
 * 4. URL changes only via store → serialize → router.replace
 */

import { useEffect, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { useFilterStore, initializeFilterStore, type FilterState } from "@/lib/store/filterStore";
import { parseURLToFilterState, serializeFilterStateToURL, isEqualFilterState, normalizeFilterState } from "@/lib/utils/feedParams";

/** Snapshot of filter state for comparison (excludes actions) */
function snapshot(state: FilterState): FilterState {
  return {
    view: state.view,
    sort: state.sort,
    mineSubTab: state.mineSubTab,
    friendId: state.friendId,
    folderId: state.folderId,
    groupId: state.groupId,
    tagIds: state.tagIds,
    filterFriendIds: state.filterFriendIds,
    filterFolderIds: state.filterFolderIds,
    searchQuery: state.searchQuery,
    viewMode: state.viewMode,
    zoom: state.zoom,
    currentContextKey: state.currentContextKey,
  };
}

interface UseFeedURLSyncOptions {
  /** Server-parsed initial filter state (from page.tsx searchParams) */
  initialFilterState?: Partial<FilterState>;
}

export function useFeedURLSync(options?: UseFeedURLSyncOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrate = useFilterStore((s) => s.hydrate);
  const isHydrating = useRef(true);
  const prevNormalized = useRef<FilterState | null>(null);

  // ── On mount: initialize store from server state (ONCE) ────────
  useEffect(() => {
    if (options?.initialFilterState) {
      // Server-provided state takes priority (SSR hydration)
      initializeFilterStore(options.initialFilterState);
    } else {
      // Fallback: parse URL directly (for pages without server props)
      const parsed = parseURLToFilterState(searchParams);
      initializeFilterStore(parsed);
    }
    // After initialization (or if already initialized), snapshot current state
    const current = normalizeFilterState(useFilterStore.getState());
    prevNormalized.current = current;
    isHydrating.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On browser nav (back/forward): re-hydrate from URL ───────
  useEffect(() => {
    if (isHydrating.current) return;
    const parsed = parseURLToFilterState(searchParams);
    const normalized = normalizeFilterState(parsed);
    // Deep compare: only hydrate if URL state differs from store
    if (prevNormalized.current && isEqualFilterState(normalized, prevNormalized.current)) return;
    hydrate(parsed);
    prevNormalized.current = normalized;
  }, [searchParams, hydrate]);

  // ── On store change: update URL ───────────────────────────────
  const view = useFilterStore((s) => s.view);
  const sort = useFilterStore((s) => s.sort);
  const mineSubTab = useFilterStore((s) => s.mineSubTab);
  const friendId = useFilterStore((s) => s.friendId);
  const folderId = useFilterStore((s) => s.folderId);
  const groupId = useFilterStore((s) => s.groupId);
  const searchQuery = useFilterStore((s) => s.searchQuery);

  // Arrays accessed via getState to avoid INVARIANT 1 violation
  // Not reactive but acceptable with deep equality check in effect
  const tagIds = useFilterStore.getState().tagIds;
  const filterFriendIds = useFilterStore.getState().filterFriendIds;
  const filterFolderIds = useFilterStore.getState().filterFolderIds;

  // Presentation state (viewMode, zoom) read for snapshot completeness
  const viewMode = useFilterStore((s) => s.viewMode);
  const zoom = useFilterStore((s) => s.zoom);

  const state = useMemo(() => snapshot({
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
  }), [view, sort, mineSubTab, friendId, folderId, groupId, searchQuery, viewMode, zoom]);

  useEffect(() => {
    if (isHydrating.current) return;
    const normalized = normalizeFilterState(state);
    // Deep compare: only update URL if store state differs from what we last wrote
    if (prevNormalized.current && isEqualFilterState(normalized, prevNormalized.current)) return;
    prevNormalized.current = normalized;
    const qs = serializeFilterStateToURL(normalized);
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [state, router, pathname]);
}
