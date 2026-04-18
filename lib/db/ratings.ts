/**
 * Rating system database operations
 * P6-T02 implementation placeholder
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";

export interface RatingInput {
  nodeId: string;
  userId: string;
  score: number; // 0-10, step 0.5
}

/**
 * Upsert rating and update cache in same transaction
 * Per PRD §6.7
 */
export async function upsertRating(input: RatingInput): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: Implement per PRD §6.7
  // 1. UPSERT into ratings
  // 2. Recalculate avg_rating for node
  // 3. UPDATE nodes_sort_cache.avg_rating
  // All in ONE atomic transaction
  
  throw new Error("Not implemented - P6-T02");
}

export async function getRatingForNode(
  nodeId: string,
  userId: string
): Promise<number | null> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: Return user's rating for node
  
  throw new Error("Not implemented");
}

export async function getAllRatingsForNode(nodeId: string): Promise<
  { userId: string; score: number }[]
> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: Return all ratings for a node
  
  throw new Error("Not implemented");
}
