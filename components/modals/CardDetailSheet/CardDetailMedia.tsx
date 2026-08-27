/**
 * Media rendering section — extracted from CardDetailSheet Body
 */

import Image from "next/image";
import type { CardDetail } from "@/lib/db/cardDetail";
import type { EmbedKind } from "./detectEmbed";

interface CardDetailMediaProps {
  embed: {
    kind: EmbedKind;
    src?: string;
    platform?: string;
  };
  node: CardDetail["node"];
  thumbnailKey: string | null;
  mediaRef: React.RefObject<HTMLDivElement | null>;
  onFullscreen: () => void;
}

export function CardDetailMedia({
  embed,
  node,
  thumbnailKey,
  mediaRef,
  onFullscreen,
}: CardDetailMediaProps) {
  const thumbnailUrl = (() => {
    if (!thumbnailKey) return null;
    const base = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
    return base + "/storage/v1/object/public/thumbnails/" + thumbnailKey;
  })();

  return (
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
      {embed.kind === "youtube" || embed.kind === "spotify" || embed.kind === "vimeo" ? (
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
      ) : embed.kind === "audio" ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-3)",
            padding: 16,
          }}
        >
          <audio
            controls
            src={embed.src}
            style={{ width: "100%", borderRadius: 8 }}
          >
            Your browser does not support audio playback.
          </audio>
        </div>
      ) : embed.kind === "video" ? (
        <video
          controls
          src={embed.src}
          style={{ width: "100%", height: "100%", borderRadius: 12, background: "#000" }}
        >
          Your browser does not support video playback.
        </video>
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
            {node.title ?? "Suno track"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
            Open to listen in Suno
          </span>
        </div>
      ) : embed.kind === "generic" ? (
        thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={node.title ?? "Preview"}
            fill
            sizes="100%"
            style={{ objectFit: "cover", display: "block" }}
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
          <Image
            src={thumbnailUrl}
            alt={node.title ?? "Preview"}
            fill
            sizes="100%"
            style={{ objectFit: "cover", display: "block" }}
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
  );
}
