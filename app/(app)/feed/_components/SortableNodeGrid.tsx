"use client";

/**
 * Sortable masonry grid for the default feed view (P7-T02 card reorder).
 *
 * Wraps NodeCard rendering in a @dnd-kit/sortable SortableContext. On drop,
 * we arrayMove the ids for the drag preview, flip sort to 'custom', and
 * persist via `dndReorderFeed` server action (user_node_preferences — the
 * single source of truth). Display order always comes from get_feed via
 * the `nodes` prop; no local-store reordering (AUDIT-06 P2-1).
 *
 * Limitations (accepted for P7-T02):
 *  - Only used by the fallback masonry path in FeedGrid (the only view
 *    currently mapping over real VisibleNode[] ids).
 *  - Uses DndKit's sortable collision detection; a drop directly onto a
 *    neighbouring card still reorders rather than triggering card→card
 *    folder-create. Folder-create still fires for non-neighbouring drops
 *    and when sortable reorder is not active.
 */

import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FeedNode } from "@/lib/hooks/useFeed";
import { useFilterStore } from "@/lib/store/filterStore";
import { dndReorderFeed } from "@/app/lib/actions/dnd";
import NodeCardInner from "./NodeCard";
import type { Folder } from "@/lib/types/app";

interface SortableNodeGridProps {
  nodes: FeedNode[];
  scopeKey: string;
  onCardClick: (node: FeedNode) => void;
  currentUserId: string;
  folders?: Folder[];
  sourceFolderId?: string | null;
  onChanged?: () => void;
  onShare?: (node: FeedNode) => void;
  onMoveToFolder?: (node: FeedNode) => void;
  onAddTag?: (node: FeedNode) => void;
  onDelete?: (nodeId: string) => void;
}

/**
 * The sortable wrapper uses its own nested DndContext so reorder-drag events
 * stay isolated from the parent DnD (which handles share/folder/tag drops).
 * A card is EITHER a sortable handle (inside this grid, reorder mode) OR a
 * normal draggable (outside this grid). Here we use `useSortable` directly.
 */
function SortableCard({
  node,
  onClick,
  currentUserId,
  folders,
  sourceFolderId,
  onChanged,
  onShare,
  onMoveToFolder,
  onAddTag,
  onDelete,
}: {
  node: FeedNode;
  onClick: (node: FeedNode) => void;
  currentUserId: string;
  folders?: Folder[];
  sourceFolderId?: string | null;
  onChanged?: () => void;
  onShare?: (node: FeedNode) => void;
  onMoveToFolder?: (node: FeedNode) => void;
  onAddTag?: (node: FeedNode) => void;
  onDelete?: (nodeId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.node_id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="break-inside-avoid mb-4"
    >
      <NodeCardInner node={node} onClick={onClick} currentUserId={currentUserId} dragListeners={listeners} folders={folders} sourceFolderId={sourceFolderId} onChanged={onChanged} onShare={onShare} onMoveToFolder={onMoveToFolder} onAddTag={onAddTag} onDelete={onDelete} />
    </div>
  );
}

export default function SortableNodeGrid({
  nodes,
  scopeKey,
  onCardClick,
  currentUserId,
  folders,
  sourceFolderId,
  onChanged,
  onShare,
  onMoveToFolder,
  onAddTag,
  onDelete,
}: SortableNodeGridProps) {
  const setSort = useFilterStore((s) => s.setSort);

  // Display order = SQL order (get_feed output via `nodes` prop). Local
  // `ids` state exists only for the transient drop preview; it re-syncs to
  // SQL order whenever `nodes` changes (AUDIT-06 P2-1 — no local reorder).
  const orderedIds = useMemo(() => nodes.map((n) => n.node_id), [nodes]);
  const [ids, setIds] = useState<string[]>(orderedIds);
  // Reset drop-preview ids when the SQL-ordered input changes — "adjust
  // state during render" pattern (setState in an effect is disallowed).
  const [lastOrdered, setLastOrdered] = useState(orderedIds);
  if (lastOrdered !== orderedIds) {
    setLastOrdered(orderedIds);
    setIds(orderedIds);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  );

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.node_id, n])),
    [nodes]
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setIds(next);
    // Flip sort → 'custom' and persist to DB (user_node_preferences).
    // The refreshed feed then returns rows in this order via get_feed.
    setSort('custom');
    await dndReorderFeed(scopeKey, next);
    onChanged?.();
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
          {ids.map((id) => {
            const node = nodeById.get(id);
            if (!node) return null;
            return <SortableCard key={id} node={node} onClick={onCardClick} currentUserId={currentUserId} folders={folders} sourceFolderId={sourceFolderId} onChanged={onChanged} onShare={onShare} onMoveToFolder={onMoveToFolder} onAddTag={onAddTag} onDelete={onDelete} />;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
