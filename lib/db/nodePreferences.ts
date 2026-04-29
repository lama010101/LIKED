/**
 * Custom sort persistence (P7-T02).
 *
 * Stores a per-user, per-scope ordering of nodes used when the sort option
 * is "custom". The scope_key is opaque; callers choose a stable identifier
 * such as "feed:all", "folder:<uuid>", "group:<uuid>".
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Local escape hatch: the `user_node_preferences` table was added in
 * migration 017 but `lib/types/database.ts` has not been regenerated yet.
 * Use a loose `.from(...)` binding here; CLEANUP-E will regenerate types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Replace the full custom ordering for (userId, scopeKey) with the given
 * sequence. Simplest deterministic approach: delete the existing rows for
 * that scope, then insert the new ones with positions 0..n-1.
 *
 * Kept as two statements because the PostgREST client can't easily batch a
 * truncate + insert; acceptable because the write is user-scoped and small.
 */
export async function setCustomOrder(
  userId: string,
  scopeKey: string,
  orderedNodeIds: string[]
): Promise<void> {
  const supabase = getSupabaseServiceClient() as AnySupabase;

  const { error } = await supabase.rpc("set_custom_order", {
    p_user_id: userId,
    p_scope_key: scopeKey,
    p_node_ids: orderedNodeIds,
  });

  if (error) {
    throw new Error(`Failed to persist custom order: ${error.message}`);
  }
}

/**
 * Return ordered node_ids for (userId, scopeKey). Empty array if none set.
 */
export async function getCustomOrder(
  userId: string,
  scopeKey: string
): Promise<string[]> {
  const supabase = getSupabaseServiceClient() as AnySupabase;

  const { data, error } = await supabase
    .from("user_node_preferences")
    .select("node_id, position")
    .eq("user_id", userId)
    .eq("scope_key", scopeKey)
    .order("position", { ascending: true }) as unknown as {
      data: { node_id: string; position: number }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch custom order: ${error.message}`);
  }
  return (data ?? []).map((r) => r.node_id);
}
