"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collectionChildren, useFlow, visibleCards } from "@/flow/store";
import { Collection } from "@/flow/lib/mock";
import CardThumb from "./CardThumb";
import BatchView from "./BatchView";
import InspectorContent from "./Inspector";
import FlowAgentConsole from "./FlowAgentConsole";
import FriendsRail from "./FriendsRail";
import BottomSheet from "./BottomSheet";

const PAGE = 40;

const TABS = [
  { id: "projects", label: "Projects", icon: "M2 4h5l2 2h5v8H2z" },
  { id: "create", label: "Create", icon: "M12 4v16M4 12h16" },
  { id: "library", label: "Library", icon: "M3 4h7v16H3zM13 4h8v16h-8z" },
  { id: "profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 8a8 8 0 0 1 16 0" },
] as const;

export default function MobileShell() {
  const mobileTab = useFlow((s) => s.mobileTab);
  const selectionMode = useFlow((s) => s.selectionMode);
  const mobileSheet = useFlow((s) => s.mobileSheet);

  return (
    <div className="flex h-dvh flex-col bg-ink text-zinc-200">
      <TopBar />
      <main className="min-h-0 flex-1 overflow-hidden pb-16">
        {mobileTab === "library" && <LibraryTab />}
        {mobileTab === "projects" && <ProjectsTab />}
        {mobileTab === "create" && <CreateTab />}
        {mobileTab === "profile" && <ProfileTab />}
      </main>

      {/* FAB — opens agent as full-screen modal */}
      {mobileTab === "library" && !selectionMode && (
        <button
          type="button"
          aria-label="Open Flow agent"
          onClick={() => useFlow.getState().setMobileSheet("agent")}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/50 active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8">
            <path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z" />
            <path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />
          </svg>
        </button>
      )}

      <BottomNav />

      {/* sheets */}
      <BottomSheet
        open={mobileSheet === "inspector"}
        onClose={() => useFlow.getState().setMobileSheet(null)}
        title="Inspector"
      >
        <InspectorContent />
      </BottomSheet>

      <BottomSheet
        open={mobileSheet === "move"}
        onClose={() => useFlow.getState().setMobileSheet(null)}
        title="Move to collection"
      >
        <MoveSheet />
      </BottomSheet>

      <BottomSheet
        open={mobileSheet === "agent"}
        onClose={() => useFlow.getState().setMobileSheet(null)}
        title="Flow Agent"
        fullScreen
      >
        <FlowAgentConsole mobile />
      </BottomSheet>
    </div>
  );
}

function TopBar() {
  const selectionMode = useFlow((s) => s.selectionMode);
  const setSelectionMode = useFlow((s) => s.setSelectionMode);
  const selected = useFlow((s) => s.selectedIds);
  const credits = useFlow((s) => s.credits);
  const archiveCards = useFlow((s) => s.archiveCards);
  const createCollectionFromCards = useFlow((s) => s.createCollectionFromCards);
  const setMobileSheet = useFlow((s) => s.setMobileSheet);
  const clearSelection = useFlow((s) => s.clearSelection);

  if (selectionMode) {
    return (
      <header className="flex h-14 items-center gap-2 border-b border-edge bg-panel px-3">
        <span className="text-sm font-medium text-accent">{selected.length}</span>
        <button
          type="button"
          onClick={() => selected.length && setMobileSheet("move")}
          className="min-h-[48px] rounded-md px-2 text-xs text-zinc-300"
        >
          Move
        </button>
        <button
          type="button"
          onClick={() => {
            if (selected.length) createCollectionFromCards(selected);
            setSelectionMode(false);
          }}
          className="min-h-[48px] rounded-md px-2 text-xs text-zinc-300"
        >
          Group
        </button>
        <button
          type="button"
          onClick={() => {
            archiveCards(selected, true);
            setSelectionMode(false);
          }}
          className="min-h-[48px] rounded-md px-2 text-xs text-zinc-300"
        >
          Archive
        </button>
        <button
          type="button"
          aria-label="Exit selection mode"
          onClick={() => {
            setSelectionMode(false);
            clearSelection();
          }}
          className="ml-auto flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-zinc-400"
        >
          ✕
        </button>
      </header>
    );
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b border-edge bg-panel px-4">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/20 text-sm font-bold text-accent">
        F
      </div>
      <h1 className="text-sm font-semibold">Flow</h1>
      <span className="ml-auto rounded-full border border-edge px-2 py-0.5 text-[10px] text-zinc-500">
        {credits} cr
      </span>
    </header>
  );
}

