"use client";

/**
 * ACCESS-RAIL-001 (PRD §16.4) — scrollable row of small access avatars
 * shown when a folder or group context is active, with a "View all"
 * popover listing everyone with access. The same user id set drives the
 * glow highlight on the StoriesBar friend rings (see layout.tsx).
 */

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AccessUser } from "@/app/lib/actions/access";

function avatarUrl(avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  return supabaseBrowser.storage.from("avatars").getPublicUrl(avatarKey).data.publicUrl;
}

function AccessAvatar({ user, size }: { user: AccessUser; size: number }) {
  const url = avatarUrl(user.avatarKey);
  return (
    <div
      title={user.displayName}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        overflow: "hidden",
        background: "linear-gradient(135deg,#4a9fd5,#1c6fa0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.45,
        border: "2px solid var(--surface-1, #fff)",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={user.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (user.displayName ?? "?").charAt(0).toUpperCase()
      )}
    </div>
  );
}

export default function AccessStrip({ users }: { users: AccessUser[] }) {
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAll) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowAll(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAll(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [showAll]);

  if (users.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      data-testid="access-strip"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 16px 0",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-3, #999)", flexShrink: 0 }}>Shared with</span>
      <div
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          scrollbarWidth: "none",
          flex: 1,
          minWidth: 0,
        }}
      >
        {users.map((u) => (
          <AccessAvatar key={u.userId} user={u} size={24} />
        ))}
      </div>
      <button
        type="button"
        aria-label="View all people with access"
        onClick={() => setShowAll((v) => !v)}
        style={{
          flexShrink: 0,
          border: "none",
          background: "transparent",
          color: "var(--accent, #7c5cfc)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          padding: "2px 4px",
        }}
      >
        View all
      </button>

      {showAll && (
        <div
          role="dialog"
          aria-label="People with access"
          style={{
            position: "absolute",
            top: "100%",
            left: 16,
            zIndex: 60,
            marginTop: 4,
            minWidth: 220,
            maxHeight: 260,
            overflowY: "auto",
            background: "var(--surface-1, #fff)",
            border: "1px solid var(--border-1, #e5e7eb)",
            borderRadius: 12,
            boxShadow: "var(--shadow-md, 0 8px 30px rgba(0,0,0,0.12))",
            padding: 8,
          }}
        >
          {users.map((u) => (
            <div
              key={u.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                borderRadius: 8,
              }}
            >
              <AccessAvatar user={u} size={28} />
              <span style={{ fontSize: 13, color: "var(--text-1, #111)" }}>{u.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
