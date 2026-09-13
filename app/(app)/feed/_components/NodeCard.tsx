"use client";

/**
 * NodeCard — draggable/droppable/selection card (UIX-08 restyle:
 * PROTO V2 .video-card anatomy — 16:9 thumb-wrap + video-info).
 * Behavior preserved: drag source, node→node drop target, long-press
 * multi-select + wobble + (×) close, text-note variant, owner ⋯ menu
 * (Share / Move to folder / Add tag / Delete), direction dot.
 */

import { useCallback, useState, useEffect } from "react";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import Image from "next/image";
import type { FeedNode } from "@/lib/hooks/useFeed";
import { sourceId, targetId } from "@/lib/dnd/types";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { useSelectionStore } from "@/lib/store/selectionStore";
import { toast } from "@/lib/store/toastStore";
import SelectionCloseButton from "@/components/selection/SelectionCloseButton";
import { trashNode } from "@/app/lib/actions/selection";
import { getStorageUrl } from "@/lib/utils/avatar";

interface NodeCardProps {
  node: FeedNode;
  onClick: (node: FeedNode) => void;
  currentUserId: string;
  dragListeners?: DraggableSyntheticListeners;
  onShare?: (node: FeedNode) => void;
  onMoveToFolder?: (node: FeedNode) => void;
  onAddTag?: (node: FeedNode) => void;
  onDelete?: (nodeId: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const StarGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const ShareGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const EyeGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

export default function NodeCard({ node, onClick, currentUserId, dragListeners, onShare, onMoveToFolder, onAddTag, onDelete }: NodeCardProps) {
  const isTextCard = !node.url && !!node.text_content;
  const [menuOpen, setMenuOpen] = useState(false);

  // P9-T01: Direction badge — red for mine, blue for received (PRD §11.3)
  const isMine = node.direction === 'own' || node.direction === 'sent';
  const badgeColor = isMine ? 'var(--accent)' : 'var(--blue)';

  // Ownership check for menu button
  const isOwned = node.owner_id === currentUserId;

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

  const handleDelete = async () => {
    setMenuOpen(false);
    const res = await fetch(`/api/nodes/${node.node_id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onDelete?.(node.node_id);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error || 'Failed to delete card. Please try again.');
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

  const title = (() => {
    if (node.title) return node.title;
    if (isTextCard) return "Text note";
    if (node.url) {
      try { return new URL(node.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    }
    return "Untitled";
  })();

  const creator = (() => {
    if (node.sender_name) return node.sender_name;
    if (node.url) {
      try { return new URL(node.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    }
    if (isTextCard) return 'Text note';
    return '';
  })();

  const cardGradient = (() => {
    const hue = Math.abs(
      node.node_id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ) % 360;
    return `linear-gradient(135deg, hsl(${hue}, 35%, 28%), hsl(${(hue + 55) % 360}, 45%, 18%))`;
  })();

  const hasStats =
    (node.avg_rating != null && node.avg_rating > 0) ||
    (node.share_count != null && node.share_count > 0) ||
    (node.view_count != null && node.view_count > 0);

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
        width: '100%',
        textAlign: 'left',
        padding: 0,
        font: 'inherit',
        touchAction: "manipulation",
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
      className={`${isTextCard ? 'note-card' : 'video-card'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50${isSelected ? " liked-wobble" : ""}`}
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
          {/* 16:9 thumb area */}
          <div
            className="thumb-wrap"
            {...(dragListeners ?? {})}
          >
            {node.thumbnail_key ? (
              <Image
                src={getStorageUrl('thumbnails', node.thumbnail_key)}
                alt={title}
                fill
                sizes="(max-width: 700px) 50vw, 25vw"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                className="thumb"
                style={{
                  background: cardGradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  className="w-8 h-8"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
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

            {/* Menu button (top-right) - only show if owned */}
            {isOwned && (
              <span
                role="button"
                aria-label="Card menu"
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

            {/* Direction dot (top-left — clear of menu trigger) */}
            <span
              aria-label={isMine ? 'Mine' : 'Received'}
              title={isMine ? 'Mine' : 'Received'}
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: badgeColor,
                border: '2px solid rgba(255,255,255,0.5)',
                zIndex: 3,
              }}
            />
          </div>

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
                    onShare?.(node);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  Share with...
                </button>
                <button
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
                  onClick={() => {
                    setMenuOpen(false);
                    onMoveToFolder?.(node);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                  Move to folder
                </button>
                <button
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddTag?.(node);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                    <path d="M7 7h.01" />
                  </svg>
                  Add tag
                </button>
                <button
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500"
                  onClick={handleDelete}
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

          {/* Info block: title + creator + real stats + tags */}
          <div className="video-info">
            <div className="video-title">{title}</div>
            {creator && <div className="video-creator">{creator}</div>}
            {hasStats && (
              <div className="video-stats">
                {node.avg_rating != null && node.avg_rating > 0 && (
                  <span className="stat" style={{ color: 'var(--orange)' }}>
                    {StarGlyph}
                    {node.avg_rating}
                  </span>
                )}
                {node.share_count != null && node.share_count > 0 && (
                  <span className="stat">
                    {ShareGlyph}
                    {node.share_count}
                  </span>
                )}
                {node.view_count != null && node.view_count > 0 && (
                  <span className="stat">
                    {EyeGlyph}
                    {node.view_count}
                  </span>
                )}
              </div>
            )}
            {node.tags && node.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
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
                    }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </button>
    </div>
  );
}
