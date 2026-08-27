"use client";

/**
 * AddTagModal — lets user pick an existing tag or create a new one
 * for a card.
 *
 * Calls getTagsAction to load existing tags, applyTagToNodeAction
 * to apply, and createOrGetTagAction to create+apply new tags.
 */

import { useState, useEffect, useCallback } from "react";
import { getTagsAction } from "@/app/lib/actions/getTags";
import { addTagToNodeAction, createOrGetTagAction } from "@/app/lib/actions/cardDetail";
import { toast } from "@/lib/store/toastStore";

interface AddTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  nodeName: string;
  languageCode?: string;
  onTagAdded?: () => void;
}

interface TagOption {
  id: string;
  label: string;
  color_hex: string;
}

export function AddTagModal({
  isOpen,
  onClose,
  nodeId,
  nodeName,
  languageCode = "en",
  onTagAdded,
}: AddTagModalProps) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const loadTags = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getTagsAction(languageCode);
      setTags(result);
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  }, [languageCode]);

  useEffect(() => {
    if (isOpen) {
      setSelectedTagId(null);
      setNewTagLabel("");
      loadTags();
    }
  }, [isOpen, loadTags]);

  if (!isOpen) return null;

  const handleApply = async () => {
    setIsApplying(true);
    try {
      if (newTagLabel.trim()) {
        // Create new tag and apply
        const result = await createOrGetTagAction(newTagLabel.trim(), nodeId, languageCode);
        if (result.ok) {
          toast.success(`Tag "${newTagLabel.trim()}" added to "${nodeName}"`);
          onTagAdded?.();
          onClose();
        } else {
          toast.error(result.error || "Failed to create tag");
        }
      } else if (selectedTagId) {
        // Apply existing tag
        const result = await addTagToNodeAction(nodeId, selectedTagId);
        if (result.ok) {
          const tag = tags.find(t => t.id === selectedTagId);
          toast.success(`Tag "${tag?.label}" added to "${nodeName}"`);
          onTagAdded?.();
          onClose();
        } else {
          toast.error(result.error || "Failed to add tag");
        }
      }
    } catch {
      toast.error("Failed to add tag");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Add tag to ${nodeName}`}
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
            Add tag
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0" }}>
            Tag &ldquo;{nodeName}&rdquo;
          </p>
        </div>

        {/* New tag input */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-1)" }}>
          <input
            type="text"
            value={newTagLabel}
            onChange={(e) => {
              setNewTagLabel(e.target.value);
              setSelectedTagId(null); // clear selection when typing
            }}
            placeholder="Type a new tag name..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--text-1)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-1)",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (newTagLabel.trim() || selectedTagId)) {
                handleApply();
              }
            }}
          />
        </div>

        {/* Existing tags list */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              Loading tags...
            </div>
          ) : tags.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No existing tags. Type a name above to create one.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", padding: "4px 12px" }}>
                OR PICK AN EXISTING TAG
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "4px 8px" }}>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setSelectedTagId(selectedTagId === tag.id ? null : tag.id);
                      setNewTagLabel(""); // clear new tag when selecting existing
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: selectedTagId === tag.id ? "#fff" : tag.color_hex,
                      background: selectedTagId === tag.id ? tag.color_hex : `${tag.color_hex}15`,
                      border: selectedTagId === tag.id ? `1px solid ${tag.color_hex}` : "1px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.1s",
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: tag.color_hex,
                    }} />
                    {tag.label}
                  </button>
                ))}
              </div>
            </>
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
            onClick={handleApply}
            disabled={(!newTagLabel.trim() && !selectedTagId) || isApplying}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--accent)",
              border: "none",
              cursor: (!newTagLabel.trim() && !selectedTagId) || isApplying ? "not-allowed" : "pointer",
              opacity: (!newTagLabel.trim() && !selectedTagId) || isApplying ? 0.5 : 1,
            }}
          >
            {isApplying ? "Adding..." : "Add tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
