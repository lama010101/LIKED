"use client";

import { create } from "zustand";
import {
  AssetCard,
  Collection,
  FRIENDS,
  SEED_CARDS,
  SEED_COLLECTIONS,
  mockGenerate,
} from "@/flow/lib/mock";
import { hasIDB, idbDel, idbGet, idbSet } from "@/flow/lib/idb";

export type ViewMode = "grid" | "batch";
export type SheetKind = "inspector" | "agent" | "move";
export type MobileTab = "projects" | "create" | "library" | "profile";
export type SortKey = "newest" | "oldest" | "duration" | "seed" | "prompt";
export type ActiveCollection = "all" | "archived" | string;
/** 'me' = everything; otherwise a Friend or group-chat id from FRIENDS. */
export type ActiveFriend = "me" | string;

export interface AgentCommand {
  op: "group" | "sort" | "rename" | "archive" | "unarchive" | "noop";
  args: string;
  ids: string[];
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
  credits: number;
  pending?: AgentCommand | null;
  executed?: boolean;
}

const PERSIST_KEY = "flow-state-v1";
export const MIN_COLS = 1;
export const MAX_COLS = 6;

const clampCols = (n: number) => Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(n)));

let msgSeq = 0;
const nextMsgId = () => `m${Date.now().toString(36)}-${msgSeq++}`;
let colSeq = 0;
const nextColId = () => `col-${Date.now().toString(36)}-${colSeq++}`;

const WELCOME: AgentMessage[] = [
  {
    id: "welcome",
    role: "agent",
    text: "Flow Agent ready. Attach assets or use the selection, then try: \u201cgroup\u201d, \u201csort by duration\u201d, \u201crename to X\u201d, \u201carchive\u201d.",
    ts: 0,
    credits: 0,
  },
];

export const COMMAND_COST: Record<AgentCommand["op"], number> = {
  group: 5,
  sort: 1,
  rename: 2,
  archive: 3,
  unarchive: 3,
  noop: 0,
};

interface FlowState {
  hydrated: boolean;
  cards: AssetCard[];
  collections: Collection[];
  selectedIds: string[];
  lastClickedId: string | null;
  viewMode: ViewMode;
  cols: number;
  sortBy: SortKey;
  activeCollection: ActiveCollection;
  activeFriend: ActiveFriend;
  inspectorCardId: string | null;
  agentOpen: boolean;
  agentMessages: AgentMessage[];
  mobileSheet: SheetKind | null;
  mobileTab: MobileTab;
  confirmGate: boolean;
  selectionMode: boolean;
  expanded: Record<string, boolean>;
  sidebarCollapsed: boolean;
  credits: number;
  dragActive: boolean;

  // selection
  selectOnly: (id: string) => void;
  toggleSelect: (id: string) => void;
  rangeSelect: (id: string, orderedIds: string[]) => void;
  setSelection: (ids: string[]) => void;
  mergeSelection: (ids: string[], additive: boolean) => void;
  clearSelection: () => void;

