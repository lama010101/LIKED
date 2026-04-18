"use client";

import { useState } from "react";
import type { VisibleNode } from "@/lib/db/visibility";
import NodeCard from "./NodeCard";

interface FolderViewProps {
  folderName: string;
  folderColor: string;
  breadcrumb: string[];
  nodes: VisibleNode[];
  onBack: () => void;
  onFilterClick: () => void;
  onCardClick: (node: VisibleNode) => void;
}

export default function FolderView({
  folderName,
  folderColor,
  breadcrumb,
  nodes,
  onBack,
  onFilterClick,
  onCardClick,
}: FolderViewProps) {
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Folder header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 8px",
          background: "var(--surface-2)",
          flexShrink: 0,
        }}
      >
        {/* Left: color dot + folder name */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: folderColor,
              flexShrink: 0,
            }}
          />
          <span
            className="font-serif"
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-1)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {folderName}
          </span>
        </div>

        {/* Right: grid/list toggles + sliders */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Grid toggle */}
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setLayout("grid")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border-1)",
              background: layout === "grid" ? "var(--surface-4)" : "var(--surface-3)",
              color: layout === "grid" ? "var(--text-1)" : "var(--text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <rect x="1" y="1" width="5" height="5" rx="1" />
              <rect x="8" y="1" width="5" height="5" rx="1" />
              <rect x="1" y="8" width="5" height="5" rx="1" />
              <rect x="8" y="8" width="5" height="5" rx="1" />
            </svg>
          </button>

          {/* List toggle */}
          <button
            type="button"
            aria-label="List view"
            onClick={() => setLayout("list")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border-1)",
              background: layout === "list" ? "var(--surface-4)" : "var(--surface-3)",
              color: layout === "list" ? "var(--text-1)" : "var(--text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <line x1="1" y1="3" x2="13" y2="3" />
              <line x1="1" y1="7" x2="13" y2="7" />
              <line x1="1" y1="11" x2="13" y2="11" />
            </svg>
          </button>

          {/* Sliders / filter */}
          <button
            type="button"
            aria-label="Filter"
            onClick={onFilterClick}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border-1)",
              background: "var(--surface-3)",
              color: "var(--text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="9" cy="6" r="2.5" fill="var(--surface-3)" />
              <circle cx="15" cy="12" r="2.5" fill="var(--surface-3)" />
              <circle cx="9" cy="18" r="2.5" fill="var(--surface-3)" />
            </svg>
          </button>
        </div>
      </div>

      {/* Breadcrumb row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 16px 10px",
          background: "var(--surface-2)",
          flexShrink: 0,
          borderBottom: "1px solid var(--border-1)",
        }}
      >
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            padding: "4px 6px 4px 2px",
            cursor: "pointer",
            color: "var(--text-2)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={{ fontSize: 12, color: "var(--text-2)" }}>
          {breadcrumb.join(" › ")}
        </span>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {nodes.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-3)", fontSize: 14 }}>
            This folder is empty
          </div>
        )}

        {layout === "grid" && nodes.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10,
            }}
          >
            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} onClick={onCardClick} />
            ))}
          </div>
        )}

        {layout === "list" && nodes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} onClick={onCardClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
