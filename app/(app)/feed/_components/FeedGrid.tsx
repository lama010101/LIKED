"use client";

import { useState, useCallback } from "react";
import type { VisibleNode } from "@/lib/db/visibility";
import type { FeedItem } from "@/lib/types/feed";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import NodeCard from "./NodeCard";
import SlideOver from "./SlideOver";
import FreeGrid from "./FreeGrid";
import FolderView from "./FolderView";
import ColView from "./views/ColView";
import MasonView from "./views/MasonView";
import ListView from "./views/ListView";
import HorizView from "./views/HorizView";

interface FolderContext {
  id: string;
  name: string;
  color: string;
  breadcrumb: string[];
}

type ViewMode = 'col' | 'mason' | 'list' | 'horiz' | 'free';

interface FeedGridProps {
  nodes: VisibleNode[];
  view?: ViewMode;
  zoom?: number;
  scopeKey?: string;
  folderContext?: FolderContext | null;
  onExitFolder?: () => void;
  onFolderFilterClick?: () => void;
}

const STUB_ITEMS: FeedItem[] = [
  { id:'c-0', kind:'card', title:'Morning routine triggers', art:'linear-gradient(135deg,#1a8a7b,#0d3a3a)', tag:'Health', tagColor:'#7a9a2a', rating:9, dir:'received', source:'youtube.com', daysAgo:0 },
  { id:'c-1', kind:'card', title:'In Rainbows — 20 years', art:'linear-gradient(135deg,#7a3ad5,#3a1c9e)', tag:'Music', tagColor:'#3a7bd5', rating:8, dir:'mine', sentTo:['al','bo'], source:'spotify.com', daysAgo:1 },
  { id:'c-2', kind:'card', title:'BTFD — a retrospective', art:'linear-gradient(135deg,#4a9fd5,#1c4a9e)', tag:'Finance', tagColor:'#2a8a4a', rating:0, dir:'received', source:'substack.com', daysAgo:2 },
  { id:'c-3', kind:'card', title:'Past Lives', art:'linear-gradient(135deg,#d54a9f,#6b1c4a)', tag:'Film', tagColor:'#c43a5a', rating:7.5, dir:'received', source:'vimeo.com', daysAgo:3 },
  { id:'c-4', kind:'card', title:'Amalfi restaurants', art:'linear-gradient(135deg,#f5a623,#ff6b6b)', tag:'Food', tagColor:'#e05c3a', rating:8.5, dir:'mine', source:'nytimes.com', daysAgo:4 },
  { id:'f-0', kind:'folder', title:'Favorites', art:'linear-gradient(135deg,#7a3ad5,#3a1c9e)', folderColor:'#e05c3a', folderCount:42 },
  { id:'f-1', kind:'folder', title:'Travel', art:'linear-gradient(135deg,#4a9fd5,#1c4a9e)', folderColor:'#3a7bd5', folderCount:28 },
  { id:'c-5', kind:'card', title:'Japanese jazz history', art:'linear-gradient(135deg,#1c3a4a,#40607a)', tag:'Music', tagColor:'#3a7bd5', rating:6, dir:'received', source:'youtube.com', daysAgo:5 },
  { id:'c-6', kind:'card', title:'Obsidian plugin roundup', art:'linear-gradient(135deg,#2d4a1c,#0d2a1a)', tag:'Tech', tagColor:'#7b3ad5', rating:0, dir:'received', source:'substack.com', daysAgo:6 },
  { id:'c-7', kind:'card', title:'Fermented foods 101', art:'linear-gradient(135deg,#4ad58a,#1c6a40)', tag:'Food', tagColor:'#e05c3a', rating:5.5, dir:'mine', source:'substack.com', daysAgo:7 },
];

export default function FeedGrid({
  nodes,
  view: viewProp,
  zoom: zoomProp,
  scopeKey = "default",
  folderContext = null,
  onExitFolder,
  onFolderFilterClick,
}: FeedGridProps) {
  const [storedView] = useLocalStorage<ViewMode>('liked.view', 'col');
  const [storedZoom] = useLocalStorage<number>('liked.zoom', 2);
  const view = viewProp ?? storedView;
  const zoom = zoomProp ?? storedZoom;

  const [activeNode, setActiveNode] = useState<VisibleNode | null>(null);

  const handleOpen = useCallback((node: VisibleNode) => {
    setActiveNode(node);
  }, []);

  const handleClose = useCallback(() => {
    setActiveNode(null);
  }, []);

  const handleItemClick = useCallback((item: FeedItem) => {
    /* stub: no-op until real data wired in P2/P9 */
  }, []);

  const emptyState = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0", textAlign: "center" }}>
      <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing here yet</p>
    </div>
  );

  /* ── Folder view: hides top bar, shows folder header + breadcrumb ── */
  if (folderContext) {
    return (
      <>
        <FolderView
          folderName={folderContext.name}
          folderColor={folderContext.color}
          breadcrumb={folderContext.breadcrumb}
          nodes={nodes}
          onBack={onExitFolder ?? (() => {})}
          onFilterClick={onFolderFilterClick ?? (() => {})}
          onCardClick={handleOpen}
        />
        <SlideOver node={activeNode} onClose={handleClose} />
      </>
    );
  }

  /* ── Free / canvas view ── */
  if (view === "free") {
    return (
      <>
        {nodes.length === 0 ? emptyState : (
          <FreeGrid nodes={nodes} scopeKey={scopeKey} onCardClick={handleOpen} />
        )}
        <SlideOver node={activeNode} onClose={handleClose} />
      </>
    );
  }

  /* ── Col view ── */
  if (view === "col") {
    return <ColView items={STUB_ITEMS} zoom={zoom} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── Mason view ── */
  if (view === "mason") {
    return <MasonView items={STUB_ITEMS} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── List view ── */
  if (view === "list") {
    return <ListView items={STUB_ITEMS} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── Horiz view ── */
  if (view === "horiz") {
    return <HorizView items={STUB_ITEMS} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── Fallback masonry (legacy viewMode prop not passed) ── */
  return (
    <>
      {nodes.length === 0 ? emptyState : (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
          {nodes.map((node) => (
            <div key={node.id} className="break-inside-avoid mb-4">
              <NodeCard node={node} onClick={handleOpen} />
            </div>
          ))}
        </div>
      )}
      <SlideOver node={activeNode} onClose={handleClose} />
    </>
  );
}
