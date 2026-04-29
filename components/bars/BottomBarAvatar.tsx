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
import SelectionCloseButton from "@/components/selection/SelectionCloseButton";

export interface BottomBarAvatarItem {
  id: string;
  type: 'me' | 'friend' | 'group';
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
  memberCount?: number;
}

interface BottomBarAvatarProps {
  item: BottomBarAvatarItem;
  onClick: (id: string, type: "me" | "friend" | "group") => void;
}

export default function BottomBarAvatar({ item, onClick }: BottomBarAvatarProps) {
  // Disable DnD during SSR to prevent hydration mismatch
  const [isMounted, setIsMounted] = useState(false);

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
  const isSelected = useSelectionStore((s) => s.isSelected({ kind: selectionKind!, id: item.id }));
  const activate = useSelectionStore((s) => s.activate);
  const toggle = useSelectionStore((s) => s.toggle);

  const longPressRef = useLongPress(
    useCallback(() => {
      if (!selectionKind) return;
      activate({ kind: selectionKind, id: item.id });
    }, [activate, selectionKind, item.id]),
    { delayMs: 500, disabled: !selectionKind }
  );

  const {
    setNodeRef: setDropRef,
    isOver,
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

  const activeRing = isOver && dropTarget;

  const handleClick = () => {
    if (selectionActive && selectionKind) {
      toggle({ kind: selectionKind, id: item.id });
      return;
    }
    onClick(item.id, item.type);
  };

  return (
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
        }}
      >
        {item.initial}
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
  );
}
