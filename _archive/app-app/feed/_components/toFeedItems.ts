/**
 * toFeedItems — extracted from FeedGrid.tsx
 * Convert FeedNode[] (from get_feed RPC) to FeedItem[] for view components
 */

import type { FeedNode, FeedItem } from "@/lib/types/feed";

export function toFeedItems(nodes: FeedNode[]): FeedItem[] {
  return nodes.map((n) => {
    const hue = Math.abs(
      n.node_id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ) % 360;
    let source: string | undefined;
    if (n.url) {
      try { source = new URL(n.url).hostname; } catch { /* ignore */ }
    }
    return {
      id: n.node_id,
      kind: 'card' as const,
      title: n.title ?? n.url ?? (n.text_content ? 'Text note' : 'Untitled'),
      art: `linear-gradient(135deg, hsl(${hue}, 40%, 35%), hsl(${(hue + 60) % 360}, 50%, 25%))`,
      thumbnailKey: n.thumbnail_key ?? null,
      ownerId: n.owner_id,
      dir: n.direction === 'own' ? 'mine' : n.direction,
      source,
      rating: n.avg_rating ?? undefined,
      shareCount: n.share_count ?? undefined,
      viewCount: n.view_count ?? undefined,
      senderName: n.sender_name,
      isText: !n.url && !!n.text_content,
    };
  });
}
