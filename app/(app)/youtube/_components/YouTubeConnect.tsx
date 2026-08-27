"use client";

/**
 * YouTubeConnect — extracted from youtube/page.tsx
 * Not-connected state shown when YouTube is not linked.
 */

import { useRouter } from "next/navigation";

export interface YouTubeConnectProps {
  onConnect: () => void;
  connecting: boolean;
}

export default function YouTubeConnect({ onConnect, connecting }: YouTubeConnectProps) {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>📺</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1, #111)" }}>
        Connect your YouTube account
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-2, #666)", textAlign: "center", maxWidth: 400 }}>
        See your liked videos and subscriptions, unlike videos, unsubscribe from channels — all from inside LIKED.
      </p>
      <button
        onClick={onConnect}
        disabled={connecting}
        style={{
          padding: "12px 28px",
          background: "var(--accent, #7c5cfc)",
          color: "#fff",
          border: "none",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          opacity: connecting ? 0.6 : 1,
        }}
      >
        {connecting ? "Connecting…" : "Connect YouTube"}
      </button>
      <button
        onClick={() => router.push("/feed")}
        style={{
          padding: "8px 16px",
          background: "none",
          border: "none",
          color: "var(--text-3, #999)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Back to feed
      </button>
    </div>
  );
}
