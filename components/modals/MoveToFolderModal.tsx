"use client";

/**
 * MoveToFolderModal — lets user pick a folder to move a card into.
 *
 * Calls addNodeToFolderAction server action.
 */

import { useState, useEffect } from "react";
import { addNodeToFolderAction } from "@/app/lib/actions/addNodeToFolder";
import { removeNodeFromFolderAction } from "@/app/lib/actions/removeNodeFromFolder";
import { toast } from "@/lib/store/toastStore";
import type { Folder } from "@/lib/types/app";

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  nodeName: string;
  folders: Folder[];
  currentFolderId?: string | null;
  onMoved?: () => void;
}

export function MoveToFolderModal({
  isOpen,
  onClose,
  nodeId,
  nodeName,
  folders,
  currentFolderId,
  onMoved,
}: MoveToFolderModalProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (isOpen) setSelectedFolder(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMove = async () => {
    if (!selectedFolder) return;
    setIsMoving(true);
    try {
      // If card is already in a folder, remove from old first
      if (currentFolderId) {
        await removeNodeFromFolderAction({ nodeId, folderId: currentFolderId });
      }
      const result = await addNodeToFolderAction({ nodeId, folderId: selectedFolder });
      if (result.ok) {
        toast.success(`Moved "${nodeName}" to folder`);
        onMoved?.();
        onClose();
      } else {
        toast.error(result.error || "Failed to move card");
      }
    } catch {
      toast.error("Failed to move card");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-1)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          width: "90%",
          maxWidth: 400,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border-1)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
            Move to folder
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0" }}>
            Select a folder for &ldquo;{nodeName}&rdquo;
          </p>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {folders.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No folders available. Create a folder first.
            </div>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: selectedFolder === folder.id ? "var(--surface-3)" : "transparent",
                  border: selectedFolder === folder.id ? "1px solid var(--accent)" : "1px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: folder.color_hex || "#7c5cbf",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {folder.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {folder.node_count} {folder.node_count === 1 ? "item" : "items"}
                  </div>
                </div>
                {selectedFolder === folder.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-1)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-2)",
              background: "var(--surface-3)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={!selectedFolder || isMoving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--accent)",
              border: "none",
              cursor: !selectedFolder || isMoving ? "not-allowed" : "pointer",
              opacity: !selectedFolder || isMoving ? 0.5 : 1,
            }}
          >
            {isMoving ? "Moving..." : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}
