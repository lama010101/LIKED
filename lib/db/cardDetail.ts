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

// CLEANUP-E pending: Supabase types are stale for `nodes_sort_cache`
// (missing view_count/share_count). Cast through `AnySupabase` like the
// rest of the lib/db/* files until types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

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
    .neq("user_id", ownerId)) as unknown as {
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

  const { data: node, error: fetchErr } = await supabase
    .from("nodes")
    .select("owner_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (fetchErr) throw new Error(`Failed to fetch node: ${fetchErr.message}`);
  if (!node) throw new Error("Node not found");
  if (node.owner_id !== userId) {
    throw new Error("Only the owner can edit the title");
  }

  const trimmed = title.trim().slice(0, 512);
  if (trimmed.length === 0) throw new Error("Title cannot be empty");

  const { error: updateErr } = await supabase
    .from("nodes")
    .update({ title: trimmed })
    .eq("id", nodeId);
  if (updateErr) throw new Error(`Failed to update title: ${updateErr.message}`);
}

/**
 * Best-effort view-count bump for the sort cache. Called when the user
 * opens the Card Detail sheet (PRD §14 meta pills need current counts).
 */
export async function incrementViewCount(nodeId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  // Ensure a cache row exists, then bump. We avoid an RPC for this simple
  // increment by doing an UPSERT — insert with view_count=1 on first view,
  // otherwise update the existing row.
  const { data: existing } = await supabase
    .from("nodes_sort_cache")
    .select("view_count")
    .eq("node_id", nodeId)
    .maybeSingle();

  if (!existing) {
    await (supabase as AnySupabase)
      .from("nodes_sort_cache")
      .insert({ node_id: nodeId, view_count: 1, share_count: 0 });
    return;
  }

  await (supabase as AnySupabase)
    .from("nodes_sort_cache")
    .update({ view_count: (existing.view_count ?? 0) + 1 })
    .eq("node_id", nodeId);
}
