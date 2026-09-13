"use client";

/**
 * HorizView — horizontal strips grouped by context (UIX-07 restyle).
 * Tiles are fixed-width VideoCards; grouping logic unchanged
 * (folder color proxy → tag → sender → recency buckets).
 */

import type { ViewProps, FeedItem } from "@/lib/types/feed";
import type { Folder } from "@/lib/types/app";
import VideoCard from "../VideoCard";

interface FolderContext {
  id: string;
  name: string;
  color: string;
}

interface HorizViewProps extends ViewProps {
  folderContext?: FolderContext | null;
  activeTag?: string | null;
  currentUserId?: string;
  folders?: Folder[];
  sourceFolderId?: string | null;
  onChanged?: () => void;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
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

export default function HorizView({ items, onItemClick, folderContext, activeTag, currentUserId, folders, sourceFolderId, onChanged, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: HorizViewProps) {
  const groups = groupItems(items, folderContext, activeTag);

  return (
    <div style={{ paddingBottom: 8 }}>
      {groups.map((group) => (
        <div key={group.label} style={{ marginBottom: 18 }}>
          {/* Row label - fixed, not scrolling */}
          <div
            style={{
              padding: "4px 0 8px",
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
              gap: 12,
              overflowX: "auto",
              scrollbarWidth: "none",
              padding: "0 0 6px",
            }}
          >
            {group.items.map((item) => (
              <VideoCard key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} folders={folders} sourceFolderId={sourceFolderId} onChanged={onChanged} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} variant="horiz" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
