"use client";

/**
 * iOS-style (×) close icon overlaid on selected items (PRD §17.1, §17.3).
 *
 * Tap behaviour:
 * - When >1 item is selected → removes this single item from the selection.
 * - When exactly 1 item is selected → soft-deletes that item, seeds the
 *   pendingRestore for UndoToast, and exits selection mode.
 *
 * Consumer supplies an async `onTrash` that performs the soft delete.
 */

import { useMemo } from "react";
import { useSelectionStore, SelectionItem } from "@/lib/store/selectionStore";

interface SelectionCloseButtonProps {
  item: SelectionItem;
  label?: string;
  onTrash: (item: SelectionItem) => Promise<boolean>;
}

export default function SelectionCloseButton({
  item,
  label,
  onTrash,
}: SelectionCloseButtonProps) {
  const itemsCount = useSelectionStore((s) => s.items.length);
  const isSelected = useSelectionStore((s) => s.isSelected(item));
  const remove = useSelectionStore((s) => s.remove);
  const clear = useSelectionStore((s) => s.clear);
  const setPendingRestore = useSelectionStore((s) => s.setPendingRestore);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (itemsCount > 1) {
      remove(item);
      return;
    }
    // Single-item (×) tap → soft delete + Undo toast (§17.3).
    clear();
    const ok = await onTrash(item);
    if (ok) {
      setPendingRestore({ kind: item.kind, id: item.id, label, at: Date.now() });
    }
  };

  return (
    <button
      type="button"
      aria-label="Remove from selection"
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: -6,
        left: -6,
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "var(--surface-1, #111)",
        color: "#fff",
        border: "2px solid var(--surface-2, #fff)",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "var(--shadow-sm)",
        zIndex: 5,
        padding: 0,
      }}
    >
      ×
    </button>
  );
}
