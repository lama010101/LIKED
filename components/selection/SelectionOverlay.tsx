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
import { directShareAction, groupShareAction } from "@/app/lib/actions/sharing";
import { removeNodeFromFolderAction } from "@/app/lib/actions/removeNodeFromFolder";
import { removeTagFromNodeAction } from "@/app/lib/actions/cardDetail";
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
  const activeFilterFolderId = useFilterStore((s) => s.folderId);
  const activeTagIds = useFilterStore((s) => s.tagIds);

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

    // shareWith: share selected nodes with selected friends
    if (actionId === "shareWith") {
      const nodes = items.filter((i) => i.kind === "node");
      const friends = items.filter((i) => i.kind === "friend");
      if (nodes.length === 0 || friends.length === 0) {
        onToast?.("Select cards and friends to share", "err");
        clear();
        return;
      }
      clear();
      const nodeIds = nodes.map((n) => n.id);
      const friendIds = friends.map((f) => f.id);
      const results = await Promise.allSettled(
        nodeIds.flatMap((nid) =>
          friendIds.map((fid) =>
            directShareAction({ nodeId: nid, targetUserId: fid, permission: "view" })
          )
        )
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        onToast?.(`${results.length - failed} shares succeeded, ${failed} failed`, "err");
      } else {
        onToast?.(
          `Shared ${nodeIds.length} card(s) with ${friendIds.length} friend(s)`,
          "ok"
        );
      }
      return;
    }

    // addToGroup: share selected nodes to active group
    if (actionId === "addToGroup") {
      const nodeIds = items.filter((i) => i.kind === "node").map((i) => i.id);
      if (nodeIds.length === 0) {
        onToast?.("Select cards to add to group", "err");
        clear();
        return;
      }
      if (!activeGroupId) {
        onToast?.("Open a group first to add cards to it", "err");
        clear();
        return;
      }
      clear();
      const results = await Promise.allSettled(
        nodeIds.map((nid) => groupShareAction(nid, activeGroupId))
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        onToast?.(`${results.length - failed} added, ${failed} failed`, "err");
      } else {
        onToast?.(`Added ${nodeIds.length} card(s) to group`, "ok");
      }
      return;
    }

    // removeFromFolder: remove selected nodes from active folder
    if (actionId === "removeFromFolder") {
      const nodeIds = items.filter((i) => i.kind === "node").map((i) => i.id);
      const folderId = activeFolderId || activeFilterFolderId;
      if (nodeIds.length === 0) {
        onToast?.("Select cards to remove from folder", "err");
        clear();
        return;
      }
      if (!folderId) {
        onToast?.("Open a folder first to remove cards from it", "err");
        clear();
        return;
      }
      clear();
      const results = await Promise.allSettled(
        nodeIds.map((nid) =>
          removeNodeFromFolderAction({ nodeId: nid, folderId })
        )
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        onToast?.(`${results.length - failed} removed, ${failed} failed`, "err");
      } else {
        onToast?.(`Removed ${nodeIds.length} card(s) from folder`, "ok");
      }
      return;
    }

    // removeTag: remove active tag from selected nodes
    if (actionId === "removeTag") {
      const nodeIds = items.filter((i) => i.kind === "node").map((i) => i.id);
      if (nodeIds.length === 0) {
        onToast?.("Select cards to remove tag from", "err");
        clear();
        return;
      }
      if (activeTagIds.length === 0) {
        onToast?.("Select a tag filter first to remove it from cards", "err");
        clear();
        return;
      }
      clear();
      const tagId = activeTagIds[0];
      const results = await Promise.allSettled(
        nodeIds.map((nid) => removeTagFromNodeAction(nid, tagId))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        onToast?.(`${results.length - failed} tags removed, ${failed} failed`, "err");
      } else {
        onToast?.(`Removed tag from ${nodeIds.length} card(s)`, "ok");
      }
      return;
    }

    // moveToFolder / addToFolder / edit: need picker UI (folder picker, edit dialog)
    onToast?.(`"${labelForAction(actionId)}" requires a picker — coming soon`, "err");
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
