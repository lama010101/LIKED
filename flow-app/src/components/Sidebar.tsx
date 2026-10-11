"use client";

import { useFlow } from "@/store";
import CollectionTree from "./CollectionTree";

export default function Sidebar() {
  const collapsed = useFlow((s) => s.sidebarCollapsed);
  const toggle = useFlow((s) => s.toggleSidebar);
  const active = useFlow((s) => s.activeCollection);
  const collections = useFlow((s) => s.collections);
  const activeName =
    active === "all"
      ? "All assets"
      : active === "archived"
        ? "Archive"
        : (collections.find((c) => c.id === active)?.name ?? "Project");

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center border-r border-edge bg-panel py-3">
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand sidebar"
          className="rounded-md p-2 text-zinc-500 hover:bg-raise hover:text-zinc-200"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-edge bg-panel">
      {/* project switcher */}
      <div className="flex items-center gap-2 border-b border-edge p-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/20 text-sm font-bold text-accent">
          F
        </div>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-zinc-200"
          aria-label="Switch project"
          title="Flow Project"
        >
          Flow Project
          <span className="ml-1 text-zinc-600">▾</span>
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label="Collapse sidebar"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-raise hover:text-zinc-200"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <CollectionTree />
      </div>

      <div className="border-t border-edge px-3 py-2 text-[10px] text-zinc-600">
        Viewing: <span className="text-zinc-400">{activeName}</span>
      </div>
    </aside>
  );
}
