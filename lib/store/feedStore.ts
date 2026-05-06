/**
 * Feed state management with Zustand
 * P9-T03: Context and sort state moved to filterStore.
 * This store retains only: customOrders (drag-reorder).
 */

import { create } from "zustand";
import { useFilterStore } from "@/lib/store/filterStore";

const CUSTOM_ORDER_STORAGE_KEY = "liked.customOrder";

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

interface FeedStore {
  // Custom sort order per scope (P7-T02).
  // scopeKey is opaque — e.g. "feed:all", "folder:<uuid>", "group:<uuid>".
  customOrders: CustomOrderMap;
  getCustomOrder: (scopeKey: string) => string[];
  /**
   * Persist a new ordering for scopeKey. Also flips sort to 'custom' in
   * filterStore and caches to localStorage. Caller is responsible for calling
   * the server action `dndReorderFeed(scopeKey, orderedNodeIds)` to persist server-side.
   */
  setCustomOrder: (scopeKey: string, orderedNodeIds: string[]) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  customOrders: readCustomOrders(),
  getCustomOrder: (scopeKey) => get().customOrders[scopeKey] ?? [],
  setCustomOrder: (scopeKey, orderedNodeIds) => {
    set((state) => {
      const next: CustomOrderMap = {
        ...state.customOrders,
        [scopeKey]: orderedNodeIds,
      };
      writeCustomOrders(next);
      return { customOrders: next };
    });
    // Delegate sort change to filterStore
    useFilterStore.getState().setSort("custom");
  },
}));
