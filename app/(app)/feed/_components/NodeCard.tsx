"use client";

import { useCallback } from "react";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import type { FeedNode } from "@/lib/hooks/useFeed";
import { sourceId, targetId } from "@/lib/dnd/types";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useSelectionStore } from "@/lib/store/selectionStore";
import SelectionCloseButton from "@/components/selection/SelectionCloseButton";
import { trashNode } from "@/app/lib/actions/selection";

interface NodeCardProps {
  node: FeedNode;
  onClick: (node: FeedNode) => void;
  currentUserId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NodeCard({ node, onClick, currentUserId }: NodeCardProps) {
  const isTextCard = !node.url && !!node.text_content;

  // P9-T01: Direction badge — amber for mine, blue for received (PRD §11.3)
  const isMine = node.direction === 'own' || node.direction === 'sent';
  const badgeColor = isMine ? 'var(--accent)' : 'var(--tab-received)';

  // Multi-select (P7-T03)
  const selectionActive = useSelectionStore((s) => s.isActive);
  const isSelected = useSelectionStore((s) => s.isSelected({ kind: "node", id: node.node_id }));
  const activate = useSelectionStore((s) => s.activate);
  const toggle = useSelectionStore((s) => s.toggle);

  const longPressRef = useLongPress(
    useCallback(() => {
      activate({ kind: "node", id: node.node_id });
    }, [activate, node.node_id]),
    { delayMs: 500 }
  );

  // Drag source: P7-T01. Disabled while selection mode is active so
  // long-press doesn't race with dnd-kit's 5px drag activation.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: sourceId({ kind: "node", nodeId: node.node_id }),
    data: { dragSource: { kind: "node", nodeId: node.node_id } },
    disabled: selectionActive,
  });

  // Drop target: P7-T02 card→card auto-create folder.
  const { active } = useDndContext();
  const activeSource = active?.data?.current?.dragSource;
  const isOtherNodeDragging =
    activeSource?.kind === "node" && activeSource.nodeId !== node.node_id;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: targetId({ kind: "node", nodeId: node.node_id }),
    disabled: !isOtherNodeDragging || selectionActive,
    data: { dropTarget: { kind: "node", nodeId: node.node_id } },
  });

  const setRef = (el: HTMLButtonElement | null) => {
    setDragRef(el);
    setDropRef(el);
    longPressRef(el);
  };

  const handleClick = () => {
    // While in selection mode, tap toggles this card in/out of the
    // selection set (PRD §17.1).
    if (selectionActive) {
      toggle({ kind: "node", id: node.node_id });
      return;
    }
    onClick(node);
  };

  const title = node.title ?? (isTextCard ? "Text note" : "Untitled");

  return (
    <div style={{ position: "relative" }}>
      {isSelected && (
        <SelectionCloseButton
          item={{ kind: "node", id: node.node_id }}
          label={title}
          onTrash={async (i) => {
            const result = await trashNode(i.id);
            return result.ok;
          }}
        />
      )}
    <button
      ref={setRef}
      type="button"
      onClick={handleClick}
      {...(selectionActive ? {} : attributes)}
      {...(selectionActive ? {} : listeners)}
      style={{
        opacity: isDragging ? 0.4 : 1,
        touchAction: "manipulation",
        outline:
          isSelected || (isOver && isOtherNodeDragging)
            ? "3px solid var(--accent)"
            : "none",
        outlineOffset: isSelected || (isOver && isOtherNodeDragging) ? 2 : 0,
        transform:
          isOver && isOtherNodeDragging && !selectionActive ? "scale(1.02)" : undefined,
        transition: "transform 0.12s, outline-offset 0.12s, box-shadow 0.15s",
      }}
      className={`w-full text-left overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer${isSelected ? " liked-wobble" : ""}${isTextCard ? " note-card" : " rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-px active:scale-[0.97] active:shadow-none transition-all duration-150"}`}
    >
      {/* Thumbnail area */}
      {!isTextCard && (
        <div
          className="w-full flex items-center justify-center"
          style={{
            aspectRatio: '16 / 10',
            background: 'var(--surface-3)',
          }}
        >
          {node.thumbnail_key ? (
            /* Real thumbnail would be resolved via storage URL — placeholder for now */
            <div className="w-full h-full" style={{ background: 'var(--surface-4)' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface-3)' }}>
              <svg
                className="w-8 h-8"
                style={{ color: 'var(--text-3)' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 19.5h18a.75.75 0 0 0 .75-.75v-15A.75.75 0 0 0 21 3H3a.75.75 0 0 0-.75.75v15c0 .414.336.75.75.75Z"
                />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Text card — sticky-note style (mockup) */}
      {isTextCard ? (
        <>
          <div className="note-card__corner" />
          <p className="note-card__text">
            {node.text_content}
          </p>
          <span className="note-card__meta">
            {formatDate(node.created_at)}
          </span>
        </>
      ) : (
        <>
          {/* Card footer for non-text cards */}
          <div className="px-4 py-3 relative">
            <p className="text-sm font-medium truncate leading-snug" style={{ color: 'var(--text-1)' }}>
              {title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {formatDate(node.created_at)}
            </p>
            {/* Direction badge — bottom-right corner */}
            <span
              aria-label={isMine ? 'Mine' : 'Received'}
              title={isMine ? 'Mine' : 'Received'}
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: badgeColor,
                border: '1.5px solid rgba(0,0,0,0.2)',
              }}
            />
          </div>
        </>
      )}
    </button>
    </div>
  );
}
