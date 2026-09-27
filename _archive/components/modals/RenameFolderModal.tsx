"use client";

/**
 * RenameFolderModal — lets user rename a folder and optionally
 * change its color.
 *
 * Calls PATCH /api/folders/[id] with { name, color_hex }.
 */

import { useState, useEffect } from "react";
import { toast } from "@/lib/store/toastStore";

interface RenameFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
  folderColor: string;
  onRenamed?: (newName: string, newColor: string) => void;
}

const COLOR_OPTIONS = [
  "#7c5cbf", "#ff6b6b", "#4ecdc4", "#fd79a8",
  "#00cec9", "#a29bfe", "#fdcb6e", "#e17055",
  "#00b894", "#0984e3", "#6c5ce7", "#d63031",
];

export function RenameFolderModal({
  isOpen,
  onClose,
  folderId,
  folderName,
  folderColor,
  onRenamed,
}: RenameFolderModalProps) {
  const [name, setName] = useState(folderName);
  const [color, setColor] = useState(folderColor);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(folderName);
      setColor(folderColor);
    }
  }, [isOpen, folderName, folderColor]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Folder name cannot be empty");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), color_hex: color }),
      });
      if (res.ok) {
        toast.success("Folder updated");
        onRenamed?.(name.trim(), color);
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || "Failed to update folder");
      }
    } catch {
      toast.error("Failed to update folder");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit folder"
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
            Edit folder
          </h2>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name input */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
              FOLDER NAME
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
                color: "var(--text-1)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-1)",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  handleSave();
                }
              }}
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 8 }}>
              COLOR
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    border: color === c ? "2px solid var(--text-1)" : "2px solid transparent",
                    cursor: "pointer",
                    transition: "transform 0.1s",
                    transform: color === c ? "scale(1.1)" : "scale(1)",
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
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
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--accent)",
              border: "none",
              cursor: !name.trim() || isSaving ? "not-allowed" : "pointer",
              opacity: !name.trim() || isSaving ? 0.5 : 1,
            }}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
