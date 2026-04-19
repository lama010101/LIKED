/**
 * Multi-select state (P7-T03, PRD §17).
 *
 * Long-press on any selectable surface (card, folder chip, friend avatar,
 * group chip) activates selection mode and adds the first item. Subsequent
 * taps add/remove items without exiting mode. The mode exits when the
 * selection set is cleared (via Cancel, Escape, or tap outside).
 *
 * `pendingRestore` drives the §17.3 Undo toast: single-(×) tap soft-deletes
 * the item and exposes it to `SelectionOverlay` which renders the toast
 * with a 5-second window.
 */

import { create } from "zustand";

export type SelectionKind = "node" | "folder" | "friend" | "group";

export interface SelectionItem {
  kind: SelectionKind;
  id: string;
}

export interface PendingRestore {
  kind: SelectionKind;
  id: string;
  label?: string; // optional human-readable label for the toast
  /** ms timestamp when the soft delete happened */
  at: number;
}

interface SelectionStore {
  items: SelectionItem[];
  isActive: boolean;

  /** Enter selection mode with this item as the first selection. */
  activate: (item: SelectionItem) => void;
  /** Toggle presence of an item; exits mode if the set becomes empty. */
  toggle: (item: SelectionItem) => void;
  /** Remove a specific item; exits mode if the set becomes empty. */
  remove: (item: SelectionItem) => void;
  /** True if the item is currently selected. */
  isSelected: (item: SelectionItem) => boolean;
  /** Clear the selection and exit mode. */
  clear: () => void;

  /** Transient undo-toast payload for single-item (×) soft deletes. */
  pendingRestore: PendingRestore | null;
  setPendingRestore: (p: PendingRestore | null) => void;
}

function sameItem(a: SelectionItem, b: SelectionItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  items: [],
  isActive: false,

  activate: (item) => {
    const { items, isActive } = get();
    if (isActive && items.some((i) => sameItem(i, item))) return;
    set({ items: isActive ? [...items, item] : [item], isActive: true });
  },

  toggle: (item) => {
    const { items } = get();
    const exists = items.some((i) => sameItem(i, item));
    const next = exists ? items.filter((i) => !sameItem(i, item)) : [...items, item];
    set({ items: next, isActive: next.length > 0 });
  },

  remove: (item) => {
    const next = get().items.filter((i) => !sameItem(i, item));
    set({ items: next, isActive: next.length > 0 });
  },

  isSelected: (item) => get().items.some((i) => sameItem(i, item)),

  clear: () => set({ items: [], isActive: false }),

  pendingRestore: null,
  setPendingRestore: (pendingRestore) => set({ pendingRestore }),
}));
