"use client";

/**
 * One avatar in the bottom friends/groups strip. Made droppable so nodes
 * can be dragged onto it (P7-T01): friend = direct share, group = group share.
 * Pure presentational — the parent BottomBar owns the list + layout.
 */

import { useCallback, useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { sourceId, targetId, DragSource, DropTarget } from "@/lib/dnd/types";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useSelectionStore, SelectionKind } from "@/lib/store/selectionStore";
import { toast } from "@/lib/store/toastStore";

export interface BottomBarAvatarItem {
  id: string;
  type: 'me' | 'friend' | 'group';
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
  memberCount?: number;
  is_pending?: boolean;
  user_id?: string;
  currentUserId?: string;
  onRefresh?: () => void;
}

interface BottomBarAvatarProps {
  item: BottomBarAvatarItem;
  onClick: (id: string, type: "me" | "friend" | "group") => void;
  currentUserId?: string;
  onRefresh?: () => void;
}

export default function BottomBarAvatar({ item, onClick, currentUserId, onRefresh }: BottomBarAvatarProps) {
  // Disable DnD during SSR to prevent hydration mismatch
  const [isMounted, setIsMounted] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // `me` avatar isn't a share target. Everything else accepts drops.
  const dropTarget: DropTarget | null =
    item.type === "friend"
      ? { kind: "friend", friendUserId: item.id }
      : item.type === "group"
        ? { kind: "group", groupId: item.id }
        : null;

  // Only friends are draggable (P7-T02 friend→friend / friend→folder).
  const dragSource: DragSource | null =
    item.type === "friend" ? { kind: "friend", friendUserId: item.id } : null;

  // Multi-select (P7-T03). `me` is not selectable; friends + groups are.
  const selectionKind: SelectionKind | null =
    item.type === "friend" ? "friend" : item.type === "group" ? "group" : null;
  const selectionActive = useSelectionStore((s) => s.isActive);
  const toggle = useSelectionStore((s) => s.toggle);

  const longPressRef = useLongPress(
    useCallback(() => {
      // Only show popover for friends, not for groups or me
      if (item.type !== 'friend' || item.is_pending) return;
      setPopoverOpen(true);
    }, [item.type, item.is_pending]),
    { delayMs: 500, disabled: item.type !== 'friend' || item.is_pending }
  );

  const {
    setNodeRef: setDropRef,
  } = useDroppable({
    id: dropTarget ? targetId(dropTarget) : `me:${item.id}`,
    disabled: !dropTarget || selectionActive || !isMounted,
    data: dropTarget ? { dropTarget } : undefined,
  });

  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: dragSource ? sourceId(dragSource) : `me-src:${item.id}`,
    disabled: !dragSource || selectionActive || !isMounted,
    data: dragSource ? { dragSource } : undefined,
  });

  const setRef = (el: HTMLDivElement | null) => {
    setDropRef(el);
    setDragRef(el);
    longPressRef(el);
  };

  const handleClick = () => {
    // Pending invites are not tappable
    if (item.is_pending) return;
    
    if (selectionActive && selectionKind) {
      toggle({ kind: selectionKind, id: item.id });
      return;
    }
    onClick(item.id, item.type);
  };

  const handleViewFeed = () => {
    setPopoverOpen(false);
    onClick(item.id, item.type);
  };

  const handleRemoveFriend = async () => {
    setPopoverOpen(false);
    if (!currentUserId || !item.user_id) return;
    try {
      const { removeFriendAction } = await import('@/app/lib/actions/friends');
      await removeFriendAction(item.user_id);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[handleRemoveFriend]', err);
      toast.error('Failed to remove friend. Please try again.');
    }
  };

  const handleBlock = async () => {
    setPopoverOpen(false);
    if (!currentUserId || !item.user_id) return;
    const confirmed = window.confirm(`Block ${item.displayName}? They will be removed from your friends and will no longer be able to share content with you.`);
    if (!confirmed) return;
    try {
      const { blockUserAction } = await import('@/app/lib/actions/friends');
      await blockUserAction(item.user_id);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[handleBlock]', err);
      toast.error('Failed to block user. Please try again.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setPopoverOpen(false);
    }
  };

  useEffect(() => {
    if (popoverOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setPopoverOpen(false);
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [popoverOpen]);

  return (
    <>
    <div
      ref={setRef}
      {...(dragSource && !selectionActive && isMounted ? attributes : {})}
      {...(dragSource && !selectionActive && isMounted ? listeners : {})}
      onClick={handleClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "0 7px",
        cursor: dragSource && !selectionActive ? "grab" : "pointer",
        flexShrink: 0,
        userSelect: 'none',
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.1s',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: item.type === 'group' ? 10 : '50%',
          background: item.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
          position: 'relative',
          opacity: item.is_pending ? 0.5 : 1,
        }}
        title={item.is_pending ? 'Invite sent — awaiting signup' : undefined}
      >
        {item.initial}
        {item.is_pending && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        )}
        {item.type === 'group' && item.memberCount !== undefined && (
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--text-2)',
              padding: '0 4px',
            }}
          >
            {item.memberCount}
          </div>
        )}
        {item.type === "me" && (
          <span
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "1.5px solid var(--surface-2)",
            }}
          />
        )}
      </div>
      <span
        style={{
          fontSize: 8,
          color: "var(--text-2)",
          whiteSpace: "nowrap",
          maxWidth: 44,
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "center",
        }}
      >
        {item.displayName}
      </span>
    </div>

    {popoverOpen && item.type === 'friend' && !item.is_pending && (
      <>
        {/* Full-screen overlay */}
        <div
          className="fixed inset-0 z-40"
          onClick={() => setPopoverOpen(false)}
        />
        {/* Popover card */}
        <div
          className="fixed z-50 bg-gray-900 rounded-xl shadow-xl p-2 min-w-[160px]"
          style={{
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
          }}
          onKeyDown={handleKeyDown}
        >
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-white hover:bg-gray-800"
            onClick={handleViewFeed}
          >
            View {item.displayName}&apos;s feed
          </button>
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-gray-800"
            onClick={handleRemoveFriend}
          >
            Remove friend
          </button>
          <button
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 font-semibold hover:bg-gray-800"
            onClick={handleBlock}
          >
            Block {item.displayName}
          </button>
        </div>
      </>
    )}
  </>
  );
}
