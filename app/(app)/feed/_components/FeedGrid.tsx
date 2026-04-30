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

import { useState, useCallback, useMemo } from "react";
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

  // Use client-side data once useFeed has fetched; fall back to SSR nodes
  const displayNodes = useMemo(() => {
    if (clientNodes.length > 0) return clientNodes;
    if (isLoading) return ssrNodes;
    return ssrNodes;
  }, [clientNodes, isLoading, ssrNodes]);

  // Reactive presentation state from shared Zustand store (layout.tsx ↔ FeedGrid)
  const view = useFilterStore((s) => s.viewMode);
  const zoom = useFilterStore((s) => s.zoom);

  const [activeNode, setActiveNode] = useState<FeedNode | null>(null);

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
  const activeFolderId = useFilterStore((s) => s.folderId);

  // Convert FeedNode[] → FeedItem[] for view components
  const feedItems = useMemo(() => {
    return toFeedItems(displayNodes);
  }, [displayNodes]);
  const folderStrip = folders.length > 0 ? (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 14px", borderBottom: "1px solid var(--border-1)" }}>
      {folders.map((f) => {
        const isActive = activeFolderId === f.id;
        return (
          <div
            key={f.id}
            onClick={() => {
              if (isActive) {
                useFilterStore.getState().clearContext();
              } else {
                useFilterStore.getState().setContext({ folderId: f.id });
              }
            }}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 8,
              background: f.color_hex || "var(--surface-3)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isActive ? "0 0 0 2px #fff, 0 0 0 4px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {f.name}
          </div>
        );
      })}
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
      <>
        {folderStrip}
        {displayNodes.length === 0 ? emptyState : (
          <FreeGrid nodes={displayNodes} scopeKey={scopeKey} onCardClick={handleOpen} currentUserId={currentUserId} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── Col view ── */
  if (view === "col") {
    return (
      <>
        {folderStrip}
        <ColView items={feedItems} zoom={zoom} scopeKey={scopeKey} onItemClick={handleItemClick} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── Mason view ── */
  if (view === "mason") {
    return (
      <>
        {folderStrip}
        <MasonView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── List view ── */
  if (view === "list") {
    return (
      <>
        {folderStrip}
        <ListView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── Horiz view ── */
  if (view === "horiz") {
    return (
      <>
        {folderStrip}
        <HorizView
          items={feedItems}
          scopeKey={scopeKey}
          onItemClick={handleItemClick}
          folderContext={folderContext}
        />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── Fallback masonry (legacy viewMode prop not passed) ── */
  return (
    <>
      {folderStrip}
      {displayNodes.length === 0 ? emptyState : (
        <SortableNodeGrid
          nodes={displayNodes}
          scopeKey={scopeKey}
          onCardClick={handleOpen}
          currentUserId={currentUserId}
        />
      )}
      <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
    </>
  );
}
