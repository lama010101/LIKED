'use client';

import { useDroppable } from "@dnd-kit/core";
import { useDndContext } from "@dnd-kit/core";
import { targetId } from "@/lib/dnd/types";

interface DroppableFolderChipProps {
  folderId: string;
  children: React.ReactNode;
  /** All folders — used for ancestry cycle prevention (P3-6). */
  folders?: Array<{ id: string; parent_folder_id: string | null }>;
}

/**
 * Returns true if `targetId` is a descendant of `sourceId` (or equal).
 * Walks the parent chain using the folders array.
 */
function isDescendant(
  sourceId: string,
  targetId: string,
  folders: Array<{ id: string; parent_folder_id: string | null }>
): boolean {
  let current: string | null = targetId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (current === sourceId) return true;
    visited.add(current);
    const folder = folders.find((f) => f.id === current);
    current = folder?.parent_folder_id ?? null;
  }
  return false;
}

export default function DroppableFolderChip({ folderId, children, folders = [] }: DroppableFolderChipProps) {
  const { active } = useDndContext();
  const activeSource = active?.data.current?.dragSource;

  // Accept drops from:
  // - 'node' (adds node to folder)
  // - 'friend' (shares folder with friend)
  // - 'folder' (nests dragged folder inside this one)
  // Prevent self-drop and ancestor/descendant cycles (P3-6).
  const isSelfDrop =
    activeSource?.kind === 'folder' && activeSource.folderId === folderId;
  const isCycle =
    activeSource?.kind === 'folder' &&
    !isSelfDrop &&
    folders.length > 0 &&
    isDescendant(activeSource.folderId, folderId, folders);
  const isAcceptable = activeSource &&
    !isSelfDrop &&
    !isCycle &&
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
