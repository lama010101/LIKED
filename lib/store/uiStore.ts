/**
 * UI state management with Zustand
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Theme } from "@/lib/types/app";

interface UIStore {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Create modal
  isCreateModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  createModalTab: "card" | "folder" | "friend";
  setCreateModalTab: (tab: "card" | "folder" | "friend") => void;

  // Profile modal
  isProfileModalOpen: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;

  // Bars expanded state
  isFoldersBarExpanded: boolean;
  toggleFoldersBar: () => void;
  isFriendsBarExpanded: boolean;
  toggleFriendsBar: () => void;

  // Tag bar
  isTagBarOpen: boolean;
  toggleTagBar: () => void;
  openTagBar: () => void;
  closeTagBar: () => void;

  // Selection mode
  isSelectionMode: boolean;
  setIsSelectionMode: (value: boolean) => void;
  selectedNodeIds: string[];
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;

  // Drag state
  isDragging: boolean;
  draggedItemId: string | null;
  draggedItemType: "node" | "folder" | "friend" | "group" | "tag" | null;
  setDragState: (state: {
    isDragging: boolean;
    draggedItemId: string | null;
    draggedItemType: "node" | "folder" | "friend" | "group" | "tag" | null;
  }) => void;
  clearDragState: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Theme
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),

      // Create modal
      isCreateModalOpen: false,
      openCreateModal: () => set({ isCreateModalOpen: true }),
      closeCreateModal: () => set({ isCreateModalOpen: false }),
      createModalTab: "card",
      setCreateModalTab: (createModalTab) => set({ createModalTab }),

      // Profile modal
      isProfileModalOpen: false,
      openProfileModal: () => set({ isProfileModalOpen: true }),
      closeProfileModal: () => set({ isProfileModalOpen: false }),

      // Bars
      isFoldersBarExpanded: true,
      toggleFoldersBar: () => set({ isFoldersBarExpanded: !get().isFoldersBarExpanded }),
      isFriendsBarExpanded: true,
      toggleFriendsBar: () => set({ isFriendsBarExpanded: !get().isFriendsBarExpanded }),

      // Tag bar
      isTagBarOpen: false,
      toggleTagBar: () => set({ isTagBarOpen: !get().isTagBarOpen }),
      openTagBar: () => set({ isTagBarOpen: true }),
      closeTagBar: () => set({ isTagBarOpen: false }),

      // Selection
      isSelectionMode: false,
      setIsSelectionMode: (isSelectionMode) => set({ isSelectionMode }),
      selectedNodeIds: [],
      toggleNodeSelection: (nodeId) => {
        const { selectedNodeIds } = get();
        if (selectedNodeIds.includes(nodeId)) {
          set({ selectedNodeIds: selectedNodeIds.filter((id) => id !== nodeId) });
        } else {
          set({ selectedNodeIds: [...selectedNodeIds, nodeId] });
        }
      },
      clearSelection: () => set({ selectedNodeIds: [], isSelectionMode: false }),

      // Drag
      isDragging: false,
      draggedItemId: null,
      draggedItemType: null,
      setDragState: (dragState) => set(dragState),
      clearDragState: () =>
        set({ isDragging: false, draggedItemId: null, draggedItemType: null }),
    }),
    {
      name: "liked-ui-store",
      partialize: (state) => ({
        theme: state.theme,
        isFoldersBarExpanded: state.isFoldersBarExpanded,
        isFriendsBarExpanded: state.isFriendsBarExpanded,
      }),
    }
  )
);
