// POST /api/ask/session — guest session mint (PLAN-V2-002 §2.2, P0-13).
// GET  /api/ask/session — issue the PoW challenge the client must solve.
//
// Order (all failures closed):
//   guard (503 without secrets, Origin + JSON on POST, 64 KB cap)
//   -> ask_session_ip 10/h/IP (T6)
//   -> name 2-50, honeypot
//   -> verifyHuman (CAPTCHA_PROVIDER=pow; any other provider is the
//      deny-stub, so Turnstile stays unimplemented and fails closed)
//   -> guest_get_ask (identical 404 for every dead token)
//   -> guest_rename (valid cookie) or guest_create_contributor (new)
//   -> Set-Cookie __Host-liked_guest (HttpOnly; Secure; SameSite=Lax;
//      Path=/; 1 year). No Supabase cookie is ever set here.

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { readAskJsonBody } from "@/lib/ask/guard";
import { askErrorResponse, mapAskRpcError } from "@/lib/ask/errors";
import { resolveGuestIdentity } from "@/lib/ask/guest";
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_OPTIONS,
  newGuestSecret,
  signGuestCookieValue,
} from "@/lib/ask/cookie";
import {
  getHumanCheckProvider,
  honeypotTripped,
  HONEYPOT_FIELD,
  POW_CHALLENGE_TTL_SECONDS,
  POW_DIFFICULTY_BITS,
} from "@/lib/ask/humanCheck";
import {
  askTokenMissResponse,
  fetchActiveAsk,
  rateLimited,
  hitIpBucket,
} from "../_lib/guestRequest";
import { guardAskRequest } from "@/lib/ask/guard";

export const dynamic = "force-dynamic";

const NAME_MIN = 2;
const NAME_MAX = 50;
/** §4.4 "~1 s on mobile": 16 leading-zero bits ≈ 65k hashes. The server
 *  accepts anything up to POW_MAX_DIFFICULTY_BITS, so raising this later
 *  needs no client change. */
function issueDifficultyBits(): number {
  const raw = Number(process.env.POW_ISSUE_DIFFICULTY_BITS);
  return Number.isInteger(raw) && raw > 0 ? Math.min(30, raw) : Math.min(16, POW_DIFFICULTY_BITS);
}

interface LooseRpc {
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function byteaHex(hash: Buffer): string {
  return "\\x" + hash.toString("hex");
}

/** GET — the PoW challenge (provider='pow' only). A deny-stub provider
 *  has no issue step and answers 503 (fail closed, §4.4). */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = guardAskRequest(request);
  if (!guard.ok) return guard.response;
  const provider = getHumanCheckProvider();
  if (typeof provider.issue !== "function") {
    return askErrorResponse("ASK_UNAVAILABLE");
  }
  const difficulty = issueDifficultyBits();
  const challenge = provider.issue({ difficultyBits: difficulty });
  return NextResponse.json({
    provider: "pow",
    challenge,
    difficulty,
    ttl_seconds: POW_CHALLENGE_TTL_SECONDS,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = guardAskRequest(request);
  if (!guard.ok) return guard.response;
  const ctx = guard.ctx;

  if (!(await hitIpBucket("ask_session_ip", ctx))) {
    return rateLimited("ask_session_ip");
  }

  const parsed = await readAskJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  if (!body) return askErrorResponse("BAD_REQUEST");

  const token = str(body.token)?.trim() ?? "";
  const name = str(body.name)?.trim() ?? "";
  const captchaToken = str(body.captchaToken) ?? "";
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return askErrorResponse("FIELD_TOO_LONG");
  }
  if (honeypotTripped(body[HONEYPOT_FIELD])) {
    return askErrorResponse("CAPTCHA_FAILED");
  }
  if (!token) return askTokenMissResponse(ctx);

  const human = await getHumanCheckProvider().verify(captchaToken);
  if (!human) return askErrorResponse("CAPTCHA_FAILED");

  const found = await fetchActiveAsk(token);
  if (!found.ok) {
    if (found.notActive) return askTokenMissResponse(ctx);
    return askErrorResponse("ASK_UNAVAILABLE");
  }

  const client = getSupabaseServiceClient();
  const rpc = (client as unknown as { rpc: LooseRpc }).rpc.bind(client);
  const existing = await resolveGuestIdentity(request, ctx.secrets, client);

  let contributorId: string;
  let secret: string;
  if (existing) {
    // Returning visitor on the same browser: remember the (possibly new)
    // name, bump last_seen_at, re-issue the same secret (rolling cookie).
    const renamed = await rpc("guest_rename", {
      p_contributor_id: existing.contributorId,
      p_name: name,
    });
    if (renamed.error) return mapAskRpcError(renamed.error);
    const touched = await rpc("guest_touch", { p_contributor_id: existing.contributorId });
    if (touched.error) return mapAskRpcError(touched.error);
    contributorId = existing.contributorId;
    secret = existing.secret;
  } else {
    const minted = newGuestSecret();
    const created = await rpc("guest_create_contributor", {
      p_name: name,
      p_secret_hash: byteaHex(minted.secretHash),
    });
    if (created.error) return mapAskRpcError(created.error);
    const id = str(created.data);
    if (!id) return askErrorResponse("ASK_UNAVAILABLE");
    contributorId = id;
    secret = minted.secret;
  }

  const response = NextResponse.json({
    ok: true,
    owner_display_name: found.ask.owner_display_name,
    ask_id: found.ask.ask_id,
  });
  response.cookies.set(
    GUEST_COOKIE_NAME,
    signGuestCookieValue(contributorId, secret, ctx.secrets.cookieSecret),
    GUEST_COOKIE_OPTIONS
  );
  return response;
}
