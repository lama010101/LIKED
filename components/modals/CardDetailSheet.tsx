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
} from "@/app/lib/actions/cardDetail";

interface CardDetailSheetProps {
  node: FeedNode | null;
  currentUserId: string;
  onClose: () => void;
  onShareClick?: (nodeId: string) => void;
  languageCode?: string;
}

type EmbedKind = "youtube" | "spotify" | "suno" | "generic" | "none";

function detectEmbed(url: string | null): {
  kind: EmbedKind;
  src?: string;
  platform?: string;
} {
  if (!url) return { kind: "none" };
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${id}`,
          platform: "YouTube",
        };
      }
      const m = u.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]+)/);
      if (m) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${m[1]}`,
          platform: "YouTube",
        };
      }
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${id}`,
          platform: "YouTube",
        };
      }
    }

    // Spotify
    if (host === "open.spotify.com" || host === "spotify.com") {
      // URL shape: /track/:id, /playlist/:id, /album/:id, /episode/:id
      const m = u.pathname.match(
        /^\/(track|playlist|album|episode|show)\/([A-Za-z0-9]+)/
      );
      if (m) {
        return {
          kind: "spotify",
          src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
          platform: "Spotify",
        };
      }
    }

    // Suno
    if (host === "suno.com" || host === "suno.ai") {
      const m = u.pathname.match(/^\/song\/([A-Za-z0-9-]+)/);
      if (m) {
        return {
          kind: "suno",
          src: `https://suno.com/embed/${m[1]}`,
          platform: "Suno",
        };
      }
      return { kind: "generic", src: url, platform: "Suno" };
    }

    // Generic
    return {
      kind: "generic",
      src: url,
      platform: host.split(".").slice(-2, -1)[0] ?? host,
    };
  } catch {
    return { kind: "none" };
  }
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
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const mediaContainerRef = useRef<HTMLDivElement>(null);

  // Rating state kept locally for slider responsiveness, synced with
  // detail.yourRating whenever a fresh load lands.
  const [ratingValue, setRatingValue] = useState<number>(0);

  // Title inline edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

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

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Auto-save rating after slider-release (mouseup / touchend)
  const handleRatingCommit = useCallback(
    (score: number) => {
      if (!nodeId) return;
      startTransition(async () => {
        const result = await rateCardAction(nodeId, score);
        if (result.ok) {
          setDetail((prev) =>
            prev
              ? { ...prev, yourRating: score }
              : prev
          );
          setToast("Rating saved");
        } else {
          setToast(result.error);
        }
      });
    },
    [nodeId]
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
        setDetail((prev) =>
          prev ? { ...prev, node: { ...prev.node, title: next } } : prev
        );
        setEditingTitle(false);
        setToast("Title updated");
      } else {
        setToast(result.error);
      }
    });
  };

  const handleTrash = () => {
    if (!nodeId) return;
    startTransition(async () => {
      const result = await trashCardAction(nodeId);
      if (result.ok) {
        onClose();
        setToast("Moved to trash");
      } else {
        setToast(result.error);
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

  // Container style: side panel on desktop, bottom sheet on mobile
  const containerStyle: CSSProperties = isDesktop
    ? {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 100vw)",
        background: "var(--surface-2)",
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
        background: "var(--surface-2)",
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
            />
          )}
        </div>

        {toast && (
          <div
            role="status"
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--surface-4)",
              color: "var(--text-1)",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              boxShadow: "var(--shadow-md)",
              whiteSpace: "nowrap",
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────── Body ───────────────

interface BodyProps {
  detail: CardDetail;
  embed: ReturnType<typeof detectEmbed>;
  mediaRef: React.RefObject<HTMLDivElement | null>;
  onFullscreen: () => void;
  ratingValue: number;
  setRatingValue: (v: number) => void;
  onRatingCommit: (v: number) => void;
  editingTitle: boolean;
  setEditingTitle: (b: boolean) => void;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  onTitleSave: () => void;
  onTrash: () => void;
  onShareClick?: (nodeId: string) => void;
  currentUserId: string;
}

function Body({
  detail,
  embed,
  mediaRef,
  onFullscreen,
  ratingValue,
  setRatingValue,
  onRatingCommit,
  editingTitle,
  setEditingTitle,
  titleDraft,
  setTitleDraft,
  onTitleSave,
  onTrash,
  onShareClick,
  currentUserId,
}: BodyProps) {
  const { node, tags, sortCache, sharedWith, isOwner, yourRating } = detail;
  const isTextCard = !node.url && !!node.text_content;
  const direction =
    node.origin_user_id === currentUserId ? "mine" : "received";

  const thumbnailUrl = (() => {
    const key = detail?.node.thumbnail_key ?? null;
    if (!key) return null;
    const base = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
    return base + "/storage/v1/object/public/thumbnails/" + key;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Media */}
      {!isTextCard && (
        <div
          ref={mediaRef}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--surface-3)",
          }}
        >
          {embed.kind === "youtube" || embed.kind === "spotify" ? (
            <iframe
              src={embed.src}
              title={node.title ?? "Media"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                display: "block",
              }}
            />
          ) : embed.kind === "suno" ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: thumbnailUrl
                  ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${thumbnailUrl}) center/cover`
                  : "linear-gradient(135deg, #1a1a2e, #16213e)",
                padding: 24,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                {detail?.node.title ?? node.title ?? "Suno track"}
              </span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                Open to listen in Suno
              </span>
            </div>
          ) : embed.kind === "generic" ? (
            thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={detail?.node.title ?? node.title ?? "Preview"}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-3)", fontSize: 13 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                </svg>
                <span>No preview available</span>
              </div>
            )
          ) : (
            thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={detail?.node.title ?? node.title ?? "Preview"}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 24 }}>
                ◇
              </div>
            )
          )}

          {/* Fullscreen button */}
          <button
            type="button"
            onClick={onFullscreen}
            aria-label="Fullscreen"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              border: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
      )}

      {/* Title */}
      <div>
        {editingTitle && isOwner ? (
          <input
            type="text"
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={onTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTitleSave();
              else if (e.key === "Escape") {
                setTitleDraft(node.title ?? "");
                setEditingTitle(false);
              }
            }}
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-1)",
              background: "var(--surface-3)",
              border: "1px solid var(--border-1)",
              borderRadius: 8,
              outline: "none",
            }}
          />
        ) : (
          <h2
            onClick={() => isOwner && setEditingTitle(true)}
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.35,
              color: "var(--text-1)",
              margin: 0,
              cursor: isOwner ? "text" : "default",
            }}
            title={isOwner ? "Click to edit" : undefined}
          >
            {node.title ?? (isTextCard ? "Text note" : "Untitled")}
          </h2>
        )}

        {isTextCard && node.text_content && (
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "var(--text-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {node.text_content}
          </p>
        )}
      </div>

      {/* Open externally CTA */}
      {node.url && (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px",
            borderRadius: 12,
            background: "var(--color-received, #4a9fd5)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
          Open in {embed.platform ?? "browser"}
        </a>
      )}

      {/* Meta pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Pill
          icon="★"
          label={
            sortCache.avgRating !== null
              ? sortCache.avgRating.toFixed(1)
              : "—"
          }
          hint="Avg rating"
        />
        <Pill icon="👁" label={sortCache.viewCount.toString()} hint="Views" />
        <Pill icon="↗" label={sortCache.shareCount.toString()} hint="Shares" />
        <Pill
          icon={direction === "mine" ? "↑" : "↓"}
          label={direction === "mine" ? "Mine" : "Received"}
          hint="Direction"
        />
      </div>

      {/* Rating slider */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
            Your rating
          </span>
          <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 700 }}>
            {yourRating === null && ratingValue === 0
              ? "—"
              : ratingValue.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={ratingValue}
          onChange={(e) => setRatingValue(Number(e.target.value))}
          onMouseUp={(e) => onRatingCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => onRatingCommit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              onRatingCommit(Number((e.target as HTMLInputElement).value));
            }
          }}
          aria-label="Your rating, 0 to 10 in steps of 0.5"
          style={{
            width: "100%",
            accentColor: "var(--accent)",
            height: 44,
          }}
        />
      </div>

      {/* Tag chips */}
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tags.map((tag) => (
            <span
              key={tag.id}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: tag.color_hex + "22",
                color: tag.color_hex,
                border: `1px solid ${tag.color_hex}55`,
              }}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* Shared with */}
      {sharedWith.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-2)",
              marginBottom: 6,
            }}
          >
            Shared with {sharedWith.length}
          </div>
          <div style={{ display: "flex", gap: -4, flexWrap: "wrap" }}>
            {sharedWith.slice(0, 12).map((u, i) => (
              <div
                key={u.userId}
                title={u.displayName ?? "Unknown"}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--surface-4)",
                  color: "var(--text-1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  border: "2px solid var(--surface-2)",
                  marginLeft: i === 0 ? 0 : -6,
                  flexShrink: 0,
                }}
              >
                {(u.displayName ?? "?").slice(0, 1).toUpperCase()}
              </div>
            ))}
            {sharedWith.length > 12 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginLeft: 4,
                  alignSelf: "center",
                }}
              >
                +{sharedWith.length - 12}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={() => onShareClick?.(node.id)}
          style={actionBtn("neutral")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share
        </button>
        <button
          type="button"
          onClick={onTrash}
          style={actionBtn("danger")}
          disabled={!isOwner}
          aria-disabled={!isOwner}
          title={isOwner ? undefined : "Only the owner can trash"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Trash
        </button>
      </div>
    </div>
  );
}

// ─────────────── Primitives ───────────────

function Pill({
  icon,
  label,
  hint,
}: {
  icon: string;
  label: string;
  hint: string;
}) {
  return (
    <span
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-2)",
        background: "var(--surface-3)",
        borderRadius: 999,
        border: "1px solid var(--border-1)",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

function iconBtn(): CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "var(--surface-3)",
    color: "var(--text-2)",
    border: "1px solid var(--border-1)",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 0,
  };
}

function actionBtn(variant: "neutral" | "danger"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid var(--border-1)",
  };
  if (variant === "danger") {
    return {
      ...base,
      background: "transparent",
      color: "var(--red, #ff6b6b)",
      borderColor: "var(--red, #ff6b6b)55",
    };
  }
  return {
    ...base,
    background: "var(--surface-3)",
    color: "var(--text-1)",
  };
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          background: "var(--surface-3)",
          borderRadius: 12,
        }}
      />
      <div style={{ height: 20, width: "70%", background: "var(--surface-3)", borderRadius: 6 }} />
      <div style={{ height: 14, width: "50%", background: "var(--surface-3)", borderRadius: 6 }} />
    </div>
  );
}
