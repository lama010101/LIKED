'use client';

import { useDroppable } from "@dnd-kit/core";
import { useDndContext } from "@dnd-kit/core";
import { targetId } from "@/lib/dnd/types";

interface DroppableFolderChipProps {
  folderId: string;
  children: React.ReactNode;
}

export default function DroppableFolderChip({ folderId, children }: DroppableFolderChipProps) {
  const { active } = useDndContext();
  const activeSource = active?.data.current?.dragSource;

  // Accept drops from:
  // - 'node' (adds node to folder)
  // - 'friend' (shares folder with friend)
  // - 'folder' (nests dragged folder inside this one)
  // Prevent self-drop (a folder cannot be dropped onto itself).
  const isSelfDrop =
    activeSource?.kind === 'folder' && activeSource.folderId === folderId;
  const isAcceptable = activeSource &&
    !isSelfDrop &&
    (activeSource.kind === 'node' ||
     activeSource.kind === 'friend' ||
     activeSource.kind === 'folder');

  const { setNodeRef, isOver } = useDroppable({
    id: targetId({ kind: 'folder', folderId }),
    disabled: !isAcceptable,
    data: { dropTarget: { kind: 'folder', folderId } },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'inline-block',
        transition: 'outline 0.15s ease, transform 0.15s ease',
        outline: isOver ? '2px solid var(--accent)' : undefined,
        outlineOffset: isOver ? 2 : undefined,
        transform: isOver ? 'scale(1.05)' : undefined,
      }}
    >
      {children}
    </div>
  );
}
