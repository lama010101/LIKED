/**
 * Card Detail data assembly (P8-T03, PRD §14).
 *
 * Collects everything the Card Detail sheet needs in a single server
 * call: the node itself, tags, sort-cache metrics (avg rating, view +
 * share count), the viewer's own rating, and the list of users the
 * node is shared with.
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getVisibleNodeById, type VisibleNode } from "@/lib/db/visibility";
import { getTagsForNode, type TagWithLabel } from "@/lib/db/tags";
import { getRatingsForNode, type RatingWithUser } from "@/lib/db/ratings";

export interface CardDetailSharedUser {
  userId: string;
  displayName: string | null;
  avatarKey: string | null;
}

export interface CardDetailSortCache {
  avgRating: number | null;
  viewCount: number;
  shareCount: number;
}

export interface CardDetail {
  node: VisibleNode;
  tags: TagWithLabel[];
  ratings: RatingWithUser[];
  yourRating: number | null;
  sharedWith: CardDetailSharedUser[];
  sortCache: CardDetailSortCache;
  isOwner: boolean;
}

/**
 * Fetch the sort-cache metrics for a single node. Returns defaults when
 * no cache row exists yet.
 */
async function getSortCache(nodeId: string): Promise<CardDetailSortCache> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("nodes_sort_cache")
    .select("avg_rating, view_count, share_count")
    .eq("node_id", nodeId)
    .maybeSingle();
  if (error || !data) {
    return { avgRating: null, viewCount: 0, shareCount: 0 };
  }
  return {
    avgRating: data.avg_rating !== null ? Number(data.avg_rating) : null,
    viewCount: data.view_count ?? 0,
    shareCount: data.share_count ?? 0,
  };
}

/**
 * Return the users (other than the owner) who currently have an edge to
 * this node — i.e. who can see it in their feed. Deduped by user_id.
 */
async function getSharedWith(
  nodeId: string,
  ownerId: string
): Promise<CardDetailSharedUser[]> {
  const supabase = getSupabaseServiceClient();

  type EdgeRow = {
    user_id: string;
    users: {
      display_name: string | null;
      avatar_key: string | null;
    } | null;
  };

  const { data, error } = (await supabase
    .from("edges")
    .select("user_id, users:user_id (display_name, avatar_key)")
    .eq("node_id", nodeId)
    .neq("user_id", ownerId)) as {
    data: EdgeRow[] | null;
    error: { message: string } | null;
  };

  if (error || !data) return [];

  const byUser = new Map<string, CardDetailSharedUser>();
  for (const row of data) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        userId: row.user_id,
        displayName: row.users?.display_name ?? null,
        avatarKey: row.users?.avatar_key ?? null,
      });
    }
  }
  return Array.from(byUser.values());
}

/**
 * Top-level fetch used by the card-detail server action. Returns `null`
 * if the viewer cannot see the node (visibility check is delegated to
 * `getVisibleNodeById`).
 */
export async function getCardDetail(
  userId: string,
  nodeId: string,
  languageCode: string
): Promise<CardDetail | null> {
  const node = await getVisibleNodeById(userId, nodeId);
  if (!node) return null;

  const [tags, ratings, sortCache, sharedWith] = await Promise.all([
    getTagsForNode(nodeId, languageCode).catch(() => [] as TagWithLabel[]),
    getRatingsForNode(nodeId).catch(() => [] as RatingWithUser[]),
    getSortCache(nodeId),
    getSharedWith(nodeId, node.owner_id),
  ]);

  const yourRating = ratings.find((r) => r.userId === userId)?.score ?? null;

  return {
    node,
    tags,
    ratings,
    yourRating,
    sharedWith,
    sortCache,
    isOwner: node.owner_id === userId,
  };
}

/**
 * Update the node title (owner only). Used by the inline title edit in
 * the Card Detail sheet.
 */
export async function updateNodeTitle(
  userId: string,
  nodeId: string,
  title: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.rpc("update_node_title", {
    p_user_id: userId,
    p_node_id: nodeId,
    p_title: title,
  });

  if (error) throw new Error(error.message);
}

/**
 * Best-effort view-count bump for the sort cache. Called when the user
 * opens the Card Detail sheet (PRD §14 meta pills need current counts).
 */
export async function incrementViewCount(nodeId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase.rpc("increment_view_count", { p_node_id: nodeId });
}

/**
 * Return friend ratings for a node (P8-T02, PRD §18.3).
 * Includes ratings by the current user and their friends (mutual friend_invites).
 */
export async function getFriendRatingsForNode(
  nodeId: string,
  userId: string
): Promise<Array<{ userId: string; displayName: string; avatarKey: string | null; score: number; updatedAt: string }>> {
  const supabase = getSupabaseServiceClient();

  type RatingRow = {
    user_id: string;
    display_name: string;
    avatar_key: string | null;
    score: number;
    updated_at: string;
  };

  const { data, error } = await supabase.rpc("get_node_friend_ratings", {
    p_node_id: nodeId,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to fetch friend ratings: ${error.message}`);
  }

  return (data ?? []).map((row: RatingRow) => ({
    userId: row.user_id,
    displayName: row.display_name,
    avatarKey: row.avatar_key,
    score: Number(row.score),
    updatedAt: row.updated_at,
  }));
}
