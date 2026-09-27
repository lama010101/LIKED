"use client";

/**
 * YouTubeImportDialog — modal for bulk-importing YouTube activity into LIKED.
 *
 * UX flow:
 *   1. User clicks "Import All" → dialog opens with a summary
 *   2. User confirms → imports run sequentially with live progress
 *   3. Results shown: imported / duplicates / failed counts
 *   4. User closes dialog or clicks "View in Feed"
 *
 * Best practices:
 *   - Clear title + description of what will happen
 *   - Progress bar with current/total count
 *   - Per-item status (importing / done / duplicate / failed)
 *   - Cancel button before import starts; close button after
 *   - Backdrop click disabled during import (prevent accidental close)
 *   - Accessible: role="dialog", aria-modal, Escape to close (when safe)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { importYouTubeActivity } from "@/app/lib/actions/youtubeImport";
import type { YouTubeVideo } from "./VideoRow";

export interface YouTubeImportDialogProps {
  open: boolean;
  onClose: () => void;
  videos: YouTubeVideo[];
}

type ItemStatus = "pending" | "importing" | "done" | "duplicate" | "failed";

interface ImportState {
  statuses: ItemStatus[];
  currentIndex: number;
  done: boolean;
}

export default function YouTubeImportDialog({
  open,
  onClose,
  videos,
}: YouTubeImportDialogProps) {
  const router = useRouter();
  const [state, setState] = useState<ImportState>({
    statuses: [],
    currentIndex: -1,
    done: false,
  });
  const cancelRef = useRef(false);
  const importStartedRef = useRef(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      cancelRef.current = false;
      importStartedRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        statuses: videos.map(() => "pending" as ItemStatus),
        currentIndex: -1,
        done: false,
      });
    }
  }, [open, videos]);

  // Escape key closes dialog (only when not importing)
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (state.currentIndex === -1 || state.done)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose, state.currentIndex, state.done]);

  const handleImport = useCallback(async () => {
    if (importStartedRef.current) return;
    importStartedRef.current = true;

    const statuses: ItemStatus[] = videos.map(() => "pending");

    for (let i = 0; i < videos.length; i++) {
      if (cancelRef.current) break;

      statuses[i] = "importing";
      setState({ statuses: [...statuses], currentIndex: i, done: false });

      const video = videos[i];
      try {
        const url = `https://www.youtube.com/watch?v=${video.id}`;
        const result = await importYouTubeActivity({
          url,
          title: video.title,
          description: video.description,
          channelTitle: video.channelTitle,
          categoryId: video.categoryId,
          thumbnailUrl: video.thumbnail || null,
        });

        if (result.ok) {
          statuses[i] = "done";
        } else if (result.code === "duplicate") {
          statuses[i] = "duplicate";
        } else {
          statuses[i] = "failed";
        }
      } catch {
        statuses[i] = "failed";
      }

      setState({ statuses: [...statuses], currentIndex: i, done: false });
    }

    setState({ statuses: [...statuses], currentIndex: -1, done: true });
  }, [videos]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  if (!open) return null;

  const imported = state.statuses.filter((s) => s === "done").length;
  const duplicates = state.statuses.filter((s) => s === "duplicate").length;
  const failed = state.statuses.filter((s) => s === "failed").length;
  const processed = imported + duplicates + failed;
  const isImporting = state.currentIndex >= 0 && !state.done;
  const progress = videos.length > 0 ? (processed / videos.length) * 100 : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={isImporting ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(2px)",
          zIndex: 100,
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import YouTube videos"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(480px, 90vw)",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--surface-1, #fff)",
          borderRadius: 16,
          border: "1px solid var(--border-1, #e5e7eb)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          zIndex: 101,
          padding: 24,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "var(--accent, #7c5cfc)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.42a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.42a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.37z" />
                <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#fff" />
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1, #111)", margin: 0 }}>
              Import YouTube Videos
            </h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-2, #666)", lineHeight: 1.5, margin: 0 }}>
            {state.done
              ? "Import complete! Here's what happened:"
              : isImporting
              ? `Importing ${videos.length} videos to your "YouTube" folder with auto-tags…`
              : `This will save all ${videos.length} liked videos as cards in your LIKED library. Each video gets auto-tagged with "YouTube", the channel name, and category.`}
          </p>
        </div>

        {/* Pre-import: summary + confirm */}
        {!isImporting && !state.done && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              padding: 14,
              background: "var(--surface-3, #f5f5f5)",
              borderRadius: 10,
              border: "1px solid var(--border-1, #e5e7eb)",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-2, #666)" }}>Videos to import</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1, #111)" }}>{videos.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-2, #666)" }}>Destination</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1, #111)" }}>
                  📁 YouTube folder
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--text-2, #666)" }}>Auto-tags</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1, #111)" }}>
                  YouTube + channel + category
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "var(--surface-3, #f5f5f5)",
                  border: "1px solid var(--border-1, #e5e7eb)",
                  borderRadius: 10,
                  fontSize: 14, fontWeight: 600,
                  color: "var(--text-2, #666)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={videos.length === 0}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "var(--accent, #7c5cfc)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14, fontWeight: 700,
                  cursor: videos.length === 0 ? "default" : "pointer",
                  opacity: videos.length === 0 ? 0.5 : 1,
                }}
              >
                Import {videos.length} {videos.length === 1 ? "video" : "videos"}
              </button>
            </div>
          </div>
        )}

        {/* During import: progress bar + per-item status */}
        {(isImporting || state.done) && (
          <div style={{ marginBottom: 20 }}>
            {/* Progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2, #666)" }}>
                  {state.done ? "Complete" : `Importing… (${processed + (isImporting ? 1 : 0)}/${videos.length})`}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1, #111)" }}>
                  {Math.round(progress)}%
                </span>
              </div>
              <div style={{
                height: 8,
                background: "var(--surface-3, #e5e7eb)",
                borderRadius: 4,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--accent, #7c5cfc)",
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>

            {/* Results summary (when done) */}
            {state.done && (
              <div style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}>
                <ResultPill label="Imported" count={imported} color="var(--green, #22c55e)" />
                {duplicates > 0 && <ResultPill label="Already saved" count={duplicates} color="var(--text-3, #999)" />}
                {failed > 0 && <ResultPill label="Failed" count={failed} color="var(--red, #ef4444)" />}
              </div>
            )}

            {/* Per-item list (scrollable, max 5 visible) */}
            <div style={{
              maxHeight: 180,
              overflowY: "auto",
              border: "1px solid var(--border-1, #e5e7eb)",
              borderRadius: 8,
              padding: 4,
            }}>
              {videos.map((video, i) => (
                <div key={video.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: state.statuses[i] === "importing" ? "var(--surface-3, #f5f5f5)" : "transparent",
                }}>
                  <StatusIcon status={state.statuses[i]} />
                  <span style={{
                    fontSize: 12,
                    color: "var(--text-2, #666)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}>
                    {video.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        {isImporting && (
          <button
            onClick={handleCancel}
            style={{
              width: "100%", padding: "10px 0",
              background: "transparent",
              border: "1px solid var(--border-1, #e5e7eb)",
              borderRadius: 10,
              fontSize: 14, fontWeight: 600,
              color: "var(--text-2, #666)",
              cursor: "pointer",
            }}
          >
            Stop importing
          </button>
        )}

        {state.done && (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: "10px 0",
                background: "var(--surface-3, #f5f5f5)",
                border: "1px solid var(--border-1, #e5e7eb)",
                borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                color: "var(--text-2, #666)",
                cursor: "pointer",
              }}
            >
              Close
            </button>
            {imported > 0 && (
              <button
                onClick={() => router.push("/feed")}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "var(--accent, #7c5cfc)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                View in Feed →
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Small colored pill showing a result count. */
function ResultPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      background: "var(--surface-3, #f5f5f5)",
      borderRadius: 999,
      border: `1px solid ${color}33`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1, #111)" }}>{count}</span>
      <span style={{ fontSize: 11, color: "var(--text-2, #666)" }}>{label}</span>
    </div>
  );
}

/** Status icon for each item in the list. */
function StatusIcon({ status }: { status: ItemStatus }) {
  const size = 16;
  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--green, #22c55e)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Done">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "duplicate") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--text-3, #999)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Already saved">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--red, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Failed">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  if (status === "importing") {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        border: "2px solid var(--surface-3, #e5e7eb)",
        borderTopColor: "var(--accent, #7c5cfc)",
        animation: "spin 0.8s linear infinite",
      }} />
    );
  }
  // pending
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: "2px solid var(--surface-3, #e5e7eb)",
    }} />
  );
}
