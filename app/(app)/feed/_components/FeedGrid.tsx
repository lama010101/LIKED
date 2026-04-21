"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { VisibleNode, FeedView, MineSubFilter } from "@/lib/db/visibility";
import type { FeedItem } from "@/lib/types/feed";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { useFeedURLSync } from "@/lib/hooks/useFeedURLSync";
import { useFilterStore, type FilterState } from "@/lib/store/filterStore";
import { supabaseBrowser } from "@/lib/supabase/client";
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
  nodes: VisibleNode[];
  currentUserId: string;
  feedView?: FeedView;
  mineFilter?: MineSubFilter;
  view?: ViewMode;
  zoom?: number;
  scopeKey?: string;
  folderContext?: FolderContext | null;
  onExitFolder?: () => void;
  onFolderFilterClick?: () => void;
  /** User's language code for search (e.g., 'en', 'fr', 'th') */
  languageCode?: string;
  /** Server-parsed initial filter state for SSR hydration */
  initialFilterState?: Partial<FilterState>;
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

/** Convert VisibleNode[] (from DB) to FeedItem[] for view components */
function toFeedItems(nodes: VisibleNode[]): FeedItem[] {
  return nodes.map((n) => {
    const hue = Math.abs(
      n.id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ) % 360;
    let source: string | undefined;
    if (n.url) {
      try { source = new URL(n.url).hostname; } catch { /* ignore */ }
    }
    return {
      id: n.id,
      kind: 'card' as const,
      title: n.title ?? n.url ?? 'Untitled',
      art: `linear-gradient(135deg, hsl(${hue}, 40%, 35%), hsl(${(hue + 60) % 360}, 50%, 25%))`,
      dir: (n.origin_user_id === n.owner_id ? 'mine' : 'received') as 'mine' | 'received',
      source,
    };
  });
}


export default function FeedGrid({
  nodes,
  currentUserId,
  feedView,
  mineFilter,
  view: viewProp,
  zoom: zoomProp,
  scopeKey = "default",
  folderContext = null,
  onExitFolder,
  onFolderFilterClick,
  languageCode = 'en',
  initialFilterState,
}: FeedGridProps) {
  // P9-T03-B: SSR hydration — initialize store from server-parsed state
  useFeedURLSync({ initialFilterState });
  // P9-T01: feedView and mineFilter are passed for future client-side filtering
  const [storedView] = useLocalStorage<ViewMode>('liked.view', 'col');
  const [storedZoom] = useLocalStorage<number>('liked.zoom', 2);
  const view = viewProp ?? storedView;
  const zoom = zoomProp ?? storedZoom;

  // P9-T02: Search integration (P9-T03: searchQuery from filterStore)
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const [searchResults, setSearchResults] = useState<VisibleNode[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);

  // Debounced search effect (300ms)
  useEffect(() => {
    if (!searchQuery?.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timeoutId = setTimeout(async () => {
      try {
        const { data, error } = await supabaseBrowser.rpc('search_nodes', {
          p_user_id: currentUserId,
          p_query: searchQuery.trim(),
          p_language_code: languageCode,
          p_sort: 'newest', // TODO: wire from filterStore
          p_view: feedView ?? 'all',
          p_mine_filter: mineFilter ?? 'all',
        });

        if (error) throw error;
        setSearchResults((data ?? []) as VisibleNode[]);
      } catch (e) {
        setSearchError(e instanceof Error ? e : new Error(String(e)));
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentUserId, languageCode, feedView, mineFilter]);

  // Use search results when available, otherwise use server-rendered nodes
  const displayNodes = useMemo(() => {
    if (searchQuery?.trim()) {
      return searchResults ?? [];
    }
    return nodes;
  }, [searchQuery, searchResults, nodes]);

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

  // P9-T02: Search-specific empty state
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

  // Show loading state during search
  if (isSearching) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0" }}>
        <p style={{ color: "var(--text-3)", fontSize: 14 }}>Searching...</p>
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
        />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  /* ── Free / canvas view ── */
  if (view === "free") {
    return (
      <>
        {displayNodes.length === 0 ? emptyState : (
          <FreeGrid nodes={displayNodes} scopeKey={scopeKey} onCardClick={handleOpen} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </>
    );
  }

  // When searching or real data is available, convert VisibleNode[] → FeedItem[]
  const feedItems = useMemo(() => {
    if (searchQuery?.trim() || displayNodes.length > 0) {
      return toFeedItems(displayNodes);
    }
    return STUB_ITEMS;
  }, [searchQuery, displayNodes]);

  /* ── Col view ── */
  if (view === "col") {
    return <ColView items={feedItems} zoom={zoom} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── Mason view ── */
  if (view === "mason") {
    return <MasonView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── List view ── */
  if (view === "list") {
    return <ListView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} />;
  }

  /* ── Horiz view ── */
  if (view === "horiz") {
    return (
      <HorizView
        items={feedItems}
        scopeKey={scopeKey}
        onItemClick={handleItemClick}
        folderContext={folderContext}
      />
    );
  }

  /* ── Fallback masonry (legacy viewMode prop not passed) ── */
  return (
    <>
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
