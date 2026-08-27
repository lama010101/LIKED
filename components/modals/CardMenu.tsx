"use client";

/**
 * CardMenu — reusable context menu for cards and folders.
 *
 * Uses React portal + position: fixed to escape overflow:hidden
 * containers that would otherwise clip the popover.
 *
 * Features:
 * - Captures button position on click via getBoundingClientRect()
 * - Renders popover via createPortal at document.body level
 * - position: fixed with computed top/left
 * - Full-screen overlay to close on outside click
 * - Escape key closes menu
 * - Items array config: { label, icon, onClick, variant }
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

export interface CardMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface CardMenuProps {
  items: CardMenuItem[];
  ariaLabel?: string;
  /** Only render the menu button if true (e.g., only for owned items) */
  show?: boolean;
}

export function CardMenu({
  items,
  ariaLabel = "Card menu",
  show = true,
}: CardMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);

  // Escape key closes menu
  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Position popover below-right of the button, clamped to viewport
    const popoverWidth = 200;
    const popoverHeight = items.length * 44 + 16;
    const left = Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 8);
    const top = Math.min(rect.bottom + 4, window.innerHeight - popoverHeight - 8);
    setMenuPos({ top: Math.max(8, top), left: Math.max(8, left) });
    setMenuOpen(true);
  }, [items.length]);

  if (!show) return null;

  return (
    <>
      {/* Menu trigger button */}
      <span
        ref={btnRef}
        role="button"
        aria-label={ariaLabel}
        onClick={openMenu}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 9999,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 4,
          cursor: "pointer",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
          <circle cx="12" cy="6" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="18" r="2" />
        </svg>
      </span>

      {/* Menu popover via portal — escapes overflow:hidden */}
      {menuOpen && menuPos && createPortal(
        <>
          {/* Full-screen overlay */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => setMenuOpen(false)}
          />
          {/* Popover */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 9999,
              background: "var(--surface-1)",
              border: "1px solid var(--border-1)",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              padding: 6,
              minWidth: 180,
            }}
          >
            {items.map((item, i) => (
              <button
                key={i}
                className="w-full text-left flex items-center gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  item.onClick();
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: item.variant === "danger" ? "var(--red)" : "var(--text-1)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  width: "100%",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface-3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── Icon components ────────────────────────────────────────────

export const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export const MoveFolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

export const TagIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
    <path d="M7 7h.01" />
  </svg>
);

export const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

export const RenameIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);
