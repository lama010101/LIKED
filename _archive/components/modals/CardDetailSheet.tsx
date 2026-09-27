"use client";

/**
 * Card Detail Sheet (P8-T03, PRD §14).
 *
 * Single tap on a card opens this sheet. Bottom sheet on mobile,
 * right-side panel on desktop. Not opened during long-press (selection
 * overlay takes over per P7-T03).
 *
 * Sections, top to bottom:
 *   1. Media — platform-specific embed (YouTube / Spotify / Suno /
 *      generic iframe) or thumbnail fallback for text cards
 *   2. Title (inline editable by the owner)
 *   3. "Open externally" CTA
 *   4. Meta pills — avg rating, views, shares, direction
 *   5. Rating slider (0–10, step 0.5, autoSaves on release)
 *   6. Tag chips
 *   7. Shared-with avatar row
 *   8. Action grid: Share · Trash
 *
 * Data is fetched on open via `fetchCardDetail`. View-count bump is
 * fired server-side as a side effect of that call.
 */

import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { FeedNode } from "@/lib/hooks/useFeed";
import type { CardDetail } from "@/lib/db/cardDetail";
import {
  fetchCardDetail,
  rateCardAction,
  trashCardAction,
  updateNodeTitleAction,
  addTagToNodeAction,
  removeTagFromNodeAction,
  getFriendRatingsAction,
} from "@/app/lib/actions/cardDetail";
import { getTagsAction } from "@/app/lib/actions/getTags";
import { toast as showToast } from "@/lib/store/toastStore";
import { detectEmbed } from "./CardDetailSheet/detectEmbed";
import { Body } from "./CardDetailSheet/CardDetailBody";
import { iconBtn, LoadingSkeleton } from "./CardDetailSheet/CardDetailPrimitives";

interface CardDetailSheetProps {
  node: FeedNode | null;
  currentUserId: string;
  onClose: () => void;
  onShareClick?: (nodeId: string) => void;
  languageCode?: string;
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    queueMicrotask(() => setIsDesktop(mq.matches));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function CardDetailSheet({
  node,
  currentUserId,
  onClose,
  onShareClick,
  languageCode = "en",
}: CardDetailSheetProps) {
  const open = node !== null;
  const isDesktop = useIsDesktop();

  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const mediaContainerRef = useRef<HTMLDivElement>(null);

  // Rating state kept locally for slider responsiveness, synced with
  // detail.yourRating whenever a fresh load lands.
  const [ratingValue, setRatingValue] = useState<number>(0);

  // Title inline edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Tag picker state
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; label: string; color_hex: string }>>([]);

  // Friend ratings state
  const [friendRatings, setFriendRatings] = useState<Array<{ userId: string; displayName: string; avatarKey: string | null; score: number; updatedAt: string }>>([]);
  const [friendRatingsLoading, setFriendRatingsLoading] = useState(false);

  const embed = useMemo(
    () => detectEmbed(node?.url ?? null),
    [node?.url]
  );

