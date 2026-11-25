// Shared guest-request plumbing for /api/ask/* (PLAN-V2-002 §2.12, §4.1).
//
// Every guest route runs the same ladder:
//   guard (fail closed, Origin/JSON, body cap)
//   -> guest cookie (HMAC first: a forged cookie costs ZERO DB calls)
//   -> ask token (guest_get_ask; one identical 404 for every dead token)
//   -> per-contributor / per-IP rate limits (rl_hit)
// Nothing here writes a table: guest_* / submit / receipt / delete are the
// class-S RPCs called through the service client (REPO-15/REPO-16).

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { guardAskRequest, type AskGuardContext } from "@/lib/ask/guard";
import { resolveGuestIdentity } from "@/lib/ask/guest";
import { RATE_LIMITS, rlHit } from "@/lib/ask/rateLimit";
import { hashRlKey } from "@/lib/ask/clientIp";
import { askErrorResponse, mapAskRpcError } from "@/lib/ask/errors";

export const ASK_TOKEN_HEADER = "x-ask-token";

export interface GuestAsk {
  ask_id: string;
  owner_display_name: string;
  owner_avatar_key: string | null;
  prompt: string | null;
  note: string | null;
  liked_genres: number[] | null;
  owner_has_visible_picks: boolean;
}

export interface GuestAskContext extends AskGuardContext {
  contributorId: string;
  token: string;
  ask: GuestAsk;
}

export type GuestAskResult =
  | { ok: true; ctx: GuestAskContext }
  | { ok: false; response: NextResponse };

interface LooseClient {
  rpc: (
    fn: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function numArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((n): n is number => typeof n === "number" && Number.isInteger(n));
}

export function readAskToken(request: Request, url: URL): string {
  const header = request.headers.get(ASK_TOKEN_HEADER)?.trim();
  if (header) return header;
  return (url.searchParams.get("token") ?? "").trim();
}

/** guest_get_ask -> one row or null. ASK_NOT_ACTIVE is the only failure
 *  the caller distinguishes (identical 404, §4.2). */
export async function fetchActiveAsk(
  token: string,
  client: ReturnType<typeof getSupabaseServiceClient> = getSupabaseServiceClient()
): Promise<{ ok: true; ask: GuestAsk } | { ok: false; notActive: boolean }> {
  const { data, error } = await (client as unknown as LooseClient).rpc("guest_get_ask", {
    p_token: token,
  });
  if (error) {
    return { ok: false, notActive: error.message === "ASK_NOT_ACTIVE" };
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = asRecord(rows[0]);
  if (!row) return { ok: false, notActive: true };
  const askId = str(row.ask_id);
  if (!askId) return { ok: false, notActive: true };
  return {
    ok: true,
    ask: {
      ask_id: askId,
      owner_display_name: str(row.owner_display_name) ?? "",
      owner_avatar_key: str(row.owner_avatar_key),
      prompt: str(row.prompt),
      note: str(row.note),
      liked_genres: numArray(row.liked_genres),
      owner_has_visible_picks: row.owner_has_visible_picks === true,
    },
  };
}

/** The enumeration guard (§4.3): count the miss, then 429 past 20/h/IP. */
export async function askTokenMissResponse(ctx: AskGuardContext): Promise<NextResponse> {
  const spec = RATE_LIMITS.ask_token_miss;
  const allowed = await rlHit("ask_token_miss", ctx.ipKeyHash, spec.windowSeconds, spec.limit);
  if (!allowed) {
    return askErrorResponse("RATE_LIMITED", { retryAfterSeconds: spec.windowSeconds });
  }
  return askErrorResponse("ASK_NOT_ACTIVE");
}

export async function requireGuestAsk(request: Request): Promise<GuestAskResult> {
  const guard = guardAskRequest(request);
  if (!guard.ok) return { ok: false, response: guard.response };
  const ctx = guard.ctx;

  const identity = await resolveGuestIdentity(request, ctx.secrets);
  if (!identity) {
    // Forged, tampered or unknown cookie: 401 and NO token lookup.
    return { ok: false, response: askErrorResponse("NOT_AUTHENTICATED") };
  }

  const url = new URL(request.url);
  const token = readAskToken(request, url);
  if (!token) {
    return { ok: false, response: await askTokenMissResponse(ctx) };
  }
  const found = await fetchActiveAsk(token);
  if (!found.ok) {
    if (found.notActive) {
      return { ok: false, response: await askTokenMissResponse(ctx) };
    }
    return { ok: false, response: askErrorResponse("ASK_UNAVAILABLE") };
  }

  return {
    ok: true,
    ctx: { ...ctx, contributorId: identity.contributorId, token, ask: found.ask },
  };
}

/** Cookie-only guest context (delete-me). No ask token is consulted. */
export async function requireGuestCookie(
  request: Request
): Promise<{ ok: true; ctx: AskGuardContext & { contributorId: string } } | { ok: false; response: NextResponse }> {
  const guard = guardAskRequest(request);
  if (!guard.ok) return { ok: false, response: guard.response };
  const identity = await resolveGuestIdentity(request, guard.ctx.secrets);
  if (!identity) return { ok: false, response: askErrorResponse("NOT_AUTHENTICATED") };
  return { ok: true, ctx: { ...guard.ctx, contributorId: identity.contributorId } };
}

/** Per-contributor bucket (§4.3) — key is a peppered hash, never the id. */
export async function hitContributorBucket(
  bucket: "ask_search_c" | "ask_resolve_c" | "ask_submit_c",
  ctx: GuestAskContext
): Promise<boolean> {
  const spec = RATE_LIMITS[bucket];
  const key = hashRlKey("contributor", ctx.contributorId, ctx.secrets.rateLimitPepper);
  return rlHit(bucket, key, spec.windowSeconds, spec.limit);
}

/** Per-IP bucket (§4.3). */
export async function hitIpBucket(
  bucket: "ask_search_ip" | "ask_view" | "ask_session_ip",
  ctx: AskGuardContext
): Promise<boolean> {
  const spec = RATE_LIMITS[bucket];
  return rlHit(bucket, ctx.ipKeyHash, spec.windowSeconds, spec.limit);
}

/** Per-ask-token bucket (§4.3, submit only). */
export async function hitTokenBucket(
  bucket: "ask_submit_token",
  token: string,
  ctx: AskGuardContext
): Promise<boolean> {
  const spec = RATE_LIMITS[bucket];
  const key = hashRlKey("token", token, ctx.secrets.rateLimitPepper);
  return rlHit(bucket, key, spec.windowSeconds, spec.limit);
}

export function rateLimited(bucket: keyof typeof RATE_LIMITS): NextResponse {
  return askErrorResponse("RATE_LIMITED", { retryAfterSeconds: RATE_LIMITS[bucket].windowSeconds });
}

export { mapAskRpcError };
