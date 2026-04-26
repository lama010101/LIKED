/**
 * Filter state management with Zustand
 * P9-T03-B: Determinism & State Ownership Hardening
 *
 * INVARIANTS (non-negotiable):
 * 1. URL is the single source of truth at entry; after hydration → store is authoritative
 * 2. Only ONE context active at a time (friend OR folder OR group OR none)
 * 3. Filters are AND-combined (never OR)
 * 4. State → URL → Server → Feed must be fully deterministic
 * 5. Same URL MUST always produce identical feed results
 * 6. All inputs normalized on write (no un-normalized state in store)
 * 7. Sort uses snake_case ONLY (no camelCase in state)
 *
 * Compliance: 01_PRD.md §8 (context), §16 (filtering), §7 (feed)
 *             03_TECHNICAL_ARCHITECTURE.md §5.2 (store structure)
 *             04_FEED_SQL_SPEC.md §2 (get_feed parameter contract)
 */

import { create } from "zustand";
import { normalizeFilterState, normalizeArray, normalizeSearch, isValidId } from "@/lib/utils/feedParams";

export type FeedViewTab = "all" | "mine" | "received";
export type MineSubTab = "all" | "not_shared" | "shared";
export type SortOption = "newest" | "oldest" | "most_shared" | "highest_rated" | "custom";

export interface FilterState {
  view: FeedViewTab;
  sort: SortOption;
  mineSubTab: MineSubTab;
  friendId: string | null;
  folderId: string | null;
  groupId: string | null;
  tagIds: string[];
  filterFriendIds: string[];
  filterFolderIds: string[];
  searchQuery: string | null;
  viewMode: 'col' | 'mason' | 'list' | 'horiz' | 'free';
  zoom: number;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  view: "all",
  sort: "newest",
  mineSubTab: "all",
  friendId: null,
  folderId: null,
  groupId: null,
  tagIds: [],
  filterFriendIds: [],
  filterFolderIds: [],
  searchQuery: null,
  viewMode: "col",
  zoom: 2,
};

interface FilterStore extends FilterState {
  setView: (view: FeedViewTab) => void;
  setSort: (sort: SortOption) => void;
  setMineSubTab: (tab: MineSubTab) => void;
  setContext: (context: { friendId?: string | null; folderId?: string | null; groupId?: string | null }) => void;
  clearContext: () => void;
  setTagFilters: (tagIds: string[]) => void;
  toggleTagFilter: (tagId: string) => void;
  setFriendFilters: (friendIds: string[]) => void;
  toggleFriendFilter: (friendId: string) => void;
  setFolderFilters: (folderIds: string[]) => void;
  toggleFolderFilter: (folderId: string) => void;
  setSearch: (query: string | null) => void;
  setViewMode: (viewMode: FilterState['viewMode']) => void;
  setZoom: (zoom: number) => void;
  clearFilters: () => void;
  resetFilters: () => void;
  clearAll: () => void;
  hydrate: (state: Partial<FilterState>) => void;
  hasActiveFilters: () => boolean;
  activeFilterCount: () => number;
  activeContextType: () => "friend" | "folder" | "group" | null;
}

// ── SSR hydration guard ──────────────────────────────────────────

let initialized = false;

/**
 * Initialize filterStore from server-provided state.
 * Must run exactly ONCE before any render.
 * Called from the top-level client boundary (e.g. FeedContainer).
 * After this call, the store is authoritative.
 */
export function initializeFilterStore(initialState: Partial<FilterState>): void {
  if (initialized) return;
  initialized = true;
  const normalized = normalizeFilterState(initialState);
  useFilterStore.getState().hydrate(normalized);
}

/** Reset initialization guard (for testing only) */
export function _resetInitGuard(): void {
  initialized = false;
}

// Read persisted presentation state safely (client-only)
const getStoredViewMode = (): FilterState['viewMode'] => {
  if (typeof window === 'undefined') return DEFAULT_FILTER_STATE.viewMode;
  try {
    const s = localStorage.getItem('liked.view');
    if (s) return JSON.parse(s) as FilterState['viewMode'];
  } catch {}
  return DEFAULT_FILTER_STATE.viewMode;
};

const getStoredZoom = (): number => {
  if (typeof window === 'undefined') return DEFAULT_FILTER_STATE.zoom;
  try {
    const s = localStorage.getItem('liked.zoom');
    if (s) return JSON.parse(s) as number;
  } catch {}
  return DEFAULT_FILTER_STATE.zoom;
};

