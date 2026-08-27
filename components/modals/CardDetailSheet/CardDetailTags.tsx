/**
 * Tag chips + tag picker popover — extracted from CardDetailSheet Body
 */

import type { CardDetail } from "@/lib/db/cardDetail";

interface CardDetailTagsProps {
  tags: CardDetail["tags"];
  canEdit: boolean;
  onRemoveTag: (tagId: string) => void;
  onOpenTagPicker: () => void;
  onAddTag: (tagId: string) => void;
  tagPickerOpen: boolean;
  setTagPickerOpen: (b: boolean) => void;
  availableTags: Array<{ id: string; label: string; color_hex: string }>;
}

export function CardDetailTags({
  tags,
  canEdit,
  onRemoveTag,
  onOpenTagPicker,
  onAddTag,
  tagPickerOpen,
  setTagPickerOpen,
  availableTags,
}: CardDetailTagsProps) {
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((tag) => (
          <div
            key={tag.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: tag.color_hex + "22",
              color: tag.color_hex,
              border: `1px solid ${tag.color_hex}55`,
            }}
          >
            <span>{tag.label}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => onRemoveTag(tag.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: tag.color_hex,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 14,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label={`Remove ${tag.label}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onOpenTagPicker}
          style={{
            marginTop: 8,
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-2)",
            background: "var(--surface-3)",
            border: "1px solid var(--border-1)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          + Add tag
        </button>
      )}

      {/* Tag picker popover */}
      {tagPickerOpen && canEdit && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setTagPickerOpen(false)}
        >
          <div
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "var(--glass-blur)",
              borderRadius: 12,
              padding: 16,
              maxWidth: "100%",
              width: 320,
              maxHeight: "50vh",
              overflowY: "auto",
              border: "1px solid var(--border-2)",
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-1)",
                marginBottom: 12,
              }}
            >
              Add tag
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {availableTags
                .filter((t) => !tags.some((nt) => nt.id === t.id))
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onAddTag(tag.id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: tag.color_hex,
                      background: tag.color_hex + "22",
                      border: `1px solid ${tag.color_hex}55`,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {tag.label}
                  </button>
                ))}
              {availableTags.filter((t) => !tags.some((nt) => nt.id === t.id))
                .length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-3)",
                    textAlign: "center",
                    padding: 8,
                  }}
                >
                  No more tags available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
