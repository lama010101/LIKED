"use client";

/**
 * MasonView — CSS-columns masonry (UIX-07 restyle: PROTO V2 cards).
 */

import type { ViewProps, FeedItem } from "@/lib/types/feed";
import VideoCard from "../VideoCard";

interface MasonViewProps extends ViewProps {
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

export default function MasonView({ items, onItemClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: MasonViewProps) {
  return (
    <div
      className="mason-cols"
      style={{ columnGap: 16, padding: "4px 0" }}
    >
      <style>{`
        .mason-cols { columns: 2; }
        @media (min-width: 768px) { .mason-cols { columns: 3; } }
        @media (min-width: 1400px) { .mason-cols { columns: 4; } }
      `}</style>
      {items.map((item) => (
        <VideoCard key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} variant="mason" />
      ))}
    </div>
  );
}
