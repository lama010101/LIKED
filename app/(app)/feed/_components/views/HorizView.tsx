"use client";

import type { ViewProps, FeedItem } from "@/lib/types/feed";
import { toast } from "@/lib/store/toastStore";
import { CardMenu, ShareIcon, MoveFolderIcon, TagIcon, DeleteIcon } from "@/components/modals/CardMenu";

interface FolderContext {
  id: string;
  name: string;
  color: string;
}

interface HorizViewProps extends ViewProps {
  folderContext?: FolderContext | null;
  activeTag?: string | null;
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

function FolderCollage({ item }: { item: FeedItem }) {
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
        width: 110,
        height: 110,
        borderRadius: 10,
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

function HorizTile({ item, onClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: { item: FeedItem; onClick: (item: FeedItem) => void; currentUserId?: string; onCardShare?: (item: FeedItem) => void; onCardMoveToFolder?: (item: FeedItem) => void; onCardAddTag?: (item: FeedItem) => void; onCardDelete?: (nodeId: string) => void; }) {
  const handleCardDelete = async () => {
    const res = await fetch(`/api/nodes/${item.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onCardDelete?.(item.id);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error || 'Failed to delete card. Please try again.');
    }
  };

  const isOwned = currentUserId && item.ownerId === currentUserId;

  const menuItems = [
    ...(onCardShare ? [{ label: "Share with...", icon: <ShareIcon />, onClick: () => onCardShare(item) }] : []),
    ...(onCardMoveToFolder ? [{ label: "Move to folder", icon: <MoveFolderIcon />, onClick: () => onCardMoveToFolder(item) }] : []),
    ...(onCardAddTag ? [{ label: "Add tag", icon: <TagIcon />, onClick: () => onCardAddTag(item) }] : []),
    { label: "Delete", icon: <DeleteIcon />, onClick: handleCardDelete, variant: "danger" as const },
  ];
  return (
    <div
      onClick={() => onClick(item)}
      style={{
        width: 110,
        height: 110,
        flexShrink: 0,
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        background: item.art,
      }}
    >
      {item.kind === "folder" && (
        <div style={{ position: "absolute", inset: 0 }}>
          <FolderCollage item={item} />
        </div>
      )}

      {/* Title overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "4px 6px 6px",
          fontSize: 10,
          fontWeight: 600,
          color: "#fff",
          background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
        }}
      >
        {item.title}
      </div>

      {/* Rating badge */}
      {item.rating != null && item.rating > 0 && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: "rgba(0,0,0,0.55)",
            borderRadius: 5,
            padding: "2px 5px",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--accent)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="#f5a623" aria-hidden="true">
            <polygon points="5,1 6.2,3.8 9.5,4.1 7.1,6.3 7.9,9.5 5,7.8 2.1,9.5 2.9,6.3 0.5,4.1 3.8,3.8" />
          </svg>
          {item.rating}
        </div>
      )}

      {/* Direction badge - mine vs received */}
      {item.dir && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 9,
            height: 9,
            borderRadius: "50%",
            border: "1.5px solid rgba(0,0,0,0.3)",
            background: item.dir === "mine" ? "var(--accent)" : "#60c5f1",
          }}
        />
      )}

      {/* Sent indicator */}
      {item.sentTo && item.sentTo.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 9,
            height: 9,
            borderRadius: 2,
            background: "rgba(167,139,250,0.95)",
          }}
        />
      )}

      {/* Folder color dot */}
      {item.kind === "folder" && item.folderColor && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            width: 8,
            height: 8,
            borderRadius: 2,
            background: item.folderColor,
          }}
        />
      )}

      {/* Menu (portal-based, escapes overflow:hidden) */}
      <CardMenu items={menuItems} ariaLabel="Card menu" show={!!isOwned} />
    </div>
  );
}

/**
 * Group items per PRD §11.2 D:
 * 1. If in folder context → group by sub-folder name (stub: use folderColor as proxy)
 * 2. Else if tag filter active → group by tag
 * 3. Else → group by sender (dir: mine/received)
 * 4. Fallback → recency buckets: "Today", "This week", "This month", "Older"
 */
function groupItems(
  items: FeedItem[],
  folderContext?: FolderContext | null,
  activeTag?: string | null
): { label: string; items: FeedItem[] }[] {
  // 1. In folder context → group by sub-folder (stub: group by folderColor as proxy)
  if (folderContext) {
    const groups: Record<string, FeedItem[]> = {};
    for (const item of items) {
      // Use folderColor or title first word as sub-folder proxy
      const key = item.folderColor ?? "Uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups)
      .map(([, g]) => ({
        label: g[0].title?.split(" ")[0]?.slice(0, 16) || "Folder",
        items: g,
      }))
      .filter((g) => g.items.length > 0); // Hide empty rows
  }

  // 2. Tag filter active → group by tag
  if (activeTag) {
    const withTag = items.filter((i) => i.tag === activeTag);
    const withoutTag = items.filter((i) => i.tag !== activeTag);
    const result: { label: string; items: FeedItem[] }[] = [];
    if (withTag.length > 0) result.push({ label: activeTag, items: withTag });
    if (withoutTag.length > 0) result.push({ label: "Other", items: withoutTag });
    return result;
  }

  // 3. Else → group by sender (mine/received as proxy for sender)
  const hasSenderInfo = items.some((i) => i.dir);
  if (hasSenderInfo) {
    const mine = items.filter((i) => i.dir === "mine");
    const received = items.filter((i) => i.dir === "received");
    const unset = items.filter((i) => !i.dir);

    const result: { label: string; items: FeedItem[] }[] = [];
    if (mine.length > 0) result.push({ label: "Mine", items: mine });
    if (received.length > 0) result.push({ label: "Received", items: received });
    if (unset.length > 0) result.push({ label: "All", items: unset });
    return result;
  }

  // 4. Fallback → recency buckets
  const buckets: Record<string, FeedItem[]> = {
    Today: [],
    "This week": [],
    "This month": [],
    Older: [],
  };

  for (const item of items) {
    const daysAgo = item.daysAgo ?? 999;
    if (daysAgo === 0) {
      buckets["Today"].push(item);
    } else if (daysAgo <= 7) {
      buckets["This week"].push(item);
    } else if (daysAgo <= 30) {
      buckets["This month"].push(item);
    } else {
      buckets["Older"].push(item);
    }
  }

  return Object.entries(buckets)
    .filter(([, g]) => g.length > 0) // Hide empty rows
    .map(([label, g]) => ({ label, items: g }));
}

export default function HorizView({ items, onItemClick, folderContext, activeTag, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: HorizViewProps) {
  const groups = groupItems(items, folderContext, activeTag);

  return (
    <div style={{ paddingBottom: 8 }}>
      {groups.map((group) => (
        <div key={group.label} style={{ marginBottom: 18 }}>
          {/* Row label - fixed, not scrolling */}
          <div
            style={{
              padding: "4px 14px 6px",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-3)",
            }}
          >
            {group.label}
          </div>
          {/* Horizontally scrolling card strip */}
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              scrollbarWidth: "none",
              padding: "0 14px 4px",
            }}
          >
            {group.items.map((item) => (
              <HorizTile key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
