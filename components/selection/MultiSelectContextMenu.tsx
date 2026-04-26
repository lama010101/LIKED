"use client";

/**
 * Multi-select context action menu (PRD §17.2, P7-T03).
 *
 * Mobile: full-width bottom sheet anchored above BottomBar.
 * Desktop: side drawer anchored to the right edge.
 *
 * Action set is computed from the currently selected items' kinds; actions
 * that don't apply to the selection are hidden. Actions that require a
 * picker UI not yet built are shown but call `onStub` with the action id.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import {
  useSelectionStore,
  SelectionItem,
  SelectionKind,
} from "@/lib/store/selectionStore";

export type ContextActionId =
  | "edit"
  | "moveToFolder"
  | "addToFolder"
  | "addToGroup"
  | "shareWith"
  | "removeTag"
  | "giveAdmin"
  | "moveToTrash"
  | "removeFromFolder"
  | "cancel";

export interface MultiSelectContextMenuProps {
  /** true when viewport < lg (1024px) — renders as bottom sheet. */
  isMobile: boolean;
  /** Active folder context, if any — enables Remove-from-folder. */
  activeFolderId?: string | null;
  /** Invoked with an action id; "cancel" closes the menu. */
  onAction: (actionId: ContextActionId, items: SelectionItem[]) => void;
}

interface ActionSpec {
  id: ContextActionId;
  label: string;
  danger?: boolean;
  /** Predicate against current selection. */
  applies: (items: SelectionItem[], ctx: { activeFolderId: string | null }) => boolean;
}

function onlyKind(items: SelectionItem[], kind: SelectionKind): boolean {
  return items.length > 0 && items.every((i) => i.kind === kind);
}

const ACTIONS: ActionSpec[] = [
  { id: "edit", label: "Edit", applies: (i) => i.length === 1 },
  { id: "moveToFolder", label: "Move to folder…", applies: (i) => onlyKind(i, "node") },
  { id: "addToFolder", label: "Add to folder…", applies: (i) => onlyKind(i, "node") },
  {
    id: "addToGroup",
    label: "Add to group…",
    applies: (i) => i.every((x) => x.kind === "node" || x.kind === "friend"),
  },
  { id: "shareWith", label: "Share with…", applies: (i) => onlyKind(i, "node") },
  {
    id: "removeTag",
    label: "Remove tag",
    applies: (i) => i.every((x) => x.kind === "node" || x.kind === "folder"),
  },
  {
    id: "giveAdmin",
    label: "Give admin rights",
    applies: (i) => onlyKind(i, "friend"),
  },
  {
    id: "removeFromFolder",
    label: "Remove from folder",
    applies: (items, ctx) => !!ctx.activeFolderId && onlyKind(items, "node"),
  },
  {
    id: "moveToTrash",
    label: "Move to trash",
    danger: true,
    applies: (i) =>
      i.length > 0 &&
      i.every((x) => x.kind === "node" || x.kind === "folder" || x.kind === "group"),
  },
];

export default function MultiSelectContextMenu({
  isMobile,
  activeFolderId = null,
  onAction,
}: MultiSelectContextMenuProps) {
  const itemsCount = useSelectionStore((s) => s.items.length);
  const isActive = useSelectionStore((s) => s.isActive);
  const clear = useSelectionStore((s) => s.clear);
  // Get items via getState to avoid INVARIANT 1 violation (array selector)
  const items = useSelectionStore.getState().items;

  // Light slide-in animation: schedule a setState via rAF so we satisfy
  // the react-hooks/set-state-in-effect rule (no synchronous setState in
  // an effect body) while still getting the "0 → 1" transition on mount.
  const [mounted, setMounted] = useState(false);
  const prevActiveRef = useRef(isActive);
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (isActive && !prev) {
      const t = window.setTimeout(() => setMounted(true), 10);
      return () => window.clearTimeout(t);
    }
    if (!isActive && prev) {
      const r = window.requestAnimationFrame(() => setMounted(false));
      return () => window.cancelAnimationFrame(r);
    }
  }, [isActive]);

  if (!isActive || itemsCount === 0) return null;

  const ctx = useMemo(() => ({ activeFolderId }), [activeFolderId]);
  const applicable = ACTIONS.filter((a) => a.applies(items, ctx));

  const handleCancel = () => {
    onAction("cancel", items);
    clear();
  };

  const sheet = (
    <div
      style={{
        background: "var(--surface-2)",
        borderRadius: isMobile ? "16px 16px 0 0" : "12px 0 0 12px",
        boxShadow: "var(--shadow-lg)",
        border: "1px solid var(--border-1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-1)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
          {items.length} selected
        </div>
        <button
          type="button"
          onClick={handleCancel}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-2)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          Cancel
        </button>
      </div>

      {/* Action list */}
      <div
        role="menu"
        style={{
          display: "flex",
          flexDirection: "column",
          padding: 6,
          maxHeight: isMobile ? "50vh" : "70vh",
          overflowY: "auto",
        }}
      >
        {applicable.map((a) => (
          <button
            key={a.id}
            role="menuitem"
            type="button"
            onClick={() => onAction(a.id, items)}
            style={{
              textAlign: "left",
              fontSize: 13,
              fontWeight: 500,
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: a.danger ? "var(--red, #ff6b6b)" : "var(--text-1)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--surface-3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            {a.label}
          </button>
        ))}
        {applicable.length === 0 && (
          <div
            style={{
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text-3)",
            }}
          >
            No actions available for this selection.
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    // Bottom sheet — sits above BottomBar (~60px) and FAB (~42px). Tapping
    // the dim backdrop exits selection mode ("tap outside selection").
    return (
      <>
        <div
          onClick={handleCancel}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 55,
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.15s",
          }}
          aria-hidden="true"
        />
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 72,
            zIndex: 56,
            transform: mounted ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.2s ease-out",
            padding: "0 8px",
          }}
        >
          {sheet}
        </div>
      </>
    );
  }

  // Desktop side drawer — no backdrop per §17.2 spec (desktop = side drawer).
  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 16,
        width: 280,
        zIndex: 56,
        transform: mounted ? "translateX(0)" : "translateX(calc(100% + 16px))",
        transition: "transform 0.2s ease-out",
      }}
    >
      {sheet}
    </div>
  );
}
