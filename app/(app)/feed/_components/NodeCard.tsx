"use client";

import { useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { VisibleNode } from "@/lib/db/visibility";
import { sourceId, targetId } from "@/lib/dnd/types";
import { useDndState } from "@/lib/dnd/DndProvider";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useSelectionStore } from "@/lib/store/selectionStore";
import SelectionCloseButton from "@/components/selection/SelectionCloseButton";
import { trashNode } from "@/app/lib/actions/selection";

interface NodeCardProps {
  node: VisibleNode;
  onClick: (node: VisibleNode) => void;
  currentUserId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NodeCard({ node, onClick, currentUserId }: NodeCardProps) {
  const isTextCard = !node.url && !!node.text_content;

  // P9-T01: Direction badge — amber for mine, blue for received
  const isMine = node.origin_user_id === currentUserId;
  const badgeColor = isMine ? 'var(--accent, #f5a623)' : 'var(--color-received, #60c5f1)';

  // Multi-select (P7-T03)
  const selectionActive = useSelectionStore((s) => s.isActive);
  const isSelected = useSelectionStore((s) =>
    s.items.some((i) => i.kind === "node" && i.id === node.id)
  );
  const activate = useSelectionStore((s) => s.activate);
  const toggle = useSelectionStore((s) => s.toggle);

  const longPressRef = useLongPress(
    useCallback(() => {
      activate({ kind: "node", id: node.id });
    }, [activate, node.id]),
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
    id: sourceId({ kind: "node", nodeId: node.id }),
    data: { dragSource: { kind: "node", nodeId: node.id } },
    disabled: selectionActive,
  });

  // Drop target: P7-T02 card→card auto-create folder.
  const { activeSource } = useDndState();
  const isOtherNodeDragging =
    activeSource?.kind === "node" && activeSource.nodeId !== node.id;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: targetId({ kind: "node", nodeId: node.id }),
    disabled: !isOtherNodeDragging || selectionActive,
    data: { dropTarget: { kind: "node", nodeId: node.id } },
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
      toggle({ kind: "node", id: node.id });
      return;
    }
    onClick(node);
  };

  const title = node.title ?? (isTextCard ? "Text note" : "Untitled");

  return (
    <div style={{ position: "relative" }}>
      {isSelected && (
        <SelectionCloseButton
          item={{ kind: "node", id: node.id }}
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
            ? "3px solid var(--accent, #f5a623)"
            : "none",
        outlineOffset: isSelected || (isOver && isOtherNodeDragging) ? 2 : 0,
        transform:
          isOver && isOtherNodeDragging && !selectionActive ? "scale(1.02)" : undefined,
        transition: "transform 0.12s, outline-offset 0.12s",
      }}
      className={`w-full text-left bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-150 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer${isSelected ? " liked-wobble" : ""}`}
    >
      {/* Thumbnail area */}
      {!isTextCard && (
        <div className="w-full bg-gray-100 aspect-video flex items-center justify-center">
          {node.thumbnail_key ? (
            /* Real thumbnail would be resolved via storage URL — placeholder for now */
            <div className="w-full h-full bg-gray-200" />
          ) : (
            <div className="w-full h-full bg-[#EAE8E3] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-300"
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

      {/* Text card body (no image area) */}
      {isTextCard && (
        <div className="px-4 pt-4 pb-1 bg-[#F8F6F2]">
          <p className="text-sm text-gray-700 line-clamp-4 leading-relaxed">
            {node.text_content}
          </p>
        </div>
      )}

      {/* Card footer */}
      <div className="px-4 py-3 relative">
        <p className="text-sm font-medium text-gray-900 truncate leading-snug">
          {title}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDate(node.created_at)}
        </p>
        {/* P9-T01: Direction badge — bottom-right corner */}
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
    </button>
    </div>
  );
}
