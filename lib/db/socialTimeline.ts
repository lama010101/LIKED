/**
 * Social timeline data access — server-side wrapper for get_social_timeline RPC.
 *
 * Returns a unified timeline of cards + folders sorted by created_at DESC,
 * cursor-paginated. Replaces the client-side merge+sort in SocialFeedView
 * (AUDIT-06 P1-2: feed logic leak — merging and sorting happened in TS).
 *
 * COMPLIANCE: treats get_social_timeline as a black box. No client-side
 * filtering, sorting, or deduplication. Returns data exactly as SQL produces.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_LANGUAGE } from "@/lib/constants";

/** Timeline item as returned by get_social_timeline RPC. */
export interface SocialTimelineItem {
  kind: "card" | "folder";
  id: string;
  created_at: string;
  // Card fields (null for folders)
  url: string | null;
  text_content: string | null;
  title: string | null;
  thumbnail_key: string | null;
  owner_id: string | null;
  direction: string | null;
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar_key: string | null;
  avg_rating: number | null;
  tags: Array<{ tag_id: string; color_hex: string; label: string }> | null;
  // Folder fields (null for cards)
  folder_name: string | null;
  folder_color: string | null;
  folder_count: number | null;
  folder_thumbnails: string[] | null;
  // Pagination
  total_count: number;
}

export interface SocialTimelineResult {
  items: SocialTimelineItem[];
  totalCount: number;
  nextCursor: { createdAt: string; id: string } | null;
}

const INITIAL_LIMIT = 30;

/**
 * Get social timeline via get_social_timeline RPC (server-side).
 * Used by the /social page for SSR initial load.
 */
export async function getSocialTimeline(
  userId: string,
  languageCode: string = DEFAULT_LANGUAGE
): Promise<SocialTimelineResult> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_social_timeline", {
    p_user_id: userId,
    p_language_code: languageCode,
    p_cursor_created_at: null,
    p_cursor_id: null,
    p_limit: INITIAL_LIMIT,
  });

  if (error) throw new Error(`Social timeline query failed: ${error.message}`);

  const items = (data ?? []) as SocialTimelineItem[];
  const totalCount = items.length > 0 ? items[0].total_count ?? 0 : 0;

  const nextCursor =
    items.length === INITIAL_LIMIT
      ? { createdAt: items[items.length - 1].created_at, id: items[items.length - 1].id }
      : null;

  return { items, totalCount, nextCursor };
}
