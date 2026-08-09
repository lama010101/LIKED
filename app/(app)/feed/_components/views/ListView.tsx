"use client";

import { useState, useEffect } from "react";
import type { ViewProps, FeedItem } from "@/lib/types/feed";

function FolderThumb({ item }: { item: FeedItem }) {
  const base = item.folderColor ?? "#888";
  const quadrants = [
    `linear-gradient(135deg, ${base}cc, ${base}66)`,
    `linear-gradient(225deg, ${base}aa, ${base}44)`,
    `linear-gradient(45deg,  ${base}88, ${base}cc)`,
    `linear-gradient(315deg, ${base}55, ${base}99)`,
  ];
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 8,
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        overflow: "hidden",
      }}
    >
      {quadrants.map((bg, i) => (
        <div key={i} style={{ background: bg }} />
      ))}
    </div>
  );
}

function StarRow({ rating }: { rating: number }) {
  const filled = Math.floor(rating / 2);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
          <polygon
            points="5,1 6.2,3.8 9.5,4.1 7.1,6.3 7.9,9.5 5,7.8 2.1,9.5 2.9,6.3 0.5,4.1 3.8,3.8"
            fill={i < filled ? "var(--accent)" : "none"}
            stroke={i < filled ? "var(--accent)" : "var(--surface-5)"}
            strokeWidth="0.5"
          />
        </svg>
      ))}
    </div>
  );
}

function ListRow({ item, onClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: { item: FeedItem; onClick: (item: FeedItem) => void; currentUserId?: string; onCardShare?: (item: FeedItem) => void; onCardMoveToFolder?: (item: FeedItem) => void; onCardAddTag?: (item: FeedItem) => void; onCardDelete?: (nodeId: string) => void; }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleCardDelete = async () => {
    setMenuOpen(false);
    const res = await fetch(`/api/nodes/${item.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onCardDelete?.(item.id);
    } else {
      const body = await res.json().catch(() => ({}));
      console.error('Card delete failed', res.status, body);
    }
  };

  const isOwned = currentUserId && item.ownerId === currentUserId;

  // Escape key closes menu
  useEffect(() => {
    if (menuOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setMenuOpen(false);
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [menuOpen]);
  return (
    <div
      onClick={() => onClick(item)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        borderBottom: "1px solid var(--border-1)",
        cursor: "pointer",
        background: "var(--surface-2)",
      }}
    >
      {/* Thumbnail */}
      {item.kind === "folder" ? (
        <FolderThumb item={item} />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            flexShrink: 0,
            background: item.art,
            position: "relative",
          }}
        >
          {/* Direction badge - mine vs received */}
          {item.dir && (
            <div
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                width: 9,
                height: 9,
                borderRadius: "50%",
                border: "1.5px solid rgba(0,0,0,0.3)",
                background: item.dir === "mine" ? "var(--accent)" : "#60c5f1",
              }}
            />
          )}
        </div>
      )}

      {/* Meta column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-1)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.title}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginTop: 2,
          }}
        >
          {item.tagColor && (
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: item.tagColor,
                flexShrink: 0,
              }}
            />
          )}
          {item.tag && (
            <span style={{ fontSize: 10, color: item.tagColor, fontWeight: 600 }}>
              {item.tag}
            </span>
          )}
          {(item.tag || item.tagColor) && item.source && (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>·</span>
          )}
          {item.source && (
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>{item.source}</span>
          )}
          {item.daysAgo != null && (
            <>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>·</span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                {item.daysAgo === 0 ? "Today" : `${item.daysAgo}d ago`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Rating */}
      {item.rating != null && item.rating > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            marginLeft: "auto",
            flexShrink: 0,
          }}
        >
          <StarRow rating={item.rating} />
        </div>
      )}

      {/* Sent avatars */}
      {item.sentTo && item.sentTo.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {item.sentTo.slice(0, 3).map((s, i) => (
            <div
              key={s}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--surface-4)",
                fontSize: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-2)",
                marginLeft: i > 0 ? -4 : 0,
                border: "1px solid var(--surface-2)",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {s[0]?.toUpperCase()}
            </div>
          ))}
        </div>
      )}

      {/* Direction chevron */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-3)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, transform: "rotate(180deg)" }}
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>

      {/* Menu button - only show if owned */}
      {isOwned && (
        <span
          role="button"
          aria-label="Card menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4,
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="18" r="2" />
          </svg>
        </span>
      )}

      {/* Menu popover */}
      {menuOpen && (
        <>
          {/* Full-screen overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          {/* Popover */}
          <div
            className="absolute top-8 right-2 z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-2 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
              onClick={() => {
                setMenuOpen(false);
                onCardShare?.(item);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share with...
            </button>
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
              onClick={() => {
                setMenuOpen(false);
                onCardMoveToFolder?.(item);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              Move to folder
            </button>
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
              onClick={() => {
                setMenuOpen(false);
                onCardAddTag?.(item);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                <path d="M7 7h.01" />
              </svg>
              Add tag
            </button>
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500"
              onClick={handleCardDelete}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface ListViewProps extends ViewProps {
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

export default function ListView({ items, onItemClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: ListViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "0 0 4px" }}>
      {items.map((item) => (
        <ListRow key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} />
      ))}
    </div>
  );
}
