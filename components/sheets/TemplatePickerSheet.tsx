"use client";

/**
 * TEMPLATE-001 — Template Picker sheet (PRD §11.3d).
 * Header "Choose a template", scrollable preset rows (icon + name +
 * one-line description), optional name input, full-width amber
 * "Add to workspace" button. Presets are exactly the §11.3d v1 list.
 */

import { useState } from "react";
import { createFolderTemplateAction, type TemplateKey } from "@/app/lib/actions/templates";
import { toast as showToast } from "@/lib/store/toastStore";

interface Preset {
  key: TemplateKey;
  name: string;
  desc: string;
  icon: string;
}

const PRESETS: Preset[] = [
  { key: "read_later", name: "Read Later", desc: "Articles and links to read when you have time.", icon: "📖" },
  { key: "watch_list", name: "Watch List", desc: "Videos and films to watch later.", icon: "🎬" },
  { key: "trip_planner", name: "Trip Planner", desc: "Plan a trip — Before / During / After.", icon: "✈️" },
  { key: "book_notes", name: "Book Notes", desc: "Notes and highlights from books.", icon: "📚" },
];

export default function TemplatePickerSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [selected, setSelected] = useState<TemplateKey | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!selected || busy) return;
    setBusy(true);
    const res = await createFolderTemplateAction(selected, name || undefined);
    setBusy(false);
    if (res.ok) {
      showToast.success("Folder created.");
      setSelected(null);
      setName("");
      onCreated?.();
      onClose();
    } else {
      showToast.error(res.error ?? "Could not create folder.");
    }
  };

  const handleClose = () => {
    setSelected(null);
    setName("");
    onClose();
  };

  return (
    <>
      <div
        onClick={handleClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 80 }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a template"
        data-testid="template-picker"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 0,
          transform: "translateX(-50%)",
          width: "min(480px, 100vw)",
          maxHeight: "70vh",
          zIndex: 81,
          background: "var(--surface-1, #fff)",
          borderRadius: "16px 16px 0 0",
          border: "1px solid var(--border-1, #e5e7eb)",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          padding: 20,
          gap: 14,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1, #111)" }}>
          Choose a template
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelected(p.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: selected === p.key
                  ? "2px solid var(--accent, #7c5cfc)"
                  : "1px solid var(--border-1, #e5e7eb)",
                background: selected === p.key
                  ? "color-mix(in srgb, var(--accent, #7c5cfc) 8%, transparent)"
                  : "var(--surface-1, #fff)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 20 }} aria-hidden="true">{p.icon}</span>
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-1, #111)" }}>
                  {p.name}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-2, #666)" }}>
                  {p.desc}
                </span>
              </span>
            </button>
          ))}
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name it… (optional)"
          style={{
            padding: "10px 12px",
            fontSize: 13,
            borderRadius: 8,
            border: "1px solid var(--border-1, #e5e7eb)",
            background: "var(--surface-2, #fafafa)",
            color: "var(--text-1, #111)",
          }}
        />

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || busy}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            background: "var(--amber, #f5a623)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            opacity: !selected || busy ? 0.5 : 1,
          }}
        >
          {busy ? "Creating…" : "Add to workspace"}
        </button>
      </div>
    </>
  );
}
