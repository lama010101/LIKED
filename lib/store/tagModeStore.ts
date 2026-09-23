/**
 * Tag Mode state (TEMPLATE-001 / PRD §11.3b).
 *
 * Entered via the FAB "Tag" action. While active, taps on cards/folders
 * apply the selected tag instead of opening. Mutually exclusive with
 * multi-select mode (§11.3b step 6): enter() is a no-op while a
 * selection is active, and selection activation exits tag mode is not
 * required — spec only blocks entry.
 */

import { create } from "zustand";

export interface TagModeTag {
  id: string;
  label: string;
  color: string;
}

interface TagModeStore {
  active: boolean;
  /** Currently picked tag; null → pill shows "Pick a tag" (step 1). */
  tag: TagModeTag | null;
  /** Transient flash target: "node:<id>" | "folder:<id>" for the 150ms ring. */
  flashTarget: string | null;

  enter: () => void;
  exit: () => void;
  setTag: (tag: TagModeTag) => void;
  /** Set the flash target and auto-clear it after 150ms (step 4). */
  flash: (target: string) => void;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const useTagModeStore = create<TagModeStore>((set) => ({
  active: false,
  tag: null,
  flashTarget: null,

  enter: () => set({ active: true, tag: null }),
  exit: () => set({ active: false, tag: null, flashTarget: null }),
  setTag: (tag) => set({ tag }),
  flash: (target) => {
    if (flashTimer) clearTimeout(flashTimer);
    set({ flashTarget: target });
    flashTimer = setTimeout(() => set({ flashTarget: null }), 150);
  },
}));
