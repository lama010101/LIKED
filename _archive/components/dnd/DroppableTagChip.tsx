'use client';

import { useDroppable } from "@dnd-kit/core";
import { useDndContext } from "@dnd-kit/core";
import { targetId } from "@/lib/dnd/types";

interface DroppableTagChipProps {
  tagId: string;
  children: React.ReactNode;
}

export default function DroppableTagChip({ tagId, children }: DroppableTagChipProps) {
  const { active } = useDndContext();
  const activeSource = active?.data.current?.dragSource;

  // Accept drops from 'node' only (adds tag to node)
  const isAcceptable = activeSource && activeSource.kind === 'node';

  const { setNodeRef, isOver } = useDroppable({
    id: targetId({ kind: 'tag', tagId }),
    disabled: !isAcceptable,
    data: { dropTarget: { kind: 'tag', tagId } },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'inline-block',
        transition: 'outline 0.15s ease, transform 0.15s ease',
        outline: isOver ? '2px solid var(--accent)' : undefined,
        outlineOffset: isOver ? 2 : undefined,
        transform: isOver ? 'scale(1.02)' : undefined,
      }}
    >
      {children}
    </div>
  );
}
