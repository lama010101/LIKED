/**
 * Feed state management with Zustand
 */

import { create } from "zustand";
import { SortOption, FeedView } from "@/lib/types/app";

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
}

export const useFeedStore = create<FeedStore>((set) => ({
  sortOption: "newest",
  setSortOption: (sortOption) => set({ sortOption }),

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
}));