  // Fetch detail whenever the node changes (scoped by node.node_id).
  // All resets are deferred via queueMicrotask so the effect body itself
  // doesn't synchronously call setState (react-hooks/set-state-in-effect).
  const nodeId = node?.node_id ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!nodeId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setDetail(null);
        setLoadError(null);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setDetail(null);
      setLoadError(null);
    });
    fetchCardDetail(nodeId, languageCode).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setDetail(result.detail);
        setRatingValue(result.detail.yourRating ?? 0);
        setTitleDraft(result.detail.node.title ?? "");
      } else {
        setLoadError(result.error);
      }
    }).catch(() => {
      if (!cancelled) setLoadError("Failed to load card details");
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId, languageCode]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Refetch detail from server after mutations (P2-5 fix: no optimistic updates)
  const refetchDetail = useCallback(() => {
    if (!nodeId) return;
    fetchCardDetail(nodeId, languageCode).then((res) => {
      if (res.ok) {
        setDetail(res.detail);
        setRatingValue(res.detail.yourRating ?? 0);
        setTitleDraft(res.detail.node.title ?? "");
      }
    }).catch(() => {});
  }, [nodeId, languageCode]);

  // Auto-save rating after slider-release (mouseup / touchend)
  const handleRatingCommit = useCallback(
    (score: number) => {
      if (!nodeId) return;
      startTransition(async () => {
        const result = await rateCardAction(nodeId, score);
        if (result.ok) {
          refetchDetail();
          showToast.success("Rating saved");
        } else {
          showToast.error(result.error);
        }
      });
    },
    [nodeId, refetchDetail]
  );

  const handleTitleSave = () => {
    if (!nodeId) return;
    const next = titleDraft.trim();
    if (!next) {
      setEditingTitle(false);
      setTitleDraft(detail?.node.title ?? "");
      return;
    }
    if (next === (detail?.node.title ?? "")) {
      setEditingTitle(false);
      return;
    }
    startTransition(async () => {
      const result = await updateNodeTitleAction(nodeId, next);
      if (result.ok) {
        refetchDetail();
        setEditingTitle(false);
        showToast.success("Title updated");
      } else {
        showToast.error(result.error);
      }
    });
  };

  const handleTrash = () => {
    if (!nodeId) return;
    startTransition(async () => {
      const result = await trashCardAction(nodeId);
      if (result.ok) {
        onClose();
        showToast.success("Moved to trash");
      } else {
        showToast.error(result.error);
      }
    });
  };

  const handleFullscreen = () => {
    const el = mediaContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  const handleRemoveTag = (tagId: string) => {
    if (!nodeId) return;
    startTransition(async () => {
      const result = await removeTagFromNodeAction(nodeId, tagId);
      if (result.ok) {
        refetchDetail();
        showToast.success("Tag removed");
      } else {
        showToast.error(result.error);
      }
    });
  };

  const handleAddTag = (tagId: string) => {
    if (!nodeId) return;
    startTransition(async () => {
      const result = await addTagToNodeAction(nodeId, tagId);
      if (result.ok) {
        setTagPickerOpen(false);
        // Refetch detail to get updated tags
        fetchCardDetail(nodeId, languageCode).then((res) => {
          if (res.ok) {
            setDetail(res.detail);
          }
        }).catch(() => {});
        showToast.success("Tag added");
      } else {
        showToast.error(result.error);
      }
    });
  };

  const handleOpenTagPicker = async () => {
    const tags = await getTagsAction(languageCode);
    setAvailableTags(tags);
    setTagPickerOpen(true);
  };

  // Load friend ratings when node changes
  useEffect(() => {
    if (!nodeId) {
      queueMicrotask(() => setFriendRatings([]));
      return;
    }
    queueMicrotask(() => setFriendRatingsLoading(true));
    getFriendRatingsAction(nodeId).then((res) => {
      if (res.ok) {
        setFriendRatings(res.ratings);
      } else {
        setFriendRatings([]);
      }
      setFriendRatingsLoading(false);
    }).catch(() => {
      setFriendRatings([]);
      setFriendRatingsLoading(false);
    });
  }, [nodeId]);

  // Container style: side panel on desktop, bottom sheet on mobile
  const containerStyle: CSSProperties = isDesktop
    ? {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 100vw)",
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        zIndex: 51,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease-out",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--border-2)",
      }
    : {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: open ? 0 : "-100%",
        zIndex: 51,
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderRadius: "18px 18px 0 0",
        borderTop: "1px solid var(--border-2)",
        maxHeight: "92vh",
        overflow: "hidden",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
        transition: "bottom 0.25s ease-out",
        display: "flex",
        flexDirection: "column",
      };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 50,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={node?.title ?? "Card detail"}
        style={containerStyle}
      >
        {/* Drag handle (mobile only) */}
        {!isDesktop && (
          <div
            style={{
              width: 36,
              height: 3,
              borderRadius: 100,
              background: "var(--text-3)",
              opacity: 0.35,
              margin: "10px auto 0",
              flexShrink: 0,
            }}
          />
        )}

        {/* Close button (desktop only) */}
        {isDesktop && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "12px 14px 0",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              style={iconBtn()}
            >
              ×
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 16px 20px",
          }}
        >
          {loadError ? (
            <div style={{ padding: 24, color: "var(--red, #ff6b6b)", fontSize: 13 }}>
              {loadError}
            </div>
          ) : !detail ? (
            node && <LoadingSkeleton />
          ) : (
            <Body
              detail={detail}
              embed={embed}
              mediaRef={mediaContainerRef}
              onFullscreen={handleFullscreen}
              ratingValue={ratingValue}
              setRatingValue={setRatingValue}
              onRatingCommit={handleRatingCommit}
              editingTitle={editingTitle}
              setEditingTitle={setEditingTitle}
              titleDraft={titleDraft}
              setTitleDraft={setTitleDraft}
              onTitleSave={handleTitleSave}
              onTrash={handleTrash}
              onShareClick={onShareClick}
              currentUserId={currentUserId}
              onRemoveTag={handleRemoveTag}
              onOpenTagPicker={handleOpenTagPicker}
              onAddTag={handleAddTag}
              tagPickerOpen={tagPickerOpen}
              setTagPickerOpen={setTagPickerOpen}
              availableTags={availableTags}
              friendRatings={friendRatings}
              friendRatingsLoading={friendRatingsLoading}
            />
          )}
        </div>

      </div>
    </>
  );
}
