"use client";

/**
 * ColView — zoomable column grid (UIX-07 restyle: PROTO V2 16:9 cards).
 * Columns = zoom (2–6), rows of .video-card via VideoCard.
 */

import type { ViewProps, FeedItem } from "@/lib/types/feed";
import VideoCard from "../VideoCard";

interface ColViewProps extends ViewProps {
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

export default function ColView({ items, zoom = 2, onItemClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: ColViewProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${zoom}, 1fr)`,
        gap: 12,
        padding: "4px 0",
      }}
    >
      {items.map((item) => (
        <VideoCard key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} />
      ))}
    </div>
  );
}
