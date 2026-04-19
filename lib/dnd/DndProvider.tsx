"use client";

/**
 * DndProvider — the single DndContext wrapper for the authenticated app.
 *
 * Responsibilities:
 *  - Mounts DndContext with sensors tuned for mouse + touch.
 *  - Routes onDragEnd events to the correct server action based on typed
 *    drag source + drop target metadata attached via DndKit `data`.
 *  - Exposes activeSource via context so bars can highlight themselves or
 *    show drop affordances.
 *  - Renders a lightweight DragOverlay for visual feedback.
 *
 * Drop-target UI (friend avatars, trash icon, folder chips, tag chips) use
 * `useDroppable` with `data: { dropTarget: DropTarget }`.
 * Drag-source UI (cards, tag chips on cards) use `useDraggable` with
 * `data: { dragSource: DragSource }`.
 */

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createContext, useCallback, useContext, useState } from "react";
import type { DragSource, DropTarget } from "./types";
import {
  dndShareNodeToFriend,
  dndShareNodeToGroup,
  dndAddNodeToFolder,
  dndAttachTagToNode,
  dndDetachTagFromNode,
  dndTrashNode,
  dndAutoCreateFolder,
  dndAutoCreateGroup,
  dndShareFolderToFriend,
  DndActionResult,
} from "@/app/lib/actions/dnd";
import NameInlinePrompt from "./NameInlinePrompt";

/** Pending name-prompt created by a card→card or friend→friend drop. */
type PendingPrompt =
  | { kind: "folder"; nodeIds: [string, string] }
  | { kind: "group"; memberIds: [string, string] };

interface DndStateContext {
  activeSource: DragSource | null;
}

const Ctx = createContext<DndStateContext>({ activeSource: null });

export function useDndState(): DndStateContext {
  return useContext(Ctx);
}

export interface DndProviderProps {
  children: React.ReactNode;
  /** Called with a short human-readable message on successful drops (for toasts). */
  onSuccess?: (message: string) => void;
  /** Called with the error message when a drop fails. */
  onError?: (message: string) => void;
}

export default function DndProvider({ children, onSuccess, onError }: DndProviderProps) {
  const [activeSource, setActiveSource] = useState<DragSource | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  // Mouse: 5px activation distance so cards remain clickable.
  // Touch: 250ms long-press + 5px tolerance so scrolling still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const src = event.active.data.current?.dragSource as DragSource | undefined;
    if (src) setActiveSource(src);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveSource(null);
      const src = event.active.data.current?.dragSource as DragSource | undefined;
      const tgt = event.over?.data.current?.dropTarget as DropTarget | undefined;
      if (!src || !tgt) return;

      let result: DndActionResult | null = null;
      let successMsg = "";

      if (src.kind === "node") {
        switch (tgt.kind) {
          case "friend":
            result = await dndShareNodeToFriend(src.nodeId, tgt.friendUserId);
            successMsg = "Shared";
            break;
          case "group":
            result = await dndShareNodeToGroup(src.nodeId, tgt.groupId);
            successMsg = "Shared to group";
            break;
          case "folder":
            result = await dndAddNodeToFolder(src.nodeId, tgt.folderId);
            successMsg = "Added to folder";
            break;
          case "tag":
            result = await dndAttachTagToNode(src.nodeId, tgt.tagId);
            successMsg = "Tag added";
            break;
          case "trash":
            result = await dndTrashNode(src.nodeId);
            successMsg = "Moved to trash";
            break;
          case "node":
            // Card → Card (P7-T02): trigger inline name prompt for folder.
            if (tgt.nodeId !== src.nodeId) {
              setPendingPrompt({
                kind: "folder",
                nodeIds: [src.nodeId, tgt.nodeId],
              });
            }
            return;
        }
      } else if (src.kind === "tag") {
        // Only meaningful action: drag tag chip off the node → remove it.
        // Dropping a tag-chip on anything other than its origin node = detach.
        if (tgt.kind !== "tag" || tgt.tagId !== src.tagId) {
          result = await dndDetachTagFromNode(src.nodeId, src.tagId);
          successMsg = "Tag removed";
        }
      } else if (src.kind === "friend") {
        if (tgt.kind === "friend" && tgt.friendUserId !== src.friendUserId) {
          // Friend → Friend (P7-T02): auto-create group prompt.
          setPendingPrompt({
            kind: "group",
            memberIds: [src.friendUserId, tgt.friendUserId],
          });
          return;
        }
        if (tgt.kind === "folder") {
          // Friend → Folder chip (P7-T02): share folder with friend.
          result = await dndShareFolderToFriend(tgt.folderId, src.friendUserId);
          successMsg = "Folder shared";
        }
      } else if (src.kind === "folder") {
        if (tgt.kind === "friend") {
          // Folder chip → Friend avatar (P7-T02): same share, opposite direction.
          result = await dndShareFolderToFriend(src.folderId, tgt.friendUserId);
          successMsg = "Folder shared";
        }
      }

      if (!result) return;
      if (result.ok) {
        onSuccess?.(successMsg);
      } else {
        onError?.(result.error);
      }
    },
    [onSuccess, onError]
  );

  const handleConfirmPrompt = useCallback(
    async (name: string) => {
      if (!pendingPrompt) return;
      let result: DndActionResult | null = null;
      let successMsg = "";
      if (pendingPrompt.kind === "folder") {
        result = await dndAutoCreateFolder(name, pendingPrompt.nodeIds);
        successMsg = "Folder created";
      } else if (pendingPrompt.kind === "group") {
        result = await dndAutoCreateGroup(name, pendingPrompt.memberIds);
        successMsg = "Group created";
      }
      setPendingPrompt(null);
      if (!result) return;
      if (result.ok) onSuccess?.(successMsg);
      else onError?.(result.error);
    },
    [pendingPrompt, onSuccess, onError]
  );

  return (
    <Ctx.Provider value={{ activeSource }}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveSource(null)}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeSource ? (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 14,
                background: "var(--surface-4, #2a2a2a)",
                border: "1px solid var(--accent, #f5a623)",
                boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
                opacity: 0.9,
                pointerEvents: "none",
              }}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      {pendingPrompt && (
        <NameInlinePrompt
          title={pendingPrompt.kind === "folder" ? "New Folder" : "New Group"}
          placeholder={
            pendingPrompt.kind === "folder" ? "Folder name" : "Group name"
          }
          confirmLabel="Create"
          onConfirm={handleConfirmPrompt}
          onCancel={() => setPendingPrompt(null)}
        />
      )}
    </Ctx.Provider>
  );
}
