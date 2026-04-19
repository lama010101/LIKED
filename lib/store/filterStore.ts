/**
 * Filter state management with Zustand
 */

import { create } from "zustand";

type FeedViewTab = 'all' | 'mine' | 'received';
type MineSubTab = 'all' | 'not_shared' | 'shared';

interface FilterStore {
  // Feed view tab (PRD §11.2a)
  feedView: FeedViewTab;
  setFeedView: (view: FeedViewTab) => void;

  // Mine sub-tab (P9-T01): All Mine / Not shared / Shared
  mineSubTab: MineSubTab;
  setMineSubTab: (tab: MineSubTab) => void;

  // Selected tag IDs
  selectedTags: string[];
  toggleTag: (tagId: string) => void;
  setTags: (tagIds: string[]) => void;
  clearTags: () => void;

  // Active friend/folder IDs (multi-filter)
  activeFriendIds: string[];
  toggleFriend: (id: string) => void;
  activeFolderIds: string[];
  toggleFolder: (id: string) => void;

  // Search query
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;

  // Has active filters
  hasActiveFilters: () => boolean;

  // Clear all
  clearAll: () => void;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  feedView: 'all',
  setFeedView: (feedView) => set({ feedView }),

  mineSubTab: 'all',
  setMineSubTab: (mineSubTab) => set({ mineSubTab }),

  selectedTags: [],
  toggleTag: (tagId) => {
    const { selectedTags } = get();
    if (selectedTags.includes(tagId)) {
      set({ selectedTags: selectedTags.filter((id) => id !== tagId) });
    } else {
      set({ selectedTags: [...selectedTags, tagId] });
    }
  },
  setTags: (tagIds) => set({ selectedTags: tagIds }),
  clearTags: () => set({ selectedTags: [] }),

  activeFriendIds: [],
  toggleFriend: (id) => {
    const { activeFriendIds } = get();
    if (activeFriendIds.includes(id)) {
      set({ activeFriendIds: activeFriendIds.filter((f) => f !== id) });
    } else {
      set({ activeFriendIds: [...activeFriendIds, id] });
    }
  },

  activeFolderIds: [],
  toggleFolder: (id) => {
    const { activeFolderIds } = get();
    if (activeFolderIds.includes(id)) {
      set({ activeFolderIds: activeFolderIds.filter((f) => f !== id) });
    } else {
      set({ activeFolderIds: [...activeFolderIds, id] });
    }
  },

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  clearSearch: () => set({ searchQuery: "" }),

  hasActiveFilters: () => {
    const { selectedTags, searchQuery, activeFriendIds, activeFolderIds, feedView } = get();
    return (
      selectedTags.length > 0 ||
      searchQuery.length > 0 ||
      activeFriendIds.length > 0 ||
      activeFolderIds.length > 0 ||
      feedView !== 'all'
    );
  },

  clearAll: () =>
    set({
      feedView: 'all',
      mineSubTab: 'all',
      selectedTags: [],
      searchQuery: "",
      activeFriendIds: [],
      activeFolderIds: [],
    }),
}));
