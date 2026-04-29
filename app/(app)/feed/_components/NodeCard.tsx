"use client";

import { useCallback } from "react";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import type { FeedNode } from "@/lib/hooks/useFeed";
import { sourceId, targetId } from "@/lib/dnd/types";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useSelectionStore } from "@/lib/store/selectionStore";
import SelectionCloseButton from "@/components/selection/SelectionCloseButton";
import { trashNode } from "@/app/lib/actions/selection";
import { getStorageUrl } from "@/lib/utils/avatar";

interface NodeCardProps {
  node: FeedNode;
  onClick: (node: FeedNode) => void;
  currentUserId: string;
  dragListeners?: Record<string, any>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NodeCard({ node, onClick, currentUserId, dragListeners }: NodeCardProps) {
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

  const cardGradient = (() => {
    const hue = Math.abs(
      node.node_id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ) % 360;
    return `linear-gradient(135deg, hsl(${hue}, 35%, 28%), hsl(${(hue + 55) % 360}, 45%, 18%))`;
  })();

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
        aspectRatio: '1 / 1',
        position: 'relative',
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
      {isTextCard ? (
        /* Text card — sticky-note style */
        <>
          <div className="note-card__corner" />
          <p className="note-card__text" {...(dragListeners ?? {})}>
            {node.text_content}
          </p>
          <span className="note-card__meta">
            {formatDate(node.created_at)}
          </span>
        </>
      ) : (
        <>
          {/* Full-bleed thumbnail */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: node.thumbnail_key ? 'var(--surface-3)' : cardGradient }}
            {...(dragListeners ?? {})}
          >
            {node.thumbnail_key ? (
              <img
                src={getStorageUrl('thumbnails', node.thumbnail_key)}
                alt={title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
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
            )}
          </div>

          {/* Bottom gradient overlay with title + tags */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: 8,
              background:
                'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
              zIndex: 2,
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-sm, 12px)',
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginBottom: 3,
              }}
            >
              {title}
            </div>
            {node.tags && node.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {node.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.tag_id}
                    style={{
                      fontSize: 9,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      background: tag.color_hex,
                      color: '#fff',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Menu button (top-right) */}
          <span
            role="button"
            aria-label="Card menu"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: open card menu (P9)
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

          {/* Direction dot (bottom-right) */}
          <span
            aria-label={isMine ? 'Mine' : 'Received'}
            title={isMine ? 'Mine' : 'Received'}
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: badgeColor,
              border: '2px solid rgba(255,255,255,0.5)',
              zIndex: 3,
            }}
          />
        </>
      )}
    </button>
    </div>
  );
}
