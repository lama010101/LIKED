"use client";

import { SortKey, useFlow } from "@/store";

export default function Toolbar() {
  const viewMode = useFlow((s) => s.viewMode);
  const setViewMode = useFlow((s) => s.setViewMode);
  const cols = useFlow((s) => s.cols);
  const zoomIn = useFlow((s) => s.zoomIn);
  const zoomOut = useFlow((s) => s.zoomOut);
  const sortBy = useFlow((s) => s.sortBy);
  const setSortBy = useFlow((s) => s.setSortBy);
  const selected = useFlow((s) => s.selectedIds);
  const collections = useFlow((s) => s.collections);
  const moveToCollection = useFlow((s) => s.moveToCollection);
  const archiveCards = useFlow((s) => s.archiveCards);
  const createCollectionFromCards = useFlow((s) => s.createCollectionFromCards);
  const clearSelection = useFlow((s) => s.clearSelection);
  const activeCollection = useFlow((s) => s.activeCollection);
  const credits = useFlow((s) => s.credits);
  const confirmGate = useFlow((s) => s.confirmGate);
  const setConfirmGate = useFlow((s) => s.setConfirmGate);
  const agentOpen = useFlow((s) => s.agentOpen);
  const setAgentOpen = useFlow((s) => s.setAgentOpen);

  const hasSel = selected.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-panel px-3 py-2">
      {/* view mode */}
      <div
        role="tablist"
        aria-label="View mode"
        className="flex overflow-hidden rounded-md border border-edge"
      >
        {(["grid", "batch"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={viewMode === m}
            onClick={() => setViewMode(m)}
            className={`px-3 py-1.5 text-xs capitalize ${
              viewMode === m
                ? "bg-raise text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m === "grid" ? "Grid" : "Batch"}
          </button>
        ))}
      </div>

      {/* zoom */}
      <div className="flex items-center rounded-md border border-edge" aria-label="Grid zoom">
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out (smaller thumbnails)"
          className="px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
          disabled={cols >= 6}
        >
          −
        </button>
        <span className="w-8 text-center text-[10px] text-zinc-500">
          {cols}col
        </span>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in (larger thumbnails)"
          className="px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
          disabled={cols <= 1}
        >
          +
        </button>
      </div>

      {/* sort */}
      <select
        value={sortBy}
        aria-label="Sort assets"
        onChange={(e) => setSortBy(e.target.value as SortKey)}
        className="rounded-md border border-edge bg-ink px-2 py-1.5 text-xs text-zinc-400 outline-none"
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="duration">Duration</option>
        <option value="seed">Seed</option>
        <option value="prompt">Prompt A–Z</option>
      </select>

      {/* selection actions */}
      {hasSel && (
        <div className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1">
          <span className="text-xs text-accent">{selected.length} selected</span>
          <button
            type="button"
            onClick={() => createCollectionFromCards(selected)}
            className="rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-raise"
          >
            Group
          </button>
          <select
            aria-label="Move selection to collection"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              moveToCollection(
                selected,
                e.target.value === "root" ? null : e.target.value
              );
            }}
            className="rounded bg-ink px-1 py-1 text-xs text-zinc-400 outline-none"
          >
            <option value="">Move to…</option>
            <option value="root">All assets</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {activeCollection === "archived" ? (
            <button
              type="button"
              onClick={() => archiveCards(selected, false)}
              className="rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-raise"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => archiveCards(selected, true)}
              className="rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-raise"
            >
              Archive
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="rounded px-1.5 py-1 text-xs text-zinc-500 hover:bg-raise"
          >
            ✕
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* confirm gate */}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            checked={confirmGate}
            onChange={(e) => setConfirmGate(e.target.checked)}
            className="accent-[#7c8cf8]"
          />
          Confirm agent actions
        </label>
        <span
          className="rounded-full border border-edge px-2 py-0.5 text-[11px] text-zinc-400"
          title="Generation credits (mock)"
        >
          {credits} cr
        </span>
        <button
          type="button"
          onClick={() => setAgentOpen(!agentOpen)}
          aria-pressed={agentOpen}
          className={`rounded-md border px-2.5 py-1.5 text-xs ${
            agentOpen
              ? "border-accent bg-accent/15 text-accent"
              : "border-edge text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Agent
        </button>
      </div>
    </div>
  );
}
