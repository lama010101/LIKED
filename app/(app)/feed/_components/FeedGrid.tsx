"use client";

/**
 * FeedGrid — canonical feed display component
 * P9-T06-FIX: Unified feed system
 *
 * COMPLIANCE: 04_FEED_SQL_SPEC.md §2 (get_feed function)
 *
 * INVARIANTS:
 * - Uses useFeed hook for ALL client-side data fetching (including search)
 * - Search is handled via p_search_query in get_feed (NOT separate search_nodes RPC)
 * - No direct supabase RPC calls — useFeed is the sole data source
 * - No client-side filtering or sorting
 * - SSR nodes passed as initial data; useFeed takes over after hydration
 *
 * DO NOT:
 * - Call supabaseBrowser.rpc directly for feed data
 * - Add client-side filtering/sorting logic
 * - Use get_visible_nodes, search_nodes, or get_nodes_in_folder
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import type { FeedNode } from "@/lib/hooks/useFeed";
import type { FeedItem } from "@/lib/types/feed";
import type { Folder } from "@/lib/types/app";
import { useFeedURLSync } from "@/lib/hooks/useFeedURLSync";
import { useFeed } from "@/lib/hooks/useFeed";
import { useFilterStore, type FilterState } from "@/lib/store/filterStore";
import CardDetailSheet from "@/components/modals/CardDetailSheet";
import FreeGrid from "./FreeGrid";
import FolderView from "./FolderView";
import ColView from "./views/ColView";
import MasonView from "./views/MasonView";
import ListView from "./views/ListView";
import HorizView from "./views/HorizView";
import SortableNodeGrid from "./SortableNodeGrid";

interface FolderContext {
  id: string;
  name: string;
  color: string;
  breadcrumb: string[];
}

type ViewMode = 'col' | 'mason' | 'list' | 'horiz' | 'free';

function FolderTile({ folder, isActive, onClick }: {
  folder: Folder;
  isActive: boolean;
  onClick: (folder: Folder) => void;
}) {
  const color = folder.color_hex || '#7c5cbf';
  return (
    <div
      onClick={() => {
        onClick(folder);
      }}
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 10,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        pointerEvents: 'auto',
        background: `linear-gradient(135deg, ${color}cc, ${color}66)`,
        boxShadow: isActive ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '8px',
      }}
    >
      {/* 2x2 color collage top area */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
      }}>
        {[`${color}dd`, `${color}99`, `${color}bb`, `${color}55`].map((bg, i) => (
          <div key={i} style={{ background: bg }} />
        ))}
      </div>
      {/* Folder icon overlay */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        width: 24, height: 24, borderRadius: 6,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      {/* Name + count overlay at bottom */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'linear-gradient(to top, rgba(0,0,0,0.72), transparent)',
        margin: '-8px', padding: '20px 8px 8px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2, wordBreak: 'break-word' }}>
          {folder.name}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
          {folder.node_count === 1 ? '1 item' : `${folder.node_count} items`}
        </div>
      </div>
    </div>
  );
}


interface FeedGridProps {
  /** SSR-rendered nodes from server component (initial page load) */
  nodes: FeedNode[];
  currentUserId: string;
  scopeKey?: string;
  folderContext?: FolderContext | null;
  onExitFolder?: () => void;
  onFolderFilterClick?: () => void;
  /** User's language code for search (e.g., 'en', 'fr', 'th') */
  languageCode?: string;
  /** Server-parsed initial filter state for SSR hydration */
  initialFilterState?: Partial<FilterState>;
  /** Total count from server (SSR) */
  totalCount?: number;
  /** Next cursor from server (SSR) */
  nextCursor?: { createdAt: string; nodeId: string } | null;
  /** User's folders for quick navigation */
  folders?: Folder[];
}


