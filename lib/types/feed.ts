// ── DB-level feed types (single source of truth) ───────────────
// These mirror the get_feed RPC RETURN TABLE exactly.
// Both lib/db/feed.ts (server wrapper) and lib/hooks/useFeed.ts
// (client cursor-pagination hook) import from here.
//
// Two legitimate callers of get_feed exist:
//   1. lib/db/feed.ts:getFeed  — server-side, used by SSR pages
//   2. lib/hooks/useFeed.ts    — client-side, used for infinite scroll
// Both call the RPC directly with NO added logic (no filtering,
// sorting, or deduplication in TypeScript). The invariant is
// "no logic around the RPC", not "single caller".

/** Feed node as returned by get_feed RPC — matches SQL RETURN TABLE exactly */
export interface FeedNode {
  node_id: string;
  url: string | null;
  text_content: string | null;
  title: string | null;
  thumbnail_key: string | null;
  owner_id: string;
  language_code: string;
  origin_user_id: string;
  origin_created_at: string;
  created_at: string;

  avg_rating: number | null;
  view_count: number | null;
  share_count: number | null;

  direction: "own" | "sent" | "received";

  sender_id: string | null;
  sender_name: string | null;
  sender_avatar_key: string | null;

  tags: Array<{ tag_id: string; color_hex: string; label: string }>;

  total_count: number;
}

/** Parameters for getFeed — mirrors buildFeedParams output */
export interface FeedParams {
  p_user_id: string;
  p_language_code: string;
  p_view?: string;
  p_friend_id?: string;
  p_folder_id?: string;
  p_group_id?: string;
  p_filter_tag_ids?: string[];
  p_filter_friend_ids?: string[];
  p_filter_folder_ids?: string[];
  p_search_query?: string;
  p_sort?: string;
  p_cursor_created_at?: string;
  p_cursor_node_id?: string;
  p_limit?: number;
  p_exclude_foldered?: boolean;
  /** Custom ordering: when p_sort='custom', RPC orders by array_position. */
  p_custom_order_ids?: string[];
}

/** Result from getFeed call */
export interface FeedResult {
  nodes: FeedNode[];
  totalCount: number;
  nextCursor: { createdAt: string; nodeId: string } | null;
}

// ── UI-level feed types ────────────────────────────────────────

export interface FeedItem {
  id: string;
  kind: 'card' | 'folder';
  title: string;
  art: string;
  thumbnailKey?: string | null;
  ownerId?: string;
  tag?: string;
  tagColor?: string;
  rating?: number;
  dir?: 'mine' | 'received' | 'sent';
  sentTo?: string[];
  source?: string;
  daysAgo?: number;
  folderColor?: string;
  folderCount?: number;
}

export interface ViewProps {
  items: FeedItem[];
  zoom?: number;
  scopeKey?: string;
  onItemClick: (item: FeedItem) => void;
}
