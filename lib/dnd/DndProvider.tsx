'use client'

import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor } from "@dnd-kit/core";
import { useUIStore } from "@/lib/store/uiStore";
import { DragSource, DropTarget } from "./types";
import AutoCreatePrompt from "@/components/dnd/AutoCreatePrompt";

export default function DndProvider({ children }: { children: React.ReactNode }) {
  const clearDragState = useUIStore((s) => s.clearDragState);
  const setAutoCreatePrompt = useUIStore((s) => s.setAutoCreatePrompt);
  const autoCreatePrompt = useUIStore((s) => s.autoCreatePrompt);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement threshold per PRD §12.1
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 400,       // 400ms hold per PRD §12.1a
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drag state on every drop (success or failure)
    clearDragState();

    if (!over) return; // Drag cancelled

    const dragSource = active.data.current?.dragSource as DragSource | undefined;
    const dropTarget = over.data.current?.dropTarget as DropTarget | undefined;

    if (!dragSource || !dropTarget) return;

    // Route based on source type + target type combination
    try {
      // Node → Friend: direct share
      if (dragSource.kind === "node" && dropTarget.kind === "friend") {
        const { dndShareNodeToFriend } = await import("@/app/lib/actions/dnd");
        const result = await dndShareNodeToFriend(dragSource.nodeId, dropTarget.friendUserId);
        if (!result.ok) console.error("DnD share to friend failed:", result.error);
        return;
      }

      // Node → Group: group share
      if (dragSource.kind === "node" && dropTarget.kind === "group") {
        const { dndShareNodeToGroup } = await import("@/app/lib/actions/dnd");
        const result = await dndShareNodeToGroup(dragSource.nodeId, dropTarget.groupId);
        if (!result.ok) console.error("DnD share to group failed:", result.error);
        return;
      }

      // Node → Folder: add node to folder
      if (dragSource.kind === "node" && dropTarget.kind === "folder") {
        const { dndAddNodeToFolder } = await import("@/app/lib/actions/dnd");
        const result = await dndAddNodeToFolder(dragSource.nodeId, dropTarget.folderId);
        if (!result.ok) console.error("DnD add to folder failed:", result.error);
        return;
      }

      // Node → Tag: attach tag to node
      if (dragSource.kind === "node" && dropTarget.kind === "tag") {
        const { dndAttachTagToNode } = await import("@/app/lib/actions/dnd");
        const result = await dndAttachTagToNode(dragSource.nodeId, dropTarget.tagId);
        if (!result.ok) console.error("DnD attach tag failed:", result.error);
        return;
      }

      // Node → Trash: soft delete
      if (dragSource.kind === "node" && dropTarget.kind === "trash") {
        const { dndTrashNode } = await import("@/app/lib/actions/dnd");
        const result = await dndTrashNode(dragSource.nodeId);
        if (!result.ok) console.error("DnD trash failed:", result.error);
        return;
      }

      // Node → Node: card→card auto-create folder (P7-T02)
      if (dragSource.kind === "node" && dropTarget.kind === "node") {
        setAutoCreatePrompt({
          type: 'folder',
          pendingIds: [dragSource.nodeId, dropTarget.nodeId],
          position: null, // DndKit does not expose drop coordinates directly
        });
        return;
      }

      // Friend → Friend: auto-create group (P7-T02)
      if (dragSource.kind === "friend" && dropTarget.kind === "friend") {
        setAutoCreatePrompt({
          type: 'group',
          pendingIds: [dragSource.friendUserId, dropTarget.friendUserId],
          position: null,
        });
        return;
      }

      // Friend → Folder or Folder → Friend: share folder with friend
      if ((dragSource.kind === "friend" && dropTarget.kind === "folder") ||
          (dragSource.kind === "folder" && dropTarget.kind === "friend")) {
        const { dndShareFolderToFriend } = await import("@/app/lib/actions/dnd");
        const folderId = dragSource.kind === "folder" && dropTarget.kind === "friend"
          ? dragSource.folderId
          : dropTarget.kind === "folder"
          ? dropTarget.folderId
          : "";
        const friendUserId = dragSource.kind === "friend" && dropTarget.kind === "folder"
          ? dragSource.friendUserId
          : dropTarget.kind === "friend"
          ? dropTarget.friendUserId
          : "";
        const result = await dndShareFolderToFriend(folderId, friendUserId);
        if (!result.ok) console.error("DnD share folder to friend failed:", result.error);
        return;
      }

      // Unhandled combination
      console.log("Unhandled DnD combination:", dragSource.kind, "→", dropTarget.kind);
    } catch (e) {
      console.error("DnD handler error:", e);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
      {autoCreatePrompt && <AutoCreatePrompt />}
    </DndContext>
  );
}