/** Convert FeedNode[] (from get_feed RPC) to FeedItem[] for view components */
function toFeedItems(nodes: FeedNode[]): FeedItem[] {
  return nodes.map((n) => {
    const hue = Math.abs(
      n.node_id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ) % 360;
    let source: string | undefined;
    if (n.url) {
      try { source = new URL(n.url).hostname; } catch { /* ignore */ }
    }
    return {
      id: n.node_id,
      kind: 'card' as const,
      title: n.title ?? n.url ?? 'Untitled',
      art: `linear-gradient(135deg, hsl(${hue}, 40%, 35%), hsl(${(hue + 60) % 360}, 50%, 25%))`,
      thumbnailKey: n.thumbnail_key ?? null,
      dir: n.direction === 'own' ? 'mine' : n.direction,
      source,
    };
  });
}


export default function FeedGrid({
  nodes: ssrNodes,
  currentUserId,
  scopeKey = "default",
  folderContext = null,
  onExitFolder,
  onFolderFilterClick,
  languageCode = 'en',
  initialFilterState,
  totalCount: ssrTotalCount,
  nextCursor: ssrNextCursor,
  folders = [],
}: FeedGridProps) {
  // P9-T06-FIX: SSR hydration — initialize store from server-parsed state
  useFeedURLSync({ initialFilterState });

  // P9-T06-FIX: Canonical feed hook — handles ALL data fetching including search
  // Search is now p_search_query in get_feed, NOT a separate search_nodes RPC
  const {
    nodes: clientNodes,
    isLoading,
    error: feedError,
    hasMore,
    totalCount,
    loadMore,
    refresh,
  } = useFeed({ userId: currentUserId, languageCode });

  const searchQuery = useFilterStore((s) => s.searchQuery);

  // Reactive presentation state from shared Zustand store (layout.tsx ↔ FeedGrid)
  const view = useFilterStore((s) => s.viewMode);
  const zoom = useFilterStore((s) => s.zoom);
  const activeFolderId = useFilterStore((s) => s.folderId);

  const [activeNode, setActiveNode] = useState<FeedNode | null>(null);
  const [pendingFolderSwitch, setPendingFolderSwitch] = useState(false);

  // Use client-side data once useFeed has fetched; fall back to SSR nodes
  const displayNodes = useMemo(() => {
    if (pendingFolderSwitch) return [];
    if (isLoading) return [];
    if (clientNodes.length > 0) return clientNodes;
    // Only use SSR nodes at root (no folder context) and only on initial load
    // Once clientNodes has been populated at least once, never fall back to SSR
    if (activeFolderId) return clientNodes; // empty array — folder is genuinely empty
    return ssrNodes;
  }, [clientNodes, ssrNodes, pendingFolderSwitch, isLoading, activeFolderId]);

  const handleOpen = useCallback((node: FeedNode) => {
    setActiveNode(node);
  }, []);

  const handleClose = useCallback(() => {
    setActiveNode(null);
  }, []);

  // Build nodeId→FeedNode lookup map for handleItemClick
  const nodeByItemId = useMemo(() => {
    return new Map(displayNodes.map((n) => [n.node_id, n]));
  }, [displayNodes]);

  const handleItemClick = useCallback((item: FeedItem) => {
    const node = nodeByItemId.get(item.id);
    if (node) handleOpen(node);
  }, [nodeByItemId, handleOpen]);

  // Minimal folder strip — FOLDER-004 / FOLDER-005
  const activeFolderObj = folders.find(f => f.id === activeFolderId) ?? null;

  const handleFolderClick = useCallback((folder: Folder) => {
    useFilterStore.getState().pushFolder({ id: folder.id, name: folder.name, color_hex: folder.color_hex });
    setPendingFolderSwitch(true);
    useFilterStore.getState().setContext({ folderId: folder.id });
  }, []);

  const handleNavigateBack = useCallback(() => {
    const { folderStack } = useFilterStore.getState();
    const next = folderStack.slice(0, -1);
    setPendingFolderSwitch(true);
    if (next.length === 0) {
      useFilterStore.getState().clearContext();
    } else {
      useFilterStore.getState().setFolderStack(next);
      useFilterStore.getState().setContext({ folderId: next[next.length - 1].id });
    }
  }, []);

  const handleNavigateToRoot = useCallback(() => {
    setPendingFolderSwitch(true);
    useFilterStore.getState().clearContext();
  }, []);


  // Convert FeedNode[] → FeedItem[] for view components
  const feedItems = useMemo(() => {
    return toFeedItems(displayNodes);
  }, [displayNodes]);

  // Reset pendingFolderSwitch when clientNodes changes (new fetch completed)
  useEffect(() => {
    if (!isLoading) setPendingFolderSwitch(false);
  }, [clientNodes, isLoading]);


  const visibleFolders = useMemo(() => {
    if (!activeFolderId) {
      return folders.filter(f => f.parent_folder_id === null);
    }
    return folders.filter(f => f.parent_folder_id === activeFolderId);
  }, [folders, activeFolderId]);

  const folderGrid = visibleFolders.length > 0 ? (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${zoom}, 1fr)`,
      gap: 3,
      padding: '4px 4px 0',
      borderBottom: '1px solid var(--border-1)',
      paddingBottom: 4,
      pointerEvents: 'auto',
      position: 'relative',
      zIndex: 1,
    }}>
      {visibleFolders.map(f => (
        <FolderTile
          key={f.id}
          folder={f}
          isActive={activeFolderId === f.id}
          onClick={handleFolderClick}
        />
      ))}
    </div>
  ) : null;


  // Search-specific empty state
  const emptyState = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0", textAlign: "center" }}>
      {searchQuery?.trim() ? (
        <>
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>No results for &ldquo;{searchQuery}&rdquo;</p>
          <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 8 }}>Try different keywords</p>
        </>
      ) : (
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing here yet</p>
      )}
    </div>
  );

  // Show loading state during initial fetch
  if (isLoading && displayNodes.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0" }}>
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  // Show error state
  if (feedError && displayNodes.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0" }}>
        <p style={{ color: "var(--red, #dc2626)", fontSize: 14 }}>Failed to load feed</p>
        <button onClick={refresh} style={{ color: "var(--accent)", fontSize: 12, marginTop: 8, cursor: "pointer", background: "none", border: "none" }}>Retry</button>
      </div>
    );
  }

  /* ── Folder view: hides top bar, shows folder header + breadcrumb ── */
  if (folderContext) {
    return (
      <>
        <FolderView
          folderName={folderContext.name}
          folderColor={folderContext.color}
          breadcrumb={folderContext.breadcrumb}
          nodes={displayNodes}
          onBack={onExitFolder ?? (() => {})}
          onFilterClick={onFolderFilterClick ?? (() => {})}
          onCardClick={handleOpen}
          currentUserId={currentUserId}
        />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── Free / canvas view ── */
  if (view === "free") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        {displayNodes.length === 0 ? emptyState : (
          <FreeGrid nodes={displayNodes} scopeKey={scopeKey} onCardClick={handleOpen} currentUserId={currentUserId} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── Col view ── */
  if (view === "col") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        <ColView items={feedItems} zoom={zoom} scopeKey={scopeKey} onItemClick={handleItemClick} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── Mason view ── */
  if (view === "mason") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        <MasonView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── List view ── */
  if (view === "list") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        <ListView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── Horiz view ── */
  if (view === "horiz") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        <HorizView
          items={feedItems}
          scopeKey={scopeKey}
          onItemClick={handleItemClick}
          folderContext={folderContext}
        />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── Fallback masonry (legacy viewMode prop not passed) ── */
  return (
    <div style={{ minHeight: '100%', position: 'relative' }}>
      {folderGrid}
      {displayNodes.length === 0 ? emptyState : (
        <SortableNodeGrid
          nodes={displayNodes}
          scopeKey={scopeKey}
          onCardClick={handleOpen}
          currentUserId={currentUserId}
        />
      )}
      <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
    </div>
  );
}
