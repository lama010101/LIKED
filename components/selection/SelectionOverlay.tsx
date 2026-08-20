"use client";

/**
 * Root-level overlay that hosts the multi-select context menu and undo
 * toast, and manages global exit affordances (PRD §17.4):
 *   - Escape key (desktop) → clear selection
 *   - Cancel button in menu → clear selection (handled by menu)
 *   - Tap outside selection (mobile backdrop) → clear selection
 *
 * Also wires the `moveToTrash` action → batch soft-delete, and the single-
 * item Undo toast flow (single-(×) tap from a selected card exposes
 * `pendingRestore` via the store; this component renders the toast).
 */

import { useEffect } from "react";
import {
  useSelectionStore,
  SelectionItem,
  PendingRestore,
} from "@/lib/store/selectionStore";
import MultiSelectContextMenu, {
  ContextActionId,
} from "./MultiSelectContextMenu";
import UndoToast from "./UndoToast";
import { trashNodes, restoreTrashedNode } from "@/app/lib/actions/selection";
import { grantFolderAdminAction, grantGroupAdminAction } from "@/app/lib/actions/admin";
import { useFilterStore } from "@/lib/store/filterStore";

interface SelectionOverlayProps {
  isMobile: boolean;
  activeFolderId?: string | null;
  /** Surface user-facing messages (success / error). */
  onToast?: (msg: string, kind?: "ok" | "err") => void;
}

export default function SelectionOverlay({
  isMobile,
  activeFolderId = null,
  onToast,
}: SelectionOverlayProps) {
  const isActive = useSelectionStore((s) => s.isActive);
  const clear = useSelectionStore((s) => s.clear);
  const activeGroupId = useFilterStore((s) => s.groupId);

  // Escape → exit multi-select (§17.4).
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, clear]);

  const handleAction = async (actionId: ContextActionId, items: SelectionItem[]) => {
    if (actionId === "cancel") {
      clear();
      return;
    }

    if (actionId === "moveToTrash") {
      const nodeIds = items.filter((i) => i.kind === "node").map((i) => i.id);
      const nonNode = items.filter((i) => i.kind !== "node");
      if (nonNode.length > 0 && onToast) {
        onToast(
          `Trashing folders/groups is not yet wired (${nonNode.length} skipped)`,
          "err"
        );
      }
      clear();
      if (nodeIds.length === 0) return;
      const result = await trashNodes(nodeIds);
      if (result.ok) {
        onToast?.(
          nodeIds.length === 1
            ? "Moved to trash"
            : `${nodeIds.length} items moved to trash`,
          "ok"
        );
      } else {
        onToast?.(result.error, "err");
      }
      return;
    }

    // All other actions require picker UI not yet wired.
    if (actionId === "giveAdmin") {
      const friends = items.filter((i) => i.kind === "friend");
      if (friends.length === 0) {
        onToast?.("Select a friend to grant admin rights", "err");
        clear();
        return;
      }
      clear();
      const friendIds = friends.map((f) => f.id);
      if (activeFolderId) {
        // Grant folder admin to each selected friend
        const results = await Promise.all(
          friendIds.map((fid) => grantFolderAdminAction(activeFolderId, fid))
        );
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          onToast?.(failed[0].error, "err");
        } else {
          onToast?.(
            friendIds.length === 1
              ? "Admin rights granted"
              : `${friendIds.length} admins granted`,
            "ok"
          );
        }
      } else if (activeGroupId) {
        const results = await Promise.all(
          friendIds.map((fid) => grantGroupAdminAction(activeGroupId, fid))
        );
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          onToast?.(failed[0].error, "err");
        } else {
          onToast?.(
            friendIds.length === 1
              ? "Admin rights granted"
              : `${friendIds.length} admins granted`,
            "ok"
          );
        }
      } else {
        onToast?.("Select a folder or group first to grant admin rights", "err");
      }
      return;
    }

    onToast?.(`"${labelForAction(actionId)}" coming soon`, "err");
    clear();
  };

  const handleUndo = async (p: PendingRestore) => {
    if (p.kind !== "node") {
      onToast?.("Only cards can be restored right now", "err");
      return;
    }
    const result = await restoreTrashedNode(p.id);
    if (result.ok) onToast?.("Restored", "ok");
    else onToast?.(result.error, "err");
  };

  return (
    <>
      <MultiSelectContextMenu
        isMobile={isMobile}
        activeFolderId={activeFolderId}
        onAction={handleAction}
      />
      <UndoToast onUndo={handleUndo} />
    </>
  );
}

function labelForAction(a: ContextActionId): string {
  switch (a) {
    case "edit":
      return "Edit";
    case "moveToFolder":
      return "Move to folder";
    case "addToFolder":
      return "Add to folder";
    case "addToGroup":
      return "Add to group";
    case "shareWith":
      return "Share with";
    case "removeTag":
      return "Remove tag";
    case "giveAdmin":
      return "Give admin rights";
    case "removeFromFolder":
      return "Remove from folder";
    case "moveToTrash":
      return "Move to trash";
    case "cancel":
      return "Cancel";
  }
}
