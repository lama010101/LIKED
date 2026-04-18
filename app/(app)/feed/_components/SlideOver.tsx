"use client";

import { useEffect, useState } from "react";
import type { VisibleNode } from "@/lib/db/visibility";

interface SlideOverProps {
  node: VisibleNode | null;
  onClose: () => void;
}

export default function SlideOver({ node, onClose }: SlideOverProps) {
  const open = node !== null;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 bg-black/30 z-modal transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={node?.title ?? "Node detail"}
        className={[
          "fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl z-modal flex flex-col",
          "transition-transform duration-250 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="text-xs font-medium uppercase tracking-widest text-gray-400">
            Detail
          </span>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {node && (
            <>
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                {node.title ?? "Untitled"}
              </h2>
              {node.url ? (
                <a
                  href={node.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-primary break-all hover:underline"
                >
                  {node.url}
                </a>
              ) : (
                <p className="text-sm text-gray-500 italic">No URL — text card</p>
              )}

              {/* Rating placeholder — implemented in P6-T02 */}
              <div style={{padding:'6px 18px', fontSize:11, color:'var(--text-3)'}}>Rating — implemented in P6-T02</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