function ZoomRow() {
  const cols = useFlow((s) => s.cols);
  const zoomIn = useFlow((s) => s.zoomIn);
  const zoomOut = useFlow((s) => s.zoomOut);
  const viewMode = useFlow((s) => s.viewMode);
  const setViewMode = useFlow((s) => s.setViewMode);

  return (
    <div className="flex items-center gap-2 border-b border-edge px-3 py-1.5">
      <div role="tablist" aria-label="View mode" className="flex overflow-hidden rounded-md border border-edge">
        {(["grid", "batch"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={viewMode === m}
            onClick={() => setViewMode(m)}
            className={`px-3 py-1.5 text-xs capitalize ${viewMode === m ? "bg-raise text-zinc-100" : "text-zinc-500"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center rounded-md border border-edge" aria-label="Grid zoom">
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
          disabled={cols >= 6}
          className="flex min-h-[40px] min-w-[40px] items-center justify-center text-zinc-400 disabled:opacity-30"
        >
          −
        </button>
        <span className="text-[10px] text-zinc-600">{Math.min(cols, 3)}col</span>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
          disabled={cols <= 1}
          className="flex min-h-[40px] min-w-[40px] items-center justify-center text-zinc-400 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

function LibraryTab() {
  const viewMode = useFlow((s) => s.viewMode);
  const cards = useFlow((s) => s.cards);
  const activeCollection = useFlow((s) => s.activeCollection);
  const activeFriend = useFlow((s) => s.activeFriend);
  const sortBy = useFlow((s) => s.sortBy);
  const cols = useFlow((s) => s.cols);
  const selectedIds = useFlow((s) => s.selectedIds);
  const selectionMode = useFlow((s) => s.selectionMode);

  const items = useMemo(
    () => visibleCards({ cards, activeCollection, activeFriend, sortBy }),
    [cards, activeCollection, activeFriend, sortBy]
  );
  const [shown, setShown] = useState(PAGE);
  const [prevScope, setPrevScope] = useState({ activeCollection, activeFriend, sortBy });
  if (
    prevScope.activeCollection !== activeCollection ||
    prevScope.activeFriend !== activeFriend ||
    prevScope.sortBy !== sortBy
  ) {
    setPrevScope({ activeCollection, activeFriend, sortBy });
    setShown(PAGE);
  }

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setShown((n) => Math.min(n + PAGE, items.length)),
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  const mCols = Math.min(cols, 3);

  return (
    <div className="flex h-full flex-col">
      <FriendsRail mobile />
      <ZoomRow />
      {viewMode === "batch" ? (
        <BatchView mobile />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3" role="grid" aria-label="Asset feed">
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${mCols}, 1fr)`, gap: 8 }}>
            {items.slice(0, shown).map((card) => (
              <CardThumb
                key={card.id}
                card={card}
                mobile
                selectionMode={selectionMode}
                selected={selectedIds.includes(card.id)}
                onLongPress={() => {
                  const s = useFlow.getState();
                  if (!s.selectionMode) s.setSelectionMode(true);
                  s.toggleSelect(card.id);
                }}
                onSelect={() => {
                  const s = useFlow.getState();
                  if (s.selectionMode) {
                    s.toggleSelect(card.id);
                  } else {
                    s.selectOnly(card.id);
                    s.openInspector(card.id);
                    s.setMobileSheet("inspector");
                  }
                }}
              />
            ))}
          </div>
          {shown < items.length && (
            <div ref={sentinelRef} className="py-4 text-center text-xs text-zinc-600">
              Loading…
            </div>
          )}
          {items.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-600">No assets here.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectsTab() {
  const collections = useFlow((s) => s.collections);
  const cards = useFlow((s) => s.cards);
  const setActiveCollection = useFlow((s) => s.setActiveCollection);
  const setMobileTab = useFlow((s) => s.setMobileTab);
  const createCollection = useFlow((s) => s.createCollection);

  const open = (id: string) => {
    setActiveCollection(id);
    setMobileTab("library");
  };

  const renderCol = (c: Collection, depth: number) => (
    <div key={c.id}>
      <button
        type="button"
        onClick={() => open(c.id)}
        className="flex min-h-[48px] w-full items-center gap-2 border-b border-edge/50 px-4 text-left text-sm text-zinc-300"
        style={{ paddingLeft: 16 + depth * 16 }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        <span className="flex-1 truncate">{c.name}</span>
        <span className="text-[10px] text-zinc-600">
          {cards.filter((x) => x.collectionId === c.id).length}
        </span>
      </button>
      {collectionChildren(collections, c.id).map((k) => renderCol(k, depth + 1))}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <button
        type="button"
        onClick={() => open("all")}
        className="flex min-h-[48px] w-full items-center gap-2 border-b border-edge/50 px-4 text-sm text-zinc-200"
      >
        All assets
      </button>
      {collectionChildren(collections, null).map((c) => renderCol(c, 0))}
      <button
        type="button"
        onClick={() => open("archived")}
        className="flex min-h-[48px] w-full items-center gap-2 border-b border-edge/50 px-4 text-sm text-zinc-400"
      >
        Archive
      </button>
      <button
        type="button"
        onClick={() => createCollection("New collection")}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-md text-sm text-accent"
      >
        + New collection
      </button>
    </div>
  );
}

function CreateTab() {
  const [prompt, setPrompt] = useState("");
  const generateCard = useFlow((s) => s.generateCard);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-zinc-100">New generation</h2>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        placeholder="Describe the shot you want Veo to imagine…"
        aria-label="Generation prompt"
        className="w-full resize-none rounded-lg border border-edge bg-panel p-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent"
      />
      <button
        type="button"
        disabled={!prompt.trim()}
        onClick={() => {
          generateCard(prompt.trim());
          setPrompt("");
        }}
        className="min-h-[48px] rounded-lg bg-accent text-sm font-medium text-white disabled:opacity-40"
      >
        Generate (mock)
      </button>
      <p className="text-xs text-zinc-600">
        Mocked Veo/Imagen call — the asset appears in your library instantly.
      </p>
    </div>
  );
}

function ProfileTab() {
  const confirmGate = useFlow((s) => s.confirmGate);
  const setConfirmGate = useFlow((s) => s.setConfirmGate);
  const credits = useFlow((s) => s.credits);
  const resetAll = useFlow((s) => s.resetAll);
  const hydrated = useFlow((s) => s.hydrated);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold text-zinc-100">Profile & settings</h2>
      <div className="rounded-lg border border-edge bg-panel p-4">
        <p className="text-xs text-zinc-500">Credits</p>
        <p className="text-2xl font-semibold text-zinc-100">{credits}</p>
      </div>
      <label className="flex min-h-[48px] items-center justify-between rounded-lg border border-edge bg-panel px-4">
        <span className="text-sm text-zinc-300">Confirm agent actions</span>
        <input
          type="checkbox"
          checked={confirmGate}
          onChange={(e) => setConfirmGate(e.target.checked)}
          className="h-5 w-5 accent-[#7c8cf8]"
        />
      </label>
      <button
        type="button"
        onClick={resetAll}
        className="min-h-[48px] rounded-lg border border-edge text-sm text-red-400"
      >
        Reset workspace (clears local data)
      </button>
      <p className="text-[11px] text-zinc-600">
        Persistence: {hydrated ? "IndexedDB (local)" : "loading…"} · All model
        calls are mocked.
      </p>
    </div>
  );
}

function MoveSheet() {
  const collections = useFlow((s) => s.collections);
  const selected = useFlow((s) => s.selectedIds);
  const moveToCollection = useFlow((s) => s.moveToCollection);
  const setMobileSheet = useFlow((s) => s.setMobileSheet);
  const setSelectionMode = useFlow((s) => s.setSelectionMode);

  const go = (target: string | null) => {
    moveToCollection(selected, target);
    setMobileSheet(null);
    setSelectionMode(false);
  };

  return (
    <div className="h-full overflow-y-auto p-2" role="listbox" aria-label="Choose collection">
      <button
        type="button"
        onClick={() => go(null)}
        className="flex min-h-[48px] w-full items-center rounded-md px-3 text-left text-sm text-zinc-200 hover:bg-raise"
      >
        All assets (no collection)
      </button>
      {collections.map((c) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => go(c.id)}
          className="flex min-h-[48px] w-full items-center gap-2 rounded-md px-3 text-left text-sm text-zinc-300 hover:bg-raise"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {c.name}
        </button>
      ))}
    </div>
  );
}

function BottomNav() {
  const mobileTab = useFlow((s) => s.mobileTab);
  const setMobileTab = useFlow((s) => s.setMobileTab);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-edge bg-panel"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setMobileTab(t.id)}
          aria-current={mobileTab === t.id ? "page" : undefined}
          className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 text-[10px] ${
            mobileTab === t.id ? "text-accent" : "text-zinc-500"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6">
            <path d={t.icon} />
          </svg>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
