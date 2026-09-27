/**
 * Rating system database operations
 * P6-T02 implementation
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { rpc } from "@/lib/db/rpc";

export interface RatingWithUser {
  userId: string;
  score: number;
  displayName: string;
  avatarKey: string | null;
}

/**
 * Validate a rating score: integer 0–100 (MVP2 Q5).
 */
export function validateScore(score: number): void {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("score must be an integer 0-100");
  }
}

/**
 * Upsert the caller's rating and atomically refresh nodes_sort_cache.avg_rating
 * (upsert_rating RPC, migration 118: auth.uid() inside, visibility-gated).
 * Returns the new average.
 */
export async function upsertRating(nodeId: string, score: number): Promise<number | null> {
  validateScore(score);
  return rpc<number | null>("upsert_rating", { p_node_id: nodeId, p_score: score });
}

/**
 * Upsert the caller's independent folder rating (rate_folder RPC).
 */
export async function rateFolder(folderId: string, score: number): Promise<number | null> {
  validateScore(score);
  return rpc<number | null>("rate_folder", { p_folder_id: folderId, p_score: score });
}

/**
 * Return all ratings for a node joined with the rater's profile info.
 */
export async function getRatingsForNode(
  nodeId: string
): Promise<RatingWithUser[]> {
  const supabase = getSupabaseServiceClient();

  type RatingRow = {
    user_id: string;
    score: number;
    users: { display_name: string; avatar_key: string | null } | null;
  };

  const { data, error } = await supabase
    .from("ratings")
    .select("user_id, score, users:user_id (display_name, avatar_key)")
    .eq("node_id", nodeId) as { data: RatingRow[] | null; error: { message: string } | null };

  if (error) {
    throw new Error(`Failed to fetch ratings: ${error.message}`);
  }

  return (data ?? []).map((row: RatingRow) => ({
    userId: row.user_id,
    score: Number(row.score),
    displayName: row.users?.display_name ?? "",
    avatarKey: row.users?.avatar_key ?? null,
  }));
}
