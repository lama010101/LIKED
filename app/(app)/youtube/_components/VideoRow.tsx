"use client";

import Image from "next/image";

/**
 * VideoRow — extracted from youtube/page.tsx
 * Renders a single liked YouTube video with Save and Unlike actions.
 */

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  description: string;
  categoryId: string;
}

export interface VideoRowProps {
  video: YouTubeVideo;
  confirmUnlike: boolean;
  onConfirmUnlike: () => void;
  onCancelUnlike: () => void;
  onUnlike: () => void;
  onSaveToLiked: () => void;
  saving: boolean;
  saved: boolean;
}

export default function VideoRow({
  video,
  confirmUnlike,
  onConfirmUnlike,
  onCancelUnlike,
  onUnlike,
  onSaveToLiked,
  saving,
  saved,
}: VideoRowProps) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: 12,
      background: "var(--surface-2, #f9f9f9)",
      borderRadius: 12,
      border: "1px solid var(--border-1, #f0f0f0)",
    }}>
      {/* Thumbnail */}
      {video.thumbnail && (
        <Image
          src={video.thumbnail}
          alt={video.title}
          width={120}
          height={68}
          unoptimized
          style={{ width: 120, height: 68, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
        />
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-1, #111)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {video.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3, #999)", marginTop: 2 }}>
          {video.channelTitle}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={onSaveToLiked}
            disabled={saving || saved}
            style={{
              padding: "4px 10px",
              background: saved ? "var(--surface-3, #e5e7eb)" : "var(--accent, #7c5cfc)",
              color: saved ? "var(--text-3, #999)" : "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: saved ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save to LIKED"}
          </button>

          {confirmUnlike ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--red, #ef4444)" }}>Confirm?</span>
              <button
                onClick={onUnlike}
                style={{
                  padding: "4px 10px",
                  background: "var(--red, #ef4444)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, unlike
              </button>
              <button
                onClick={onCancelUnlike}
                style={{
                  padding: "4px 10px",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-1)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmUnlike}
              style={{
                padding: "4px 10px",
                background: "transparent",
                border: "1px solid var(--border-1, #e5e7eb)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-2, #666)",
                cursor: "pointer",
              }}
            >
              Unlike
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
