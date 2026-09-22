"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listCategorizationSuggestions,
  acceptCategorizationAction,
  rejectCategorizationAction,
  type CategorizationSuggestionRow,
} from "@/app/lib/actions/categorize";

/**
 * Phase B review surface (PRD §41.3.3): on-demand LLM suggestions for
 * liked videos, shown here for explicit accept/reject before any write.
 */
export default function CategorizePanel() {
  const [suggestions, setSuggestions] = useState<CategorizationSuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSuggestions(await listCategorizationSuggestions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const runCategorize = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/categorize", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Categorization failed");
      } else {
        await reload();
      }
    } catch {
      setError("Categorization failed");
    } finally {
      setRunning(false);
    }
  };

  const review = async (id: string, accept: boolean) => {
    setBusyId(id);
    try {
      const r = accept
        ? await acceptCategorizationAction(id)
        : await rejectCategorizationAction(id);
      if (r.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
      } else {
        setError(r.error ?? "Review failed");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      style={{
        margin: "12px 20px 0",
        padding: 14,
        borderRadius: 12,
        border: "1px solid var(--border-1, #e5e7eb)",
        background: "var(--surface-1, #fff)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1, #111)" }}>
            AI categorization
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3, #999)" }}>
            AI suggests folders/tags for your liked videos — nothing is applied until you accept.
          </div>
        </div>
        <button
          onClick={runCategorize}
          disabled={running}
          style={{
            padding: "6px 12px",
            background: "var(--accent, #7c5cfc)",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            cursor: running ? "default" : "pointer",
            opacity: running ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {running ? "Running…" : "Categorize likes"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--red, #ef4444)" }}>{error}</div>
      )}

      {loading ? null : suggestions.length === 0 ? null : (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {suggestions.map((s) => (
            <li
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--surface-2, #f7f7f9)",
                border: "1px solid var(--border-1, #e5e7eb)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-1, #111)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.node_title ?? "Untitled"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2, #666)", marginTop: 2 }}>
                  {s.suggested_folder_name ? `Folder: ${s.suggested_folder_name}` : "No folder"}
                  {s.suggested_tag_labels.length > 0 &&
                    ` · Tags: ${s.suggested_tag_labels.join(", ")}`}
                </div>
                {s.reason && (
                  <div style={{ fontSize: 11, color: "var(--text-3, #999)", marginTop: 2 }}>
                    {s.reason}
                  </div>
                )}
              </div>
              <button
                onClick={() => review(s.id, true)}
                disabled={busyId === s.id}
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  background: "var(--accent, #7c5cfc)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Accept
              </button>
              <button
                onClick={() => review(s.id, false)}
                disabled={busyId === s.id}
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "1px solid var(--border-1, #e5e7eb)",
                  background: "transparent",
                  color: "var(--text-2, #666)",
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
