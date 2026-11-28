// POST /api/ask/claim — guest -> Google claim (PLAN-V2-002 §2.8/§4.5 T9,
// task V2-W9-CLAIM-1128-001). ALL THREE factors are mandatory before any
// class-S work: a signature-valid guest cookie, a Supabase session, and the
// five-minute liked_claim_intent cookie bound to the same contributor. The
// intent token — never client-supplied owner input — selects the Ask link.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { guardAskRequest, readAskJsonBody } from "@/lib/ask/guard";
import { AskError, askErrorResponse, mapAskRpcError } from "@/lib/ask/errors";
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_OPTIONS,
  guestCookieKeys,
  newGuestSecret,
  parseGuestCookieValue,
  secretHashEquals,
  signGuestCookieValue,
  verifyGuestCookieSignature,
} from "@/lib/ask/cookie";
import { guestVerifySecretHash, readCookieHeader } from "@/lib/ask/guest";
import {
  CLAIM_INTENT_COOKIE,
  CLAIM_INTENT_COOKIE_OPTIONS,
  verifyClaimIntentCookieValue,
} from "@/lib/ask/claimIntent";
import { hitIpBucket, rateLimited } from "../_lib/guestRequest";

export const dynamic = "force-dynamic";

interface LooseRpc {
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

interface LooseServiceClient {
  rpc: LooseRpc;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string | boolean): {
        eq(column: string, value: string | boolean): {
          maybeSingle(): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
        };
      };
    };
    update?: never;
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function byteaHex(hash: Buffer): string {
  return "\\x" + hash.toString("hex");
}

function clearIntent(response: NextResponse): void {
  response.cookies.set(CLAIM_INTENT_COOKIE, "", {
    ...CLAIM_INTENT_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

function unauthenticated(): NextResponse {
  return askErrorResponse("NOT_AUTHENTICATED");
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = guardAskRequest(request);
  if (!guard.ok) return guard.response;
  const ctx = guard.ctx;

  const parsed = await readAskJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  if (!body) return askErrorResponse("BAD_REQUEST");
  const bodyToken = typeof body.token === "string" ? body.token.trim() : null;

  // Pure checks first (T2/T9): malformed/forged guest cookies and missing,
  // expired or mis-bound intent cookies never reach the database.
  const rawGuest = readCookieHeader(request.headers, GUEST_COOKIE_NAME);
  const parts = parseGuestCookieValue(rawGuest);
  if (!parts) return unauthenticated();
  const keys = guestCookieKeys(ctx.secrets.cookieSecret, ctx.secrets.cookieSecretPrev);
  if (!verifyGuestCookieSignature(parts, keys)) return unauthenticated();

  const intent = verifyClaimIntentCookieValue(
    readCookieHeader(request.headers, CLAIM_INTENT_COOKIE),
    keys
  );
  if (!intent || intent.contributorId !== parts.contributorId) return unauthenticated();
  if (bodyToken && bodyToken !== intent.askToken) return unauthenticated();

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthenticated();

  // Only a fully authenticated claim attempt consumes the bucket; every auth
  // failure above stays at zero class-S/database calls.
  if (!(await hitIpBucket("ask_session_ip", ctx))) {
    return rateLimited("ask_session_ip");
  }

  const service = getSupabaseServiceClient() as unknown as LooseServiceClient;
  try {
    const storedHash = await guestVerifySecretHash(
      parts.contributorId,
      service as unknown as ReturnType<typeof getSupabaseServiceClient>
    );
    if (!secretHashEquals(storedHash, parts.secret)) return unauthenticated();
  } catch (error) {
    if (error instanceof AskError) return askErrorResponse(error);
    return askErrorResponse("ASK_UNAVAILABLE");
  }

  const askLookup = await service
    .from("asks")
    .select("owner_id,is_active")
    .eq("token", intent.askToken)
    .eq("is_active", true)
    .maybeSingle();
  if (askLookup.error) return askErrorResponse("ASK_UNAVAILABLE");
  const askRow = asRecord(askLookup.data);
  if (!askRow || typeof askRow.owner_id !== "string") {
    return askErrorResponse("ASK_NOT_ACTIVE");
  }

  if (askRow.owner_id === user.id) {
    const response = NextResponse.json({ state: "own_link" });
    clearIntent(response);
    return response;
  }

  const claimed = await service.rpc("claim_guest", {
    p_contributor_id: parts.contributorId,
    p_user_id: user.id,
  });
  if (claimed.error) return mapAskRpcError(claimed.error);
  const result = asRecord(claimed.data);
  const mergedInto = typeof result?.merged_into === "string" ? result.merged_into : null;
  if (!result || !mergedInto) return askErrorResponse("ASK_UNAVAILABLE");

  // §2.8 step 5: rotate the cookie secret for the surviving contributor and
  // issue a fresh cookie. Only the sha256 hash is persisted.
  const rotated = newGuestSecret();
  const rotation = await service.rpc("guest_rotate_secret", {
    p_contributor_id: mergedInto,
    p_secret_hash: byteaHex(rotated.secretHash),
  });
  if (rotation.error) return mapAskRpcError(rotation.error);

  const response = NextResponse.json({
    state: "claimed",
    merged_into: mergedInto,
    moved_recommendations:
      typeof result.moved_recommendations === "number" ? result.moved_recommendations : 0,
    merged_conflicts:
      typeof result.merged_conflicts === "number" ? result.merged_conflicts : 0,
    dropped_self: typeof result.dropped_self === "number" ? result.dropped_self : 0,
  });
  response.cookies.set(
    GUEST_COOKIE_NAME,
    signGuestCookieValue(mergedInto, rotated.secret, ctx.secrets.cookieSecret),
    GUEST_COOKIE_OPTIONS
  );
  clearIntent(response);
  return response;
}
