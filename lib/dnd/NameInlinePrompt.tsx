"use client";

/**
 * Inline name prompt shown after an auto-create drop (card→card =
 * new folder, friend→friend = new group). Per PRD §6.10 / P7-T02:
 *   - auto-focused
 *   - Escape or tap-outside cancels (clean discard)
 *   - Enter confirms
 */

import { useEffect, useRef, useState } from "react";

export interface NameInlinePromptProps {
  title: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function NameInlinePrompt({
  title,
  placeholder = "Name",
  confirmLabel = "Create",
  onConfirm,
  onCancel,
}: NameInlinePromptProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const trimmed = value.trim();
  const canConfirm = trimmed.length > 0;

  return (
    <div
      role="dialog"
      aria-label={title}
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          minWidth: 280,
          maxWidth: "88vw",
          padding: 16,
          background: "var(--surface-2)",
          border: "1px solid var(--border-1)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {title}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canConfirm) {
              e.preventDefault();
              onConfirm(trimmed);
            }
          }}
          placeholder={placeholder}
          maxLength={64}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border-1)",
            background: "var(--surface-3)",
            color: "var(--text-1)",
            fontSize: 14,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid var(--border-1)",
              color: "var(--text-2)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm(trimmed)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: canConfirm ? "var(--accent)" : "var(--surface-3)",
              border: "1px solid var(--border-1)",
              color: canConfirm ? "var(--accent-ink, #000)" : "var(--text-3)",
              fontSize: 12,
              fontWeight: 700,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
