"use client";

/**
 * Client-side Trash view (P7-T04, PRD §20.1–20.2).
 *
 * - Lists the user's soft-deleted nodes (thumbnail, name, date trashed).
 * - Per-item actions: Restore / Delete permanently.
 * - Permanent delete is gated behind a confirmation dialog (§20.2).
 *
 * Server action list is fetched on mount so the view self-refreshes after
 * a restore/delete without needing an RSC round-trip reshape.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TrashedNode } from "@/lib/db/nodes";
import {
  listTrashedNodes,
  restoreFromTrash,
  permanentlyDeleteFromTrash,
} from "@/app/lib/actions/trash";
import { toast as showToast } from "@/lib/store/toastStore";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function itemTitle(n: TrashedNode): string {
  if (n.title) return n.title;
  if (n.url) return n.url;
  if (n.text_content) return n.text_content.slice(0, 80);
  return "Untitled";
}

export default function TrashView() {
  const router = useRouter();
  const [items, setItems] = useState<TrashedNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const result = await listTrashedNodes();
    if (result.ok) {
      setItems(result.items);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    // Defer to a microtask so setState inside `refresh` is not called
    // synchronously during the effect body (satisfies the
    // react-hooks/set-state-in-effect rule). The async fetch inside
    // already awaits before any setState, so this is purely for static
    // analysis compliance.
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const handleRestore = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await restoreFromTrash(id);
      setBusyId(null);
      if (result.ok) {
        setItems((prev) => prev?.filter((n) => n.id !== id) ?? null);
        showToast.success("Restored");
      } else {
        showToast.error(result.error);
      }
    });
  };

  const handlePermanentDelete = (id: string) => {
    setBusyId(id);
    setConfirmId(null);
    startTransition(async () => {
      const result = await permanentlyDeleteFromTrash(id);
      setBusyId(null);
      if (result.ok) {
        setItems((prev) => prev?.filter((n) => n.id !== id) ?? null);
        showToast.success("Deleted permanently");
      } else {
        showToast.error(result.error);
      }
    });
  };

  if (items === null && !error) {
    return (
      <div style={{ padding: "16px 14px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--surface-3)", animation: "trash-skeleton 1.5s ease-in-out infinite" }} />
          <div style={{ height: 22, width: 80, borderRadius: 6, background: "var(--surface-3)", animation: "trash-skeleton 1.5s ease-in-out infinite" }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{
            display: "flex",
            gap: 12,
            padding: 14,
            background: "var(--surface-2)",
            borderRadius: 12,
            border: "1px solid var(--border-1)",
            marginBottom: 8,
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--surface-3)", animation: "trash-skeleton 1.5s ease-in-out infinite" }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, borderRadius: 4, background: "var(--surface-3)", marginBottom: 8, width: "60%", animation: "trash-skeleton 1.5s ease-in-out infinite" }} />
              <div style={{ height: 12, borderRadius: 4, background: "var(--surface-3)", width: "30%", animation: "trash-skeleton 1.5s ease-in-out infinite" }} />
            </div>
          </div>
        ))}
        <style>{`
          @keyframes trash-skeleton {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--red, #ff6b6b)", fontSize: 13 }}>
        Failed to load trash: {error}
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 14px 40px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Close button — returns to previous page */}
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close trash and return to previous page"
            className="toolbar-btn"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "var(--surface-3)",
              border: "1px solid var(--border-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-2)",
              padding: 0,
              transition: "background 0.15s ease, transform 0.1s ease",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <h1
            className="font-serif"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-1)",
            }}
          >
            Trash
          </h1>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          {items!.length} item{items!.length === 1 ? "" : "s"}
        </div>
      </div>

      {items!.length === 0 ? (
        <div
          style={{
            padding: "60px 16px",
            textAlign: "center",
            background: "var(--surface-2)",
            border: "1px solid var(--border-1)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#128681;</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 }}>
            Your trash is empty
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            Deleted cards will appear here for recovery.
          </div>
        </div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8, padding: 0, margin: 0, listStyle: "none" }}>
          {items!.map((n) => (
            <TrashRow
              key={n.id}
              node={n}
              isBusy={busyId === n.id}
              isConfirming={confirmId === n.id}
              onRestore={() => handleRestore(n.id)}
              onRequestDelete={() => setConfirmId(n.id)}
              onConfirmDelete={() => handlePermanentDelete(n.id)}
              onCancelDelete={() => setConfirmId(null)}
            />
          ))}
        </ul>
      )}

    </div>
  );
}

interface TrashRowProps {
  node: TrashedNode;
  isBusy: boolean;
  isConfirming: boolean;
  onRestore: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function TrashRow({
  node,
  isBusy,
  isConfirming,
  onRestore,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: TrashRowProps) {
  const isText = !node.url && !!node.text_content;
  const title = itemTitle(node);

  return (
    <li
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 12,
        padding: 10,
        background: "var(--surface-2)",
        border: "1px solid var(--border-1)",
        borderRadius: 12,
        opacity: isBusy ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Thumbnail */}
      <div
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          flexShrink: 0,
          background: isText ? "var(--surface-3)" : "var(--surface-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-3)",
          fontSize: 18,
        }}
      >
        {isText ? "¶" : node.thumbnail_key ? "" : "◇"}
      </div>

      {/* Meta */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-1)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          Trashed {formatDate(node.deleted_at)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {isConfirming ? (
          <>
            <span style={{ fontSize: 11, color: "var(--text-2)", marginRight: 2 }}>
              Delete forever?
            </span>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isBusy}
              className="pill-btn"
              style={pillBtn("neutral")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isBusy}
              className="pill-btn"
              style={pillBtn("danger")}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onRestore}
              disabled={isBusy}
              className="pill-btn"
              style={pillBtn("accent")}
            >
              Restore
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              disabled={isBusy}
              aria-label="Delete permanently"
              className="pill-btn"
              style={pillBtn("ghostDanger")}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function pillBtn(
  variant: "accent" | "danger" | "ghostDanger" | "neutral"
): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    padding: "6px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--border-1)",
    minHeight: 28,
    whiteSpace: "nowrap",
    transition: "opacity 0.15s ease, transform 0.1s ease",
  };
  switch (variant) {
    case "accent":
      return {
        ...base,
        background: "var(--accent)",
        color: "var(--accent-ink)",
        borderColor: "transparent",
      };
    case "danger":
      return {
        ...base,
        background: "var(--red, #dc2626)",
        color: "#fff",
        borderColor: "transparent",
      };
    case "ghostDanger":
      return {
        ...base,
        background: "transparent",
        color: "var(--red, #ff6b6b)",
      };
    case "neutral":
      return {
        ...base,
        background: "var(--surface-3)",
        color: "var(--text-2)",
      };
  }
}
