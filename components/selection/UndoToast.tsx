"use client";

/**
 * Undo toast (PRD §17.3, P7-T03). Shows a 5-second window after a
 * single-(×) soft delete. Clicking Undo invokes `onUndo`; on timeout the
 * toast auto-dismisses.
 *
 * Reads `pendingRestore` from the selection store. Parent wiring calls
 * `setPendingRestore({...})` after a soft delete and provides `onUndo` to
 * actually call the restore server action.
 */

import { useEffect, useState } from "react";
import { useSelectionStore, PendingRestore } from "@/lib/store/selectionStore";

interface UndoToastProps {
  onUndo: (p: PendingRestore) => void;
  durationMs?: number;
}

export default function UndoToast({ onUndo, durationMs = 5000 }: UndoToastProps) {
  const pending = useSelectionStore((s) => s.pendingRestore);
  const setPending = useSelectionStore((s) => s.setPendingRestore);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 1 - elapsed / durationMs);
      setProgress(remaining);
      if (remaining > 0) raf = window.requestAnimationFrame(tick);
      else setPending(null);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [pending, durationMs, setPending]);

  if (!pending) return null;

  const label = pending.label ?? humanLabel(pending.kind);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--surface-4)",
        color: "var(--text-1)",
        padding: "10px 14px 10px 16px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 500,
        boxShadow: "var(--shadow-md)",
        zIndex: 70,
        overflow: "hidden",
      }}
    >
      <span>Moved &ldquo;{label}&rdquo; to trash</span>
      <button
        type="button"
        onClick={() => {
          onUndo(pending);
          setPending(null);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--accent)",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          padding: "2px 4px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Undo
      </button>
      {/* progress bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 2,
          width: `${Math.round(progress * 100)}%`,
          background: "var(--accent)",
          transition: "width 0.08s linear",
        }}
      />
    </div>
  );
}

function humanLabel(kind: PendingRestore["kind"]): string {
  switch (kind) {
    case "node":
      return "Card";
    case "folder":
      return "Folder";
    case "friend":
      return "Friend";
    case "group":
      return "Group";
  }
}
