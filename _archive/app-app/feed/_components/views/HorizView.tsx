"use client";

/**
 * HorizView — horizontal strips grouped by context (UIX-07 restyle).
 * Tiles are fixed-width VideoCards; grouping logic unchanged
 * (folder color proxy → sender → recency buckets).
 * AUDIT-06 P1-3: the activeTag regroup branch was dead code (prop never
 * passed) and reordered the SQL result client-side — removed.
 */

import { useEffect, useMemo, useState } from "react";
import type { ViewProps, FeedItem } from "@/lib/types/feed";
import type { Folder } from "@/lib/types/app";
import { getFolderMembershipsAction } from "@/app/lib/actions/access";
import VideoCard from "../VideoCard";

interface HorizViewProps extends ViewProps {
  currentUserId?: string;
  folders?: Folder[];
  sourceFolderId?: string | null;
  onChanged?: () => void;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

interface ItemGroup {
  label: string;
  items: FeedItem[];
}

/**
 * Group items per PRD §11.2 D:
 * 1. In folder context → group by REAL sub-folder membership
 *    (HORIZ-001: get_folder_memberships RPC; feed order preserved —
 *    items are assigned to buckets in get_feed row order, never sorted
 *    or filtered here)
 * 2. Else → group by sender (dir: mine/received)
 * 3. Fallback → recency buckets: "Today", "This week", "This month", "Older"
 *
 * (AUDIT-06 P1-3: removed the activeTag client-side filter/grouping branch —
 * the prop had no callers; tag filtering is SQL-side via p_filter_tag_ids.)
 */
function groupItems(
  items: FeedItem[],
  sourceFolderId: string | null | undefined,
  folders: Folder[] | undefined,
  memberships: Map<string, Set<string>> | null,
  activeFolderName: string
): ItemGroup[] {
  // 1. Folder context → real sub-folder membership grouping
  if (sourceFolderId) {
    if (memberships === null) {
      // memberships still loading → flat strip in feed order
      return items.length ? [{ label: activeFolderName, items }] : [];
    }
    const subfolders = (folders ?? []).filter((f) => f.parent_folder_id === sourceFolderId);
    if (subfolders.length === 0) {
      return items.length ? [{ label: activeFolderName, items }] : [];
    }
    const buckets = subfolders.map((f) => ({
      label: f.name,
      ids: memberships.get(f.id) ?? new Set<string>(),
      items: [] as FeedItem[],
    }));
    const rest: ItemGroup = { label: "This folder", items: [] };
    for (const item of items) {
      const bucket = buckets.find((b) => b.ids.has(item.id));
      (bucket ?? rest).items.push(item);
    }
    return [...buckets, rest].filter((g) => g.items.length > 0);
  }

  // 2. Else → group by sender (mine/received as proxy for sender)
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

  // 3. Fallback → recency buckets
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

export default function HorizView({ items, onItemClick, currentUserId, folders, sourceFolderId, onChanged, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: HorizViewProps) {
  // HORIZ-001 — real sub-folder membership sets (edge-visible node_ids
  // only, via get_folder_memberships). Fetched per subfolder when a
  // folder context is active; ordering inside each group is inherited
  // from get_feed row order — no sorting here.
  const [memberships, setMemberships] = useState<Map<string, Set<string>> | null>(null);
  const subfolderKey = useMemo(
    () => (folders ?? []).filter((f) => f.parent_folder_id === sourceFolderId).map((f) => f.id).join(","),
    [folders, sourceFolderId]
  );
  useEffect(() => {
    if (!sourceFolderId) {
      queueMicrotask(() => setMemberships(null));
      return;
    }
    const subs = (folders ?? []).filter((f) => f.parent_folder_id === sourceFolderId);
    if (subs.length === 0) {
      queueMicrotask(() => setMemberships(new Map()));
      return;
    }
    let live = true;
    Promise.all(
      subs.map((f) =>
        getFolderMembershipsAction(f.id).then(
          (ids) => [f.id, new Set(ids)] as const
        )
      )
    )
      .then((entries) => { if (live) setMemberships(new Map(entries)); })
      .catch(() => { if (live) setMemberships(new Map()); });
    return () => { live = false; };
    // subfolderKey captures the folders list identity relevant here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFolderId, subfolderKey]);

  const activeFolderName = (folders ?? []).find((f) => f.id === sourceFolderId)?.name ?? "Folder";
  const groups = useMemo(
    () => groupItems(items, sourceFolderId, folders, memberships, activeFolderName),
    [items, sourceFolderId, folders, memberships, activeFolderName]
  );

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
