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
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import DroppableFolderChip from "@/components/dnd/DroppableFolderChip";

interface FolderContext {
  id: string;
  name: string;
  color: string;
  breadcrumb: string[];
}

function FolderTile({ folder, isActive, onClick, currentUserId, onFolderDelete }: {
  folder: Folder;
  isActive: boolean;
  onClick: (folder: Folder) => void;
  currentUserId: string;
  onFolderDelete?: (folderId: string) => void;
}) {
  const color = folder.color_hex || '#7c5cbf';
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const hasThumbnails = folder.thumbnails && folder.thumbnails.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwned = folder.owner_id === currentUserId;

  const handleFolderDelete = async () => {
    setMenuOpen(false);
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onFolderDelete?.(folder.id);
    } else {
      const body = await res.json().catch(() => ({}));
      console.error('Folder delete failed', res.status, body);
    }
  };

  // Escape key closes menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    if (menuOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [menuOpen]);

  const showToast = (message: string) => {
    const existing = document.getElementById('temp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'temp-toast';
    toast.style.cssText = 'position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%); background: #111; color: #fff; padding: 12px 20px; border-radius: 12px; font-size: 13px; font-weight: 600; z-index: 60; pointer-events: none;';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  };

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
      {/* 2x2 thumbnail collage or fallback color collage */}
      {hasThumbnails ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '1px',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-1/2 h-1/2 overflow-hidden" style={{ position: 'relative' }}>
              {folder.thumbnails[i] ? (
                <Image
                  src={supabaseUrl + '/storage/v1/object/public/thumbnails/' + folder.thumbnails[i]}
                  alt=""
                  fill
                  sizes="50px"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: color + '55' }}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
          }}
        >
          {[`${color}dd`, `${color}99`, `${color}bb`, `${color}55`].map((bg, i) => (
            <div key={i} style={{ background: bg }} />
          ))}
        </div>
      )}
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

      {/* Menu button (top-right) - only show if owned */}
      {isOwned && (
        <span
          role="button"
          aria-label="Folder menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 4,
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="18" r="2" />
          </svg>
        </span>
      )}

      {/* Menu popover */}
      {menuOpen && (
        <>
          {/* Full-screen overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          {/* Popover */}
          <div
            className="absolute top-8 right-2 z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-2 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
              onClick={() => {
                setMenuOpen(false);
                showToast('Coming soon');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Rename
            </button>
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500"
              onClick={handleFolderDelete}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}
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
      ownerId: n.owner_id,
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
  folders = [],
}: FeedGridProps) {
  const router = useRouter();

  const [localFolders, setLocalFolders] = useState(folders);

  // P9-T06-FIX: SSR hydration — initialize store from server-parsed state
  useFeedURLSync({ initialFilterState });

  // P9-T06-FIX: Canonical feed hook — handles ALL data fetching including search
  // Search is now p_search_query in get_feed, NOT a separate search_nodes RPC
  const {
    nodes: clientNodes,
    isLoading,
    error: feedError,
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

  // P9-T01 TODO: Folder filter chips do not exist yet. When implemented, add onClick handler:
  // toggleFolderFilter(folderId) from filterStore, show active state with accent border.
  // Current folder tiles are for navigation (context), not multi-filter.

  const handleFolderClick = useCallback((folder: Folder) => {
    useFilterStore.getState().pushFolder({ id: folder.id, name: folder.name, color_hex: folder.color_hex });
    setPendingFolderSwitch(true);
    useFilterStore.getState().setContext({ folderId: folder.id });
  }, []);

  // Simple toast utility
  const showToast = useCallback((message: string) => {
    const existing = document.getElementById('temp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'temp-toast';
    toast.style.cssText = 'position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%); background: #111; color: #fff; padding: 12px 20px; border-radius: 12px; font-size: 13px; font-weight: 600; z-index: 60; pointer-events: none;';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }, []);

  // Card menu callbacks
  const handleShare = useCallback((_node: FeedNode) => {
    showToast('Coming soon — use drag to share');
  }, [showToast]);

  const handleMoveToFolder = useCallback((_node: FeedNode) => {
    showToast('Coming soon — use drag to move');
  }, [showToast]);

  const handleAddTag = useCallback((_node: FeedNode) => {
    showToast('Coming soon — use Tag Mode via FAB');
  }, [showToast]);

  const handleDelete = useCallback((_nodeId: string) => {
    // Optimistic removal from local state
    // Note: Since we use useFeed hook which manages its own state,
    // we'll trigger a refresh to sync with server
    router.refresh();
  }, [router]);

  // Wrapper callbacks for view components that work with FeedItem
  const handleShareItem = useCallback((item: FeedItem) => {
    const node = nodeByItemId.get(item.id);
    if (node) handleShare(node);
  }, [nodeByItemId, handleShare]);

  const handleMoveToFolderItem = useCallback((item: FeedItem) => {
    const node = nodeByItemId.get(item.id);
    if (node) handleMoveToFolder(node);
  }, [nodeByItemId, handleMoveToFolder]);

  const handleAddTagItem = useCallback((item: FeedItem) => {
    const node = nodeByItemId.get(item.id);
    if (node) handleAddTag(node);
  }, [nodeByItemId, handleAddTag]);


  const handleFolderDelete = useCallback((folderId: string) => {
    setLocalFolders(prev => prev.filter(f => f.id !== folderId));
    router.refresh();
  }, [router]);

  // Convert FeedNode[] → FeedItem[] for view components
  const feedItems = useMemo(() => {
    return toFeedItems(displayNodes);
  }, [displayNodes]);

  // Reset pendingFolderSwitch when clientNodes changes (new fetch completed)
  useEffect(() => {
    if (!isLoading) queueMicrotask(() => setPendingFolderSwitch(false));
  }, [clientNodes, isLoading]);


  const visibleFolders = useMemo(() => {
    if (!activeFolderId) {
      return localFolders.filter(f => f.parent_folder_id === null);
    }
    return localFolders.filter(f => f.parent_folder_id === activeFolderId);
  }, [localFolders, activeFolderId]);

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
        <DroppableFolderChip key={f.id} folderId={f.id}>
          <FolderTile
            folder={f}
            isActive={activeFolderId === f.id}
            onClick={handleFolderClick}
            currentUserId={currentUserId}
            onFolderDelete={handleFolderDelete}
          />
        </DroppableFolderChip>
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
          onShare={handleShare}
          onMoveToFolder={handleMoveToFolder}
          onAddTag={handleAddTag}
          onDelete={handleDelete}
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
          <FreeGrid nodes={displayNodes} scopeKey={scopeKey} onCardClick={handleOpen} currentUserId={currentUserId} activeFolderId={activeFolderId} onShare={handleShare} onMoveToFolder={handleMoveToFolder} onAddTag={handleAddTag} onDelete={handleDelete} />
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
        <ColView items={feedItems} zoom={zoom} scopeKey={scopeKey} onItemClick={handleItemClick} currentUserId={currentUserId} onCardShare={handleShareItem} onCardMoveToFolder={handleMoveToFolderItem} onCardAddTag={handleAddTagItem} onCardDelete={handleDelete} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── Mason view ── */
  if (view === "mason") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        <MasonView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} currentUserId={currentUserId} onCardShare={handleShareItem} onCardMoveToFolder={handleMoveToFolderItem} onCardAddTag={handleAddTagItem} onCardDelete={handleDelete} />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
      </div>
    );
  }

  /* ── List view ── */
  if (view === "list") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        <ListView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} currentUserId={currentUserId} onCardShare={handleShareItem} onCardMoveToFolder={handleMoveToFolderItem} onCardAddTag={handleAddTagItem} onCardDelete={handleDelete} />
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
          currentUserId={currentUserId}
          onCardShare={handleShareItem}
          onCardMoveToFolder={handleMoveToFolderItem}
          onCardAddTag={handleAddTagItem}
          onCardDelete={handleDelete}
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
          onShare={handleShare}
          onMoveToFolder={handleMoveToFolder}
          onAddTag={handleAddTag}
          onDelete={handleDelete}
        />
      )}
      <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />
    </div>
  );
}
