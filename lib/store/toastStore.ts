/**
 * Global toast notification store.
 *
 * Imperative API — call `toast.success(...)` or `toast.error(...)` from
 * anywhere (event handlers, catch blocks, etc.) without hooks or context.
 *
 * `ToastContainer` (mounted once in app/layout.tsx) reads from this store
 * and renders the toasts.
 */

import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Auto-dismiss duration in ms. 0 = sticky. */
  duration: number;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type: ToastType, duration?: number) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  error: 6000,
};

let counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type, duration) => {
    const id = `toast-${++counter}`;
    const d = duration ?? DEFAULT_DURATION[type];
    set((s) => ({
      toasts: [...s.toasts, { id, message, type, duration: d }],
    }));
  },
  dismiss: (id) => {
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    }));
  },
}));

/** Imperative API — use without hooks. */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().show(message, "success", duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().show(message, "error", duration),
  info: (message: string, duration?: number) =>
    useToastStore.getState().show(message, "info", duration),
};
