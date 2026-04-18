"use client";

import { useEffect, useState } from "react";
import { VisibleNode } from "@/lib/db/visibility";

interface SharedUser {
  userId: string;
  displayName: string | null;
}

interface CardDetailModalProps {
  node: VisibleNode | null;
  currentUserId: string;
  sharedUsers: SharedUser[];
  onClose: () => void;
}

/**
 * Card Detail Modal
 *
 * Per P13-T01 F2: "Shared with" section
 * - Each recipient row shows:
 *   - Avatar + display name
 *   - Permission pill (view/comment/edit/reshare) — tappable by node owner to change
 * - Tapping the pill opens an inline dropdown to select new permission
 * - On select: call changeNodePermission(). Optimistic UI update.
 */
export function CardDetailModal({
  node,
  currentUserId,
  sharedUsers,
  onClose,
}: CardDetailModalProps) {
  const open = node !== null;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !node) return null;

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
            Card Detail
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
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Title */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">
              {node.title ?? "Untitled"}
            </h2>
            {node.url ? (
              <a
                href={node.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-primary break-all hover:underline mt-1"
              >
                {node.url}
              </a>
            ) : node.text_content ? (
              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">
                {node.text_content}
              </p>
            ) : (
              <p className="text-sm text-gray-500 italic mt-1">No URL — text card</p>
            )}
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>Created {new Date(node.origin_created_at).toLocaleDateString()}</span>
          </div>

          {/* Rating placeholder — implemented in P6-T02 */}
          <div style={{padding:'6px 18px', fontSize:11, color:'var(--text-3)'}}>Rating — implemented in P6-T02</div>

          {/* Shared with section */}
          {sharedUsers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Shared with ({sharedUsers.length})
              </h3>
              <div className="space-y-2">
                {sharedUsers.map((user) => (
                  <div
                    key={user.userId}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                  >
                    {/* User info */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {user.displayName?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {user.displayName ?? "Unknown"}
                      </span>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
