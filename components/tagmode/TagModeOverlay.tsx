"use client";

/**
 * Tag Mode UI (PRD §11.3b steps 1–5):
 *   1. Floating Tag Pill anchored at the FAB position — shows the picked
 *      tag ("Pick a tag" when none) + × dismiss.
 *   2. Half-height Tag Sheet while no tag is picked: header, search,
 *      scrollable tag chips, "+ New tag" input at bottom.
 *   3. Picking a chip collapses the sheet; the pill updates.
 *   5. × on the pill exits. (Steps 4 & 6 live in NodeCard/FoldersStrip.)
 */

import { useMemo, useState } from "react";
import { useTagModeStore } from "@/lib/store/tagModeStore";
import { useSelectionStore } from "@/lib/store/selectionStore";
import { createTagAction } from "@/app/lib/actions/applyTagToNode";
import { toast as showToast } from "@/lib/store/toastStore";
import type { SidebarTag } from "@/components/sidebar/Sidebar";

export default function TagModeOverlay({
  tags,
  languageCode = "en",
}: {
  tags: SidebarTag[];
  languageCode?: string;
}) {
  const active = useTagModeStore((s) => s.active);
  const tag = useTagModeStore((s) => s.tag);
  const setTag = useTagModeStore((s) => s.setTag);
  const exit = useTagModeStore((s) => s.exit);
  const [query, setQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const [creating, setCreating] = useState(false);
  const [localTags, setLocalTags] = useState<SidebarTag[]>([]);

  const allTags = useMemo(() => {
    const byId = new Map<string, SidebarTag>();
    [...tags, ...localTags].forEach((t) => byId.set(t.id, t));
    return [...byId.values()];
  }, [tags, localTags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allTags.filter((t) => t.label.toLowerCase().includes(q)) : allTags;
  }, [allTags, query]);

  if (!active) return null;

  const selectionActive = useSelectionStore.getState().isActive;

  const handlePick = (t: SidebarTag) => {
    setTag({ id: t.id, label: t.label, color: t.color_hex });
    setQuery("");
  };

  const handleCreate = async () => {
    const label = newTag.trim();
    if (!label || creating) return;
    setCreating(true);
    const res = await createTagAction(label, languageCode);
    setCreating(false);
    if (res.ok && res.tag) {
      setLocalTags((prev) => [...prev, { id: res.tag!.id, label: res.tag!.label, color_hex: res.tag!.color }]);
      setTag(res.tag);
      setNewTag("");
      setQuery("");
    } else {
      showToast.error(res.error ?? "Could not create tag");
    }
  };

  // Step 2 — half-height sheet only while no tag is picked
  const sheetOpen = !tag;

  return (
    <>
      {/* Step 1 — floating Tag Pill at FAB position (bottom-right desktop,
          bottom-center mobile via media query) */}
      <div
        data-testid="tag-mode-pill"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 70,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: "var(--r-full, 999px)",
          background: tag ? tag.color : "var(--surface-2, #f5f5f5)",
          color: tag ? "#fff" : "var(--text-2, #666)",
          border: tag ? "none" : "1px dashed var(--border-1, #e5e7eb)",
          boxShadow: "var(--shadow-md, 0 4px 16px rgba(0,0,0,0.15))",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z" />
          <circle cx="7" cy="7" r="1.5" />
        </svg>
        {tag ? tag.label : "Pick a tag"}
        <button
          type="button"
          aria-label="Exit tag mode"
          onClick={exit}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            fontSize: 15,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* Step 2 — half-height Tag Sheet */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-label="Tag Mode"
          data-testid="tag-mode-sheet"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            height: "50vh",
            zIndex: 65,
            background: "var(--surface-1, #fff)",
            borderTop: "1px solid var(--border-1, #e5e7eb)",
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -8px 30px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            padding: 16,
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1, #111)" }}>
            Tag Mode — tap cards to apply
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags…"
            autoFocus
            style={{
              padding: "8px 12px",
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid var(--border-1, #e5e7eb)",
              background: "var(--surface-2, #fafafa)",
              color: "var(--text-1, #111)",
            }}
          />
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignContent: "flex-start",
            }}
          >
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handlePick(t)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--r-full, 999px)",
                  background: t.color_hex,
                  color: "#fff",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-3, #999)", padding: 8 }}>
                No tags match.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="＋ New tag"
              disabled={selectionActive}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--border-1, #e5e7eb)",
                background: "var(--surface-2, #fafafa)",
                color: "var(--text-1, #111)",
              }}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newTag.trim() || creating}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "var(--accent, #7c5cfc)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity: !newTag.trim() || creating ? 0.6 : 1,
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </>
  );
}
