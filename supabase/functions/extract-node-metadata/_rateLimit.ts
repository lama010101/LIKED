// @ts-nocheck — Deno Edge Function, not part of Node tsc project
// Rate limit + activity log utilities — extracted from extract-node-metadata/index.ts
import type { SupabaseClient } from "./_types.ts";

const RATE_LIMIT_PER_MIN = 30;

export async function overRateLimit(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "metadata_extraction")
    .gte("created_at", since);
  if (error) return false; // fail open — do not punish the caller for our logging bug
  return (count ?? 0) >= RATE_LIMIT_PER_MIN;
}

export async function logInvocation(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      user_id: userId,
      action: "metadata_extraction",
      target_id: null,
      target_type: "node",
      metadata,
    });
  } catch {
    // best-effort
  }
}