  // view
  setViewMode: (m: ViewMode) => void;
  setCols: (n: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setSortBy: (s: SortKey) => void;
  setActiveCollection: (id: ActiveCollection) => void;
  setActiveFriend: (id: ActiveFriend) => void;
  setExpanded: (id: string, open: boolean) => void;
  toggleSidebar: () => void;
  setMobileTab: (t: MobileTab) => void;

  // panels / sheets
  openInspector: (id: string | null) => void;
  setAgentOpen: (open: boolean) => void;
  setMobileSheet: (s: SheetKind | null) => void;
  setConfirmGate: (v: boolean) => void;
  setSelectionMode: (v: boolean) => void;
  setDragActive: (v: boolean) => void;

  // data ops
  createCollectionFromCards: (ids: string[], name?: string) => string;
  createCollection: (name: string, parentId?: string | null) => string;
  moveToCollection: (ids: string[], target: string | null) => void;
  archiveCards: (ids: string[], archived?: boolean) => void;
  renameCollection: (id: string, name: string) => void;
  renameCard: (id: string, prompt: string) => void;
  updateCardParams: (id: string, params: Partial<AssetCard["params"]>) => void;
  generateCard: (prompt: string) => void;
  resetAll: () => void;

  // agent
  pushAgentMessage: (m: Omit<AgentMessage, "id" | "ts">) => string;
  executeAgent: (cmd: AgentCommand) => string;
  confirmAgent: (messageId: string) => void;
  cancelAgent: (messageId: string) => void;
}

export const useFlow = create<FlowState>()((set, get) => ({
  hydrated: false,
  cards: SEED_CARDS,
  collections: SEED_COLLECTIONS,
  selectedIds: [],
  lastClickedId: null,
  viewMode: "grid",
  cols: 4,
  sortBy: "newest",
  activeCollection: "all",
  activeFriend: "me",
  inspectorCardId: null,
  agentOpen: false,
  agentMessages: WELCOME,
  mobileSheet: null,
  mobileTab: "library",
  confirmGate: true,
  selectionMode: false,
  expanded: { "col-scenes": true },
  sidebarCollapsed: false,
  credits: 1200,
  dragActive: false,

  selectOnly: (id) => set({ selectedIds: [id], lastClickedId: id }),
  toggleSelect: (id) =>
    set((s) => ({
      lastClickedId: id,
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  rangeSelect: (id, orderedIds) =>
    set((s) => {
      const anchor = s.lastClickedId ?? id;
      const a = orderedIds.indexOf(anchor);
      const b = orderedIds.indexOf(id);
      if (a === -1 || b === -1) return { selectedIds: [id], lastClickedId: id };
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return {
        selectedIds: orderedIds.slice(lo, hi + 1),
        lastClickedId: anchor,
      };
    }),
  setSelection: (ids) => set({ selectedIds: [...new Set(ids)] }),
  mergeSelection: (ids, additive) =>
    set((s) => ({
      selectedIds: additive
        ? [...new Set([...s.selectedIds, ...ids])]
        : [...new Set(ids)],
    })),
  clearSelection: () => set({ selectedIds: [], lastClickedId: null }),

  setViewMode: (m) => set({ viewMode: m }),
  setCols: (n) => set({ cols: clampCols(n) }),
  zoomIn: () => set((s) => ({ cols: clampCols(s.cols - 1) })),
  zoomOut: () => set((s) => ({ cols: clampCols(s.cols + 1) })),
  setSortBy: (k) => set({ sortBy: k }),
  setActiveCollection: (id) => set({ activeCollection: id, selectedIds: [] }),
  setActiveFriend: (id) =>
    set((s) => ({
      activeFriend: s.activeFriend === id ? "me" : id,
      selectedIds: [],
    })),
  setExpanded: (id, open) =>
    set((s) => ({ expanded: { ...s.expanded, [id]: open } })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileTab: (t) => set({ mobileTab: t }),

  openInspector: (id) => set({ inspectorCardId: id }),
  setAgentOpen: (open) => set({ agentOpen: open }),
  setMobileSheet: (s) => set({ mobileSheet: s }),
  setConfirmGate: (v) => set({ confirmGate: v }),
  setSelectionMode: (v) => set({ selectionMode: v, selectedIds: [] }),
  setDragActive: (v) => set({ dragActive: v }),

  createCollectionFromCards: (ids, name) => {
    const id = nextColId();
    const ts = Date.now();
    set((s) => ({
      collections: [
        ...s.collections,
        {
          id,
          name: name?.trim() || `Group ${s.collections.length + 1}`,
          parentId: null,
          createdAt: ts,
        },
      ],
      cards: s.cards.map((c) =>
        ids.includes(c.id) ? { ...c, collectionId: id } : c
      ),
    }));
    return id;
  },
  createCollection: (name, parentId = null) => {
    const id = nextColId();
    set((s) => ({
      collections: [
        ...s.collections,
        { id, name: name.trim() || "Untitled", parentId, createdAt: Date.now() },
      ],
    }));
    return id;
  },
  moveToCollection: (ids, target) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        ids.includes(c.id) ? { ...c, collectionId: target } : c
      ),
    })),
  archiveCards: (ids, archived = true) =>
    set((s) => ({
      cards: s.cards.map((c) => (ids.includes(c.id) ? { ...c, archived } : c)),
      selectedIds: [],
    })),
  renameCollection: (id, name) =>
    set((s) => ({
      collections: s.collections.map((c) =>
        c.id === id ? { ...c, name: name.trim() || c.name } : c
      ),
    })),
  renameCard: (id, prompt) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id
          ? {
              ...c,
              prompt,
              history: [...c.history, { prompt, ts: Date.now() }],
            }
          : c
      ),
    })),
  updateCardParams: (id, params) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, params: { ...c.params, ...params } } : c
      ),
    })),
  generateCard: (prompt) =>
    set((s) => {
      const card = mockGenerate(prompt, s.cards.length);
      return {
        cards: [{ ...card, createdAt: Date.now() }, ...s.cards],
        mobileTab: "library",
        activeCollection: "all",
      };
    }),
  resetAll: () => {
    void idbDel(PERSIST_KEY);
    set({
      cards: SEED_CARDS,
      collections: SEED_COLLECTIONS,
      selectedIds: [],
      agentMessages: WELCOME,
      credits: 1200,
      activeCollection: "all",
      activeFriend: "me",
      expanded: { "col-scenes": true },
      inspectorCardId: null,
      mobileSheet: null,
      selectionMode: false,
    });
  },

  pushAgentMessage: (m) => {
    const id = nextMsgId();
    set((s) => ({
      agentMessages: [...s.agentMessages, { ...m, id, ts: Date.now() }],
    }));
    return id;
  },
  executeAgent: (cmd) => {
    const s = get();
    const ids = cmd.ids.length ? cmd.ids : s.selectedIds;
    switch (cmd.op) {
      case "group": {
        if (!ids.length) return "Nothing selected — attach or select assets first.";
        const id = s.createCollectionFromCards(ids, cmd.args || undefined);
        const name = get().collections.find((c) => c.id === id)?.name ?? "group";
        return `Grouped ${ids.length} asset${ids.length === 1 ? "" : "s"} into \u201c${name}\u201d.`;
      }
      case "sort": {
        const key = cmd.args.toLowerCase();
        const map: Record<string, SortKey> = {
          newest: "newest",
          date: "newest",
          oldest: "oldest",
          duration: "duration",
          length: "duration",
          seed: "seed",
          prompt: "prompt",
          name: "prompt",
        };
        const sort = map[key];
        if (!sort) return `Can't sort by \u201c${cmd.args}\u201d — try newest, oldest, duration, seed, prompt.`;
        s.setSortBy(sort);
        return `Sorted the canvas by ${sort}.`;
      }
      case "rename": {
        const name = cmd.args.trim();
        if (!name) return "Rename needs a value, e.g. \u201crename to Spring shots\u201d.";
        if (ids.length === 1) {
          s.renameCard(ids[0], name);
          return "Renamed the attached asset's prompt.";
        }
        const active = s.activeCollection;
        if (active !== "all" && active !== "archived") {
          s.renameCollection(active, name);
          return `Renamed collection to \u201c${name}\u201d.`;
        }
        return "Select one asset, or open a collection, to rename.";
      }
      case "archive": {
        if (!ids.length) return "Nothing selected to archive.";
        s.archiveCards(ids, true);
        return `Archived ${ids.length} asset${ids.length === 1 ? "" : "s"}.`;
      }
      case "unarchive": {
        if (!ids.length) return "Nothing selected to restore.";
        s.archiveCards(ids, false);
        return `Restored ${ids.length} asset${ids.length === 1 ? "" : "s"}.`;
      }
      default:
        return "I understand: group, sort by X, rename to X, archive, unarchive.";
    }
  },
  confirmAgent: (messageId) => {
    const s = get();
    const msg = s.agentMessages.find((m) => m.id === messageId);
    if (!msg?.pending) return;
    const cost = COMMAND_COST[msg.pending.op];
    const result = s.executeAgent(msg.pending);
    set((st) => ({
      credits: st.credits - cost,
      agentMessages: [
        ...st.agentMessages.map((m) =>
          m.id === messageId ? { ...m, pending: null, executed: true } : m
        ),
        {
          id: nextMsgId(),
          role: "agent",
          text: result,
          ts: Date.now(),
          credits: -cost,
        },
      ],
    }));
  },
  cancelAgent: (messageId) =>
    set((st) => ({
      agentMessages: [
        ...st.agentMessages.map((m) =>
          m.id === messageId ? { ...m, pending: null, executed: false } : m
        ),
        {
          id: nextMsgId(),
          role: "agent",
          text: "Cancelled.",
          ts: Date.now(),
          credits: 0,
        },
      ],
    })),
}));