export const useFilterStore = create<FilterStore>((set, get) => ({
  ...DEFAULT_FILTER_STATE,
  viewMode: getStoredViewMode(),
  zoom: getStoredZoom(),

  // ── View ───────────────────────────────────────────────────────
  setView: (view) => set({ view }),
  setSort: (sort) => set({ sort }),
  setMineSubTab: (mineSubTab) => set({ mineSubTab }),

  // ── Presentation (shared reactive state, persisted to localStorage) ──
  setViewMode: (viewMode) => {
    set({ viewMode });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('liked.view', JSON.stringify(viewMode)); } catch {}
    }
  },
  setZoom: (zoom) => {
    set({ zoom });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('liked.zoom', JSON.stringify(zoom)); } catch {}
    }
  },

  // ── Context (mutually exclusive, normalized) ──────────────────
  setContext: (context) => {
    // Enforce: only one context active at a time.
    // Priority: friend > folder > group (deterministic).
    // IDs validated.
    const next: Partial<FilterState> = {
      friendId: null,
      folderId: null,
      groupId: null,
    };
    if ("friendId" in context && context.friendId !== undefined) {
      next.friendId = context.friendId && isValidId(context.friendId) ? context.friendId : null;
    }
    if ("folderId" in context && context.folderId !== undefined) {
      next.folderId = context.folderId && isValidId(context.folderId) ? context.folderId : null;
    }
    if ("groupId" in context && context.groupId !== undefined) {
      next.groupId = context.groupId && isValidId(context.groupId) ? context.groupId : null;
    }
    // If multiple contexts provided, keep first non-null only (friend > folder > group)
    const contexts: Array<keyof Pick<FilterState, "friendId" | "folderId" | "groupId">> = [
      "friendId", "folderId", "groupId",
    ];
    let found = false;
    for (const key of contexts) {
      if (next[key] !== null) {
        if (found) (next as Record<string, string | null>)[key] = null;
        else found = true;
      }
    }
    set(next);
  },

  clearContext: () => set({ friendId: null, folderId: null, groupId: null }),

  // ── Multi-filters (AND logic, normalized on write) ────────────
  setTagFilters: (tagIds) => set({ tagIds: normalizeArray(tagIds).filter(isValidId) }),
  toggleTagFilter: (tagId) => {
    const { tagIds } = get();
    const next = tagIds.includes(tagId)
      ? tagIds.filter((id) => id !== tagId)
      : [...tagIds, tagId];
    set({ tagIds: normalizeArray(next).filter(isValidId) });
  },

  setFriendFilters: (filterFriendIds) => set({ filterFriendIds: normalizeArray(filterFriendIds).filter(isValidId) }),
  toggleFriendFilter: (friendId) => {
    const { filterFriendIds } = get();
    const next = filterFriendIds.includes(friendId)
      ? filterFriendIds.filter((id) => id !== friendId)
      : [...filterFriendIds, friendId];
    set({ filterFriendIds: normalizeArray(next).filter(isValidId) });
  },

  setFolderFilters: (filterFolderIds) => set({ filterFolderIds: normalizeArray(filterFolderIds).filter(isValidId) }),
  toggleFolderFilter: (folderId) => {
    const { filterFolderIds } = get();
    const next = filterFolderIds.includes(folderId)
      ? filterFolderIds.filter((id) => id !== folderId)
      : [...filterFolderIds, folderId];
    set({ filterFolderIds: normalizeArray(next).filter(isValidId) });
  },

  // ── Search (normalized on write) ──────────────────────────────
  setSearch: (searchQuery) => set({ searchQuery: normalizeSearch(searchQuery) }),

  // ── Bulk ──────────────────────────────────────────────────────
  /**
   * Clear all filters (tags, friends, folders, search).
   * Preserves context (friendId/folderId/groupId) and view/sort.
   * Context is §8 navigation layer, NOT §16 filter layer.
   */
  clearFilters: () =>
    set({
      tagIds: [],
      filterFriendIds: [],
      filterFolderIds: [],
      searchQuery: null,
      // context preserved (PRD §8 ≠ §16)
      // view and sort preserved (presentation, not filters)
    }),

  /**
   * Reset only multi-filters, preserving context and view/sort.
   * @deprecated Use clearFilters() for full reset
   */
  resetFilters: () =>
    set({
      tagIds: [],
      filterFriendIds: [],
      filterFolderIds: [],
      searchQuery: null,
      // context preserved
    }),

  clearAll: () => set(DEFAULT_FILTER_STATE),

  // ── Hydration (from URL, normalized) ──────────────────────────
  hydrate: (state) => set(normalizeFilterState(state)),

  // ── Derived ──────────────────────────────────────────────────
  /**
   * Check if any FILTERS are active (§16 layer only).
   * Excludes: view/sort (presentation), context (§8 navigation).
   * Per PRD §16: filters narrow results; context REPLACES dataset.
   */
  hasActiveFilters: () => {
    const s = get();
    return (
      s.tagIds.length > 0 ||
      s.filterFriendIds.length > 0 ||
      s.filterFolderIds.length > 0 ||
      s.searchQuery !== null
      // Context (friendId/folderId/groupId) is EXCLUDED — §8 navigation, not §16 filters
    );
  },

  /**
   * Count active filter dimensions (not individual IDs).
   * Dimensions: tags (1), friends (1), folders (1), search (1).
   * Context (friendId/folderId/groupId) is §8 NAVIGATION, NOT §16 filters.
   * Per PRD §16 for UI badge display.
   */
  activeFilterCount: () => {
    const s = get();
    let count = 0;
    if (s.tagIds.length > 0) count++;
    if (s.filterFriendIds.length > 0) count++;
    if (s.filterFolderIds.length > 0) count++;
    if (s.searchQuery !== null) count++;
    // Context (friendId/folderId/groupId) is EXCLUDED — it's §8 navigation, not §16 filters
    return count;
  },

  activeContextType: () => {
    const s = get();
    if (s.friendId) return "friend";
    if (s.folderId) return "folder";
    if (s.groupId) return "group";
    return null;
  },
}));
