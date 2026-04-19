/**
 * Search query functions (P9-T02)
 * Translation-aware search using ILIKE on title, description, and tag labels
 *
 * PRD §11.1, §33.5:
 * - Search translations.title and translations.description for user's language
 * - Search tag_translations.label for user's language
 * - Fallback to nodes.title if no translation found
 * - All results filtered through visibility model
 * - No cross-language blending
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { VisibleNode, FeedView, MineSubFilter } from "./visibility";

/**
 * Search nodes visible to the user, querying:
 * 1. translations.title/description (user's language)
 * 2. tag_translations.label (user's language) → tag_edges → nodes
 * 3. nodes.title as fallback
 *
 * All results are filtered through the visibility model (owner OR edge, no blocks).
 */
export async function searchNodes(
  userId: string,
  query: string,
  languageCode: string,
  view: FeedView = 'all',
  mineFilter: MineSubFilter = 'all',
  sort: string = 'newest'
): Promise<VisibleNode[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc("search_nodes", {
    p_user_id: userId,
    p_query: query,
    p_language_code: languageCode,
    p_sort: sort,
    p_view: view,
    p_mine_filter: mineFilter,
  });

  if (error) {
    throw new Error(`Failed to search nodes: ${error.message}`);
  }

  return (data ?? []) as VisibleNode[];
}
