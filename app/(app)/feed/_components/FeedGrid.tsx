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
import { useRouter } from "next/navigation";
import type { FeedNode } from "@/lib/hooks/useFeed";
import type { FeedItem } from "@/lib/types/feed";
import type { Folder } from "@/lib/types/app";
import { useFeedURLSync } from "@/lib/hooks/useFeedURLSync";
import { useFeed } from "@/lib/hooks/useFeed";
import { useFilterStore, type FilterState } from "@/lib/store/filterStore";
import CardDetailSheet from "@/components/modals/CardDetailSheet";
import { SharePickerModal } from "@/components/modals/SharePickerModal";
import { MoveToFolderModal } from "@/components/modals/MoveToFolderModal";
import { AddTagModal } from "@/components/modals/AddTagModal";
import { RenameFolderModal } from "@/components/modals/RenameFolderModal";
import { getFriendBarAction } from "@/app/lib/actions/session";
import FreeGrid from "./FreeGrid";
import FolderView from "./FolderView";
import FolderTile from "./FolderTile";
import { toFeedItems } from "./toFeedItems";
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

  // Modal state for card/folder actions
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string; type: "node" | "folder" } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [tagTarget, setTagTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; display_name: string | null; avatar_key: string | null }>>([]);

  // Fetch friends list for SharePickerModal
  useEffect(() => {
    getFriendBarAction().then((friends) => {
      setAvailableUsers(
        friends
          .filter((f) => f.user_id !== null)
          .map((f) => ({
            id: f.user_id!,
            display_name: f.display_name,
            avatar_key: f.avatar_key,
          }))
      );
    }).catch(() => { /* non-fatal */ });
  }, []);

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

  // Card menu callbacks — open modals instead of "Coming soon" toasts
  const handleShare = useCallback((node: FeedNode) => {
    setShareTarget({ id: node.node_id, name: node.title ?? node.url ?? "Untitled", type: "node" });
  }, []);

  const handleMoveToFolder = useCallback((node: FeedNode) => {
    setMoveTarget({ id: node.node_id, name: node.title ?? node.url ?? "Untitled" });
  }, []);

  const handleAddTag = useCallback((node: FeedNode) => {
    setTagTarget({ id: node.node_id, name: node.title ?? node.url ?? "Untitled" });
  }, []);

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

  const handleFolderRename = useCallback((folder: Folder) => {
    setRenameTarget(folder);
  }, []);

  const handleFolderShare = useCallback((folder: Folder) => {
    setShareTarget({ id: folder.id, name: folder.name, type: "folder" });
  }, []);

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
      gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(80, 140 - zoom * 8)}px, 1fr))`,
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
            onFolderRename={handleFolderRename}
            onFolderShare={handleFolderShare}
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
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>🔍</div>
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>No results for &ldquo;{searchQuery}&rdquo;</p>
          <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 8 }}>Try different keywords</p>
        </>
      ) : activeFolderId ? (
        <>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📂</div>
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>Nothing here yet</p>
          <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4, opacity: 0.7 }}>Save cards to this folder from the extension</p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>🗂️</div>
          <p style={{ color: "var(--text-3)", fontSize: 14 }}>Open a folder to see your cards</p>
        </>
      )}
    </div>
  );

  // Loading state — show folder grid on home page while loading
  const loadingState = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0" }}>
      <p style={{ color: "var(--text-3)", fontSize: 14 }}>Loading...</p>
    </div>
  );

  // Error state — show folder grid on home page with error
  const errorState = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "128px 0" }}>
      <p style={{ color: "var(--red, #dc2626)", fontSize: 14 }}>Failed to load feed</p>
      <button onClick={refresh} style={{ color: "var(--accent)", fontSize: 12, marginTop: 8, cursor: "pointer", background: "none", border: "none" }}>Retry</button>
    </div>
  );

  // On home page (no folder context): show folder grid + loading/empty/error below it.
  // Inside a folder: show loading/error as full-page (folder grid is hidden in folder view).
  const isHomePage = !activeFolderId && !folderContext;
  const cardArea = isLoading && displayNodes.length === 0
    ? loadingState
    : feedError && displayNodes.length === 0
    ? errorState
    : displayNodes.length === 0
    ? emptyState
    : null;

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
          folders={localFolders}
          currentFolderId={activeFolderId}
        />
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
      </>
    );
  }

  /* ── Free / canvas view ── */
  if (view === "free") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        {cardArea && isHomePage ? cardArea : displayNodes.length === 0 ? emptyState : (
          <FreeGrid nodes={displayNodes} scopeKey={scopeKey} onCardClick={handleOpen} currentUserId={currentUserId} activeFolderId={activeFolderId} onShare={handleShare} onMoveToFolder={handleMoveToFolder} onAddTag={handleAddTag} onDelete={handleDelete} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
      </div>
    );
  }

  /* ── Col view ── */
  if (view === "col") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        {cardArea && isHomePage ? cardArea : (
          <ColView items={feedItems} zoom={zoom} scopeKey={scopeKey} onItemClick={handleItemClick} currentUserId={currentUserId} onCardShare={handleShareItem} onCardMoveToFolder={handleMoveToFolderItem} onCardAddTag={handleAddTagItem} onCardDelete={handleDelete} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
      </div>
    );
  }

  /* ── Mason view ── */
  if (view === "mason") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        {cardArea && isHomePage ? cardArea : (
          <MasonView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} currentUserId={currentUserId} onCardShare={handleShareItem} onCardMoveToFolder={handleMoveToFolderItem} onCardAddTag={handleAddTagItem} onCardDelete={handleDelete} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
      </div>
    );
  }

  /* ── List view ── */
  if (view === "list") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        {cardArea && isHomePage ? cardArea : (
          <ListView items={feedItems} scopeKey={scopeKey} onItemClick={handleItemClick} currentUserId={currentUserId} onCardShare={handleShareItem} onCardMoveToFolder={handleMoveToFolderItem} onCardAddTag={handleAddTagItem} onCardDelete={handleDelete} />
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
      </div>
    );
  }

  /* ── Horiz view ── */
  if (view === "horiz") {
    return (
      <div style={{ minHeight: '100%', position: 'relative' }}>
        {folderGrid}
        {cardArea && isHomePage ? cardArea : (
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
        )}
        <CardDetailSheet node={activeNode} currentUserId={currentUserId} onClose={handleClose} />

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
      </div>
    );
  }

  /* ── Fallback masonry (legacy viewMode prop not passed) ── */
  return (
    <div style={{ minHeight: '100%', position: 'relative' }}>
      {folderGrid}
      {cardArea && isHomePage ? cardArea : displayNodes.length === 0 ? emptyState : (
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

      {/* Action modals */}
      {shareTarget && (
        <SharePickerModal
          isOpen={!!shareTarget}
          onClose={() => setShareTarget(null)}
          shareType={shareTarget.type}
          itemId={shareTarget.id}
          itemName={shareTarget.name}
          availableUsers={availableUsers}
          onShareComplete={() => { refresh(); }}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          nodeId={moveTarget.id}
          nodeName={moveTarget.name}
          folders={localFolders.filter(f => !f.deleted_at)}
          currentFolderId={activeFolderId}
          onMoved={() => { refresh(); }}
        />
      )}
      {tagTarget && (
        <AddTagModal
          isOpen={!!tagTarget}
          onClose={() => setTagTarget(null)}
          nodeId={tagTarget.id}
          nodeName={tagTarget.name}
          languageCode={languageCode}
          onTagAdded={() => { refresh(); }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          folderId={renameTarget.id}
          folderName={renameTarget.name}
          folderColor={renameTarget.color_hex}
          onRenamed={(newName, newColor) => {
            // Update local folders with new values from modal
            setLocalFolders(prev => prev.map(f =>
              f.id === renameTarget.id
                ? { ...f, name: newName, color_hex: newColor }
                : f
            ));
            refresh();
          }}
        />
      )}
    </div>
  );
}
