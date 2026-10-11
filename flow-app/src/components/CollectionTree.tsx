"use client";

import { useState } from "react";
import { collectionChildren, useFlow } from "@/store";
import { Collection } from "@/lib/mock";

function parseDrop(e: React.DragEvent): string[] | null {
  const raw = e.dataTransfer.getData("application/x-flow-ids");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function useDropTarget(onDrop: (ids: string[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("application/x-flow-ids")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const ids = parseDrop(e);
        if (ids?.length) onDrop(ids);
      },
    },
  };
}

function TreeNode({ col, depth }: { col: Collection; depth: number }) {
  const activeCollection = useFlow((s) => s.activeCollection);
  const expanded = useFlow((s) => s.expanded);
  const collections = useFlow((s) => s.collections);
  const cards = useFlow((s) => s.cards);
  const setActiveCollection = useFlow((s) => s.setActiveCollection);
  const setExpanded = useFlow((s) => s.setExpanded);
  const moveToCollection = useFlow((s) => s.moveToCollection);
  const renameCollection = useFlow((s) => s.renameCollection);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(col.name);
  const kids = collectionChildren(collections, col.id);
  const isOpen = expanded[col.id] ?? false;
  const active = activeCollection === col.id;
  const count = cards.filter((c) => c.collectionId === col.id).length;

  const { over, props } = useDropTarget((ids) => moveToCollection(ids, col.id));

  return (
    <div>
      <div
        {...props}
        className={`group flex min-h-[36px] items-center gap-1 rounded-md px-1.5 text-sm ${
          over ? "bg-accent/20 ring-1 ring-accent" : active ? "bg-raise text-zinc-100" : "text-zinc-400 hover:bg-raise/60 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <button
          type="button"
          aria-label={isOpen ? `Collapse ${col.name}` : `Expand ${col.name}`}
          aria-expanded={isOpen}
          onClick={() => setExpanded(col.id, !isOpen)}
          className={`flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-200 ${kids.length ? "" : "invisible"}`}
        >
          <svg
            viewBox="0 0 10 10"
            className={`h-2.5 w-2.5 fill-current transition-transform ${isOpen ? "rotate-90" : ""}`}
          >
            <path d="M3 1l4 4-4 4z" />
          </svg>
        </button>
        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label="Collection name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              renameCollection(col.id, draft);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameCollection(col.id, draft);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setDraft(col.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-accent bg-ink px-1 py-0.5 text-sm text-zinc-100 outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setActiveCollection(col.id)}
            onDoubleClick={() => {
              setDraft(col.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-left"
            title="Click to open, double-click to rename"
          >
            {col.name}
          </button>
        )}
        <span className="px-1 text-[10px] text-zinc-600">{count}</span>
        {!editing && (
          <button
            type="button"
            aria-label={`Rename ${col.name}`}
            onClick={() => {
              setDraft(col.name);
              setEditing(true);
            }}
            className="hidden h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-200 group-hover:flex"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-current">
              <path d="M8.5 1.5l2 2L4 10l-2.5.5L2 8z" />
            </svg>
          </button>
        )}
      </div>
      {isOpen && kids.map((k) => <TreeNode key={k.id} col={k} depth={depth + 1} />)}
    </div>
  );
}

export default function CollectionTree() {
  const collections = useFlow((s) => s.collections);
  const activeCollection = useFlow((s) => s.setActiveCollection);
  const moveToCollection = useFlow((s) => s.moveToCollection);
  const createCollection = useFlow((s) => s.createCollection);
  const active = useFlow((s) => s.activeCollection);
  const archivedCount = useFlow((s) => s.cards.filter((c) => c.archived).length);

  const root = useDropTarget((ids) => moveToCollection(ids, null));

  return (
    <nav aria-label="Collections" className="flex flex-col gap-0.5">
      <div {...root.props} className={root.over ? "rounded-md ring-1 ring-accent" : ""}>
        <button
          type="button"
          onClick={() => activeCollection("all")}
          className={`flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-sm ${
            active === "all" && !root.over
              ? "bg-raise text-zinc-100"
              : "text-zinc-400 hover:bg-raise/60 hover:text-zinc-200"
          }`}
        >
          <Dot className="bg-accent" />
          All assets
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between px-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Collections
        </span>
        <button
          type="button"
          aria-label="New collection"
          onClick={() => createCollection("New collection")}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-raise hover:text-zinc-200"
        >
          +
        </button>
      </div>

      {collectionChildren(collections, null).map((c) => (
        <TreeNode key={c.id} col={c} depth={0} />
      ))}

      <button
        type="button"
        onClick={() => activeCollection("archived")}
        className={`mt-2 flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-sm ${
          active === "archived"
            ? "bg-raise text-zinc-100"
            : "text-zinc-400 hover:bg-raise/60 hover:text-zinc-200"
        }`}
      >
        <Dot className="bg-zinc-600" />
        Archive
        <span className="ml-auto text-[10px] text-zinc-600">{archivedCount}</span>
      </button>
    </nav>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${className}`} aria-hidden />;
}
