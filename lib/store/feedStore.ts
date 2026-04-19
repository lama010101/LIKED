/**
 * Feed state management with Zustand
 */

import { create } from "zustand";
import { SortOption, FeedView } from "@/lib/types/app";

const SORT_STORAGE_KEY = "liked.sort";
const CUSTOM_ORDER_STORAGE_KEY = "liked.customOrder";
const VALID_SORTS: readonly SortOption[] = [
  "newest",
  "oldest",
  "mostShared",
  "highestRated",
  "custom",
];

type CustomOrderMap = Record<string, string[]>;

function readCustomOrders(): CustomOrderMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_ORDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CustomOrderMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCustomOrders(map: CustomOrderMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_ORDER_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * Read the persisted sort preference from localStorage.
 * Returns null if unavailable (SSR), unset, or invalid.
 */
export function getSortPreference(): SortOption | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string" && (VALID_SORTS as readonly string[]).includes(parsed)) {
      return parsed as SortOption;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the sort preference to localStorage.
 * No-op during SSR or if localStorage is unavailable.
 */
export function setSortPreference(value: SortOption): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

interface FeedStore {
  // Sort option
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;

  // View mode (masonry | icon | list | horizontal | canvas)
  viewMode: FeedView;
  setViewMode: (mode: FeedView) => void;

  // Context
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;

  selectedFriendId: string | null;
  setSelectedFriendId: (id: string | null) => void;

  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;

  // Clear all filters
  clearFilters: () => void;

  // Custom sort order per scope (P7-T02).
  // scopeKey is opaque — e.g. "feed:all", "folder:<uuid>", "group:<uuid>".
  customOrders: CustomOrderMap;
  getCustomOrder: (scopeKey: string) => string[];
  /**
   * Persist a new ordering for scopeKey. Also flips sort to 'custom' and
   * caches to localStorage. Caller is responsible for calling the server
   * action `dndReorderFeed(scopeKey, orderedNodeIds)` to persist server-side.
   */
  setCustomOrder: (scopeKey: string, orderedNodeIds: string[]) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  sortOption: getSortPreference() ?? "newest",
  setSortOption: (sortOption) => {
    setSortPreference(sortOption);
    set({ sortOption });
  },

  viewMode: "masonry",
  setViewMode: (viewMode) => set({ viewMode }),

  selectedFolderId: null,
  setSelectedFolderId: (selectedFolderId) => 
    set({ 
      selectedFolderId,
      selectedFriendId: null,
      selectedGroupId: null,
    }),

  selectedFriendId: null,
  setSelectedFriendId: (selectedFriendId) => 
    set({ 
      selectedFriendId,
      selectedFolderId: null,
      selectedGroupId: null,
    }),

  selectedGroupId: null,
  setSelectedGroupId: (selectedGroupId) => 
    set({ 
      selectedGroupId,
      selectedFolderId: null,
      selectedFriendId: null,
    }),

  clearFilters: () => 
    set({
      selectedFolderId: null,
      selectedFriendId: null,
      selectedGroupId: null,
    }),

  customOrders: readCustomOrders(),
  getCustomOrder: (scopeKey) => get().customOrders[scopeKey] ?? [],
  setCustomOrder: (scopeKey, orderedNodeIds) => {
    set((state) => {
      const next: CustomOrderMap = {
        ...state.customOrders,
        [scopeKey]: orderedNodeIds,
      };
      writeCustomOrders(next);
      return {
        customOrders: next,
        sortOption: "custom",
      };
    });
    setSortPreference("custom");
  },
}));
