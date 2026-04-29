"use client";

/**
 * Sortable masonry grid for the default feed view (P7-T02 card reorder).
 *
 * Wraps NodeCard rendering in a @dnd-kit/sortable SortableContext. On drop,
 * we arrayMove the ids, persist to feedStore (which also flips sort to
 * 'custom' + writes localStorage), and fire `dndReorderFeed` server action.
 *
 * Limitations (accepted for P7-T02):
 *  - Only used by the fallback masonry path in FeedGrid (the only view
 *    currently mapping over real VisibleNode[] ids).
 *  - Uses DndKit's sortable collision detection; a drop directly onto a
 *    neighbouring card still reorders rather than triggering card→card
 *    folder-create. Folder-create still fires for non-neighbouring drops
 *    and when sortable reorder is not active.
 */

import { useEffect, useMemo, useState } from "react";
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
import { useFeedStore } from "@/lib/store/feedStore";
import { dndReorderFeed } from "@/app/lib/actions/dnd";
import NodeCardInner from "./NodeCard";

interface SortableNodeGridProps {
  nodes: FeedNode[];
  scopeKey: string;
  onCardClick: (node: FeedNode) => void;
  currentUserId: string;
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
}: {
  node: FeedNode;
  onClick: (node: FeedNode) => void;
  currentUserId: string;
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
      <NodeCardInner node={node} onClick={onClick} currentUserId={currentUserId} dragListeners={listeners} />
    </div>
  );
}

export default function SortableNodeGrid({
  nodes,
  scopeKey,
  onCardClick,
  currentUserId,
}: SortableNodeGridProps) {
  const setCustomOrder = useFeedStore((s) => s.setCustomOrder);
  // Get customOrder via getState to avoid INVARIANT 1 violation (method selector)
  const storedOrder = useMemo(() => useFeedStore.getState().customOrders[scopeKey] ?? [], [scopeKey]);

  // Merge stored order (persisted) with incoming nodes:
  // 1) items that exist in both, in the stored order
  // 2) any new nodes (not yet ordered) appended at the end by created_at DESC
  const orderedIds = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.node_id, n]));
    const used = new Set<string>();
    const result: string[] = [];
    if (storedOrder) {
      for (const id of storedOrder) {
        if (byId.has(id)) {
          result.push(id);
          used.add(id);
        }
      }
    }
    for (const n of nodes) {
      if (!used.has(n.node_id)) result.push(n.node_id);
    }
    return result;
  }, [nodes, storedOrder]);

  // Local state lets the drop preview land before the store updates.
  const [ids, setIds] = useState<string[]>(orderedIds);
  useEffect(() => setIds(orderedIds), [orderedIds]);

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
    // Flip sort → 'custom', cache to localStorage, persist to server.
    setCustomOrder(scopeKey, next);
    await dndReorderFeed(scopeKey, next);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
          {ids.map((id) => {
            const node = nodeById.get(id);
            if (!node) return null;
            return <SortableCard key={id} node={node} onClick={onCardClick} currentUserId={currentUserId} />;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
