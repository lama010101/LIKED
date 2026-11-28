// YouTube quota budget (PLAN-V2-002 §6.4, task P0-12).
//
// Every server-key YouTube call must first consume budget through the
// class-S yt_budget_consume RPC (migration 143). The RPC is atomic per
// scope and keyed on the Pacific-time day, so parallel requests can never
// exceed a cap. On exhaustion the route answers {status:'busy'} — TMDB
// keeps working (§6.4 step 4).
//
// Limits are env-tunable (§6.4); the RPC defaults are 50 / 5 / 8000 and
// are passed explicitly so the env values are the single source.

import { getSupabaseServiceClient } from "@/lib/supabase/service";

export const YT_SEARCH_DAILY_GLOBAL_DEFAULT = 50;
export const YT_SEARCH_DAILY_PER_CONTRIBUTOR_DEFAULT = 5;
export const YT_UNITS_DAILY_HARD_CAP_DEFAULT = 8_000;

export interface YouTubeBudgetLimits {
  globalSearchLimit: number;
  contributorSearchLimit: number;
  unitsHardCap: number;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function youtubeBudgetLimits(): YouTubeBudgetLimits {
  return {
    globalSearchLimit: positiveInt(
      process.env.YT_SEARCH_DAILY_GLOBAL,
      YT_SEARCH_DAILY_GLOBAL_DEFAULT
    ),
    contributorSearchLimit: positiveInt(
      process.env.YT_SEARCH_DAILY_PER_CONTRIBUTOR,
      YT_SEARCH_DAILY_PER_CONTRIBUTOR_DEFAULT
    ),
    unitsHardCap: positiveInt(
      process.env.YT_UNITS_DAILY_HARD_CAP,
      YT_UNITS_DAILY_HARD_CAP_DEFAULT
    ),
  };
}

export type YouTubeBudgetKind = "search" | "resolve";

interface LooseRpc {
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

/** true = budget consumed and the call may proceed; false = busy.
 *  Any RPC failure fails CLOSED (busy), never unlimited. */
export async function consumeYouTubeBudget(
  kind: YouTubeBudgetKind,
  contributorId: string | null,
  client: ReturnType<typeof getSupabaseServiceClient> = getSupabaseServiceClient(),
  limits: YouTubeBudgetLimits = youtubeBudgetLimits()
): Promise<boolean> {
  if (kind === "search" && !contributorId) return false;
  let data: unknown;
  let error: { message?: string } | null;
  try {
    const rpc = (client as unknown as { rpc: LooseRpc }).rpc.bind(client);
    ({ data, error } = await rpc("yt_budget_consume", {
      p_contributor_id: kind === "search" ? contributorId : null,
      p_kind: kind,
      p_global_search_limit: limits.globalSearchLimit,
      p_contributor_search_limit: limits.contributorSearchLimit,
      p_units_hard_cap: limits.unitsHardCap,
    }));
  } catch {
    return false;
  }
  if (error) return false;
  return !!data && typeof data === "object" && (data as { allowed?: unknown }).allowed === true;
}