// ---------- filtering / sorting helpers ----------

export function visibleCards(s: {
  cards: AssetCard[];
  activeCollection: ActiveCollection;
  activeFriend: ActiveFriend;
  sortBy: SortKey;
}): AssetCard[] {
  let list = s.cards;
  // friend / group-chat filter — 'me' shows everything
  if (s.activeFriend !== "me") {
    const f = FRIENDS.find((x) => x.id === s.activeFriend);
    const ids = f?.isGroup
      ? new Set(f.memberIds ?? [])
      : new Set([s.activeFriend]);
    list = list.filter((c) => ids.has(c.sharedBy));
  }
  if (s.activeCollection === "all") {
    list = list.filter((c) => !c.archived);
  } else if (s.activeCollection === "archived") {
    list = list.filter((c) => c.archived);
  } else {
    // include cards in descendant collections too
    const want = new Set<string>([s.activeCollection]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const col of useFlow.getState().collections) {
        if (col.parentId && want.has(col.parentId) && !want.has(col.id)) {
          want.add(col.id);
          grew = true;
        }
      }
    }
    list = list.filter(
      (c) => !c.archived && c.collectionId !== null && want.has(c.collectionId)
    );
  }
  const sorted = [...list];
  switch (s.sortBy) {
    case "oldest":
      sorted.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case "duration":
      sorted.sort((a, b) => b.durationSec - a.durationSec);
      break;
    case "seed":
      sorted.sort((a, b) => a.seed - b.seed);
      break;
    case "prompt":
      sorted.sort((a, b) => a.prompt.localeCompare(b.prompt));
      break;
    default:
      sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

export function collectionChildren(
  collections: Collection[],
  parentId: string | null
): Collection[] {
  return collections
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- IndexedDB persistence (manual, debounced) ----------

type Persisted = Pick<
  FlowState,
  | "cards"
  | "collections"
  | "agentMessages"
  | "credits"
  | "viewMode"
  | "cols"
  | "activeCollection"
  | "activeFriend"
  | "confirmGate"
  | "expanded"
  | "mobileTab"
  | "sortBy"
>;

const pick = (s: FlowState): Persisted => ({
  cards: s.cards,
  collections: s.collections,
  agentMessages: s.agentMessages,
  credits: s.credits,
  viewMode: s.viewMode,
  cols: s.cols,
  activeCollection: s.activeCollection,
  activeFriend: s.activeFriend,
  confirmGate: s.confirmGate,
  expanded: s.expanded,
  mobileTab: s.mobileTab,
  sortBy: s.sortBy,
});

let persistStarted = false;

/** Call once on the client. Hydrates from IndexedDB, then persists changes. */
export function initPersistence(): () => void {
  if (!hasIDB || persistStarted) return () => {};
  persistStarted = true;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  void idbGet<Persisted>(PERSIST_KEY).then((data) => {
    if (disposed || !data) {
      useFlow.setState({ hydrated: true });
      return;
    }
    // merge defensively: only known keys, keep seed data if shape mismatches
    const safe: Partial<FlowState> = { hydrated: true };
    if (Array.isArray(data.cards))
      // backfill sharedBy for cards persisted before this field existed
      safe.cards = data.cards.map((c) => ({
        ...c,
        sharedBy: c.sharedBy ?? "me",
      }));
    if (typeof data.activeFriend === "string")
      safe.activeFriend = data.activeFriend;
    if (Array.isArray(data.collections)) safe.collections = data.collections;
    if (Array.isArray(data.agentMessages)) safe.agentMessages = data.agentMessages;
    if (typeof data.credits === "number") safe.credits = data.credits;
    if (data.viewMode === "grid" || data.viewMode === "batch") safe.viewMode = data.viewMode;
    if (typeof data.cols === "number") safe.cols = clampCols(data.cols);
    if (typeof data.activeCollection === "string") safe.activeCollection = data.activeCollection;
    if (typeof data.confirmGate === "boolean") safe.confirmGate = data.confirmGate;
    if (data.expanded && typeof data.expanded === "object") safe.expanded = data.expanded;
    if (data.mobileTab) safe.mobileTab = data.mobileTab;
    if (data.sortBy) safe.sortBy = data.sortBy;
    useFlow.setState(safe);
  });

  const unsub = useFlow.subscribe((s) => {
    if (!s.hydrated) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void idbSet(PERSIST_KEY, pick(useFlow.getState()));
    }, 300);
  });

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    unsub();
    persistStarted = false;
  };
}
