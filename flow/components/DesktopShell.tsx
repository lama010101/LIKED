"use client";

import { useFlow } from "@/flow/store";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";
import AssetGrid from "./AssetGrid";
import BatchView from "./BatchView";
import InspectorContent from "./Inspector";
import FlowAgentConsole from "./FlowAgentConsole";
import FriendsRail from "./FriendsRail";

export default function DesktopShell() {
  const viewMode = useFlow((s) => s.viewMode);
  const inspectorCardId = useFlow((s) => s.inspectorCardId);
  const agentOpen = useFlow((s) => s.agentOpen);

  return (
    <div className="flex h-dvh overflow-hidden bg-ink text-zinc-200">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <FriendsRail />
        <Toolbar />
        {viewMode === "grid" ? <AssetGrid /> : <BatchView />}
      </main>

      {/* inspector panel */}
      {inspectorCardId && (
        <aside
          aria-label="Inspector"
          className="w-72 shrink-0 border-l border-edge bg-panel"
        >
          <InspectorContent />
        </aside>
      )}

      {/* docked agent console */}
      {agentOpen && (
        <aside
          aria-label="Flow agent"
          className="w-80 shrink-0 border-l border-edge"
        >
          <FlowAgentConsole />
        </aside>
      )}
    </div>
  );
}
