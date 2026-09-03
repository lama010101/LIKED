/**
 * Rating system database operations
 * P6-T02 implementation
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";

export interface RatingWithUser {
  userId: string;
  score: number;
  displayName: string;
  avatarKey: string | null;
}

/**
 * Validate a rating score: 0-10 in steps of 0.5.
 */
function validateScore(score: number): void {
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > 10 ||
    (score * 2) % 1 !== 0
  ) {
    throw new Error("score must be 0-10 in steps of 0.5");
  }
}

/**
 * Upsert a rating and atomically refresh nodes_sort_cache.avg_rating.
 * Per PRD §6.7.
 *
 * Delegates to the `upsert_rating` Postgres RPC which performs:
 *   1. INSERT .. ON CONFLICT UPDATE into ratings
 *   2. UPSERT into nodes_sort_cache with recalculated avg_rating
 * in a single atomic transaction.
 */
export async function upsertRating(
  userId: string,
  nodeId: string,
  score: number
): Promise<void> {
  validateScore(score);

  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.rpc("upsert_rating", {
    p_user_id: userId,
    p_node_id: nodeId,
    p_score: score,
  });

  if (error) {
    throw new Error(`Failed to upsert rating: ${error.message}`);
  }
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
