/**
 * Utilities — extracted from AddCardSheet.tsx
 */

import { useEffect, useState } from "react";

export function useIsDesktop(): boolean {
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

const YT_HOST_RE = /^(www\.|m\.)?(youtube\.com|youtu\.be)$/;
const YT_VIDEO_RE = /^\/(shorts|embed)\/([A-Za-z0-9_-]+)/;

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!YT_HOST_RE.test(u.hostname)) return null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(YT_VIDEO_RE);
    if (m) return m[2];
    if (/youtu\.be/.test(u.hostname)) {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string): boolean {
  try {
    return YT_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Avatar color palette for deterministic background colors
const AVATAR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#78716c', '#6b7280', '#71717a', '#64748b',
];

export function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}
