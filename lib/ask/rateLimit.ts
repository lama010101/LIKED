// DB-backed rate limiting (PLAN-V2-002 §4.3, §2.11, task P0-08).
// Every /api/ask/* bucket goes through the class-S rl_hit RPC via the
// service client — serverless has no shared memory (migration 143).
// On a limit hit the route answers 429 + Retry-After; nothing is written
// by the route itself.
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { AskError } from "./errors";

/** §4.3 bucket table: window seconds + limit. */
export const RATE_LIMITS = {
  ask_view: { windowSeconds: 600, limit: 120 }, // landing/receipt/picks scraping
  ask_token_miss: { windowSeconds: 3600, limit: 20 }, // token enumeration (ASK_NOT_ACTIVE only)
  ask_session_ip: { windowSeconds: 3600, limit: 10 }, // cookie-minting floods
  ask_search_c: { windowSeconds: 60, limit: 30 }, // per contributor
  ask_search_ip: { windowSeconds: 60, limit: 60 }, // per IP
  ask_resolve_c: { windowSeconds: 60, limit: 30 }, // per contributor
  ask_submit_c: { windowSeconds: 3600, limit: 10 }, // per contributor
  ask_submit_token: { windowSeconds: 3600, limit: 300 }, // per ask token
  delreq_ip: { windowSeconds: 3600, limit: 5 }, // public deletion form
  acct_delete_user: { windowSeconds: 3600, limit: 5 }, // re-auth/delete endpoints
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

type LooseRpc = (
  fn: string,
  params: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** One atomic hit. Returns true while hits <= limit (rl_hit semantics,
 *  migration 143). An RPC failure fails closed: the request is denied
 *  (ASK_UNAVAILABLE → 503) rather than silently unlimited. */
export async function rlHit(
  bucket: string,
  keyHash: string,
  windowSeconds: number,
  limit: number,
  client: ReturnType<typeof getSupabaseServiceClient> = getSupabaseServiceClient()
): Promise<boolean> {
  const { data, error } = await (client as unknown as { rpc: LooseRpc }).rpc(
    "rl_hit",
    {
      p_bucket: bucket,
      p_key_hash: keyHash,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    }
  );
  if (error) throw new AskError("ASK_UNAVAILABLE");
  return data === true;
}

/** Convenience wrapper using the §4.3 table values for a named bucket. */
export async function rlBucket(
  bucket: RateLimitBucket,
  keyHash: string,
  client: ReturnType<typeof getSupabaseServiceClient> = getSupabaseServiceClient()
): Promise<boolean> {
  const spec = RATE_LIMITS[bucket];
  return rlHit(bucket, keyHash, spec.windowSeconds, spec.limit, client);
}
