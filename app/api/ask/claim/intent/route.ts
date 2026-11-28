// POST /api/ask/claim/intent — explicit "Continue with Google" click
// (PLAN-V2-002 §2.8/§4.5 T9, task V2-W9-CLAIM-1128-001). The route mints the
// five-minute liked_claim_intent cookie bound to the current guest contributor
// and the validated /r/<token> return path. It does not start OAuth itself:
// the client then uses the existing basic-scope Google sign-in.

import { NextResponse } from "next/server";
import { readAskJsonBody } from "@/lib/ask/guard";
import { askErrorResponse } from "@/lib/ask/errors";
import {
  CLAIM_INTENT_COOKIE,
  CLAIM_INTENT_COOKIE_OPTIONS,
  claimReturnPathForToken,
  createClaimIntentCookieValue,
} from "@/lib/ask/claimIntent";
import {
  askTokenMissResponse,
  fetchActiveAsk,
  hitIpBucket,
  rateLimited,
  requireGuestCookie,
} from "../../_lib/guestRequest";

export const dynamic = "force-dynamic";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const guest = await requireGuestCookie(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;

  if (!(await hitIpBucket("ask_session_ip", ctx))) {
    return rateLimited("ask_session_ip");
  }

  const parsed = await readAskJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  if (!body) return askErrorResponse("BAD_REQUEST");
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const returnPath = claimReturnPathForToken(token);
  if (!returnPath) return askTokenMissResponse(ctx);

  const found = await fetchActiveAsk(token);
  if (!found.ok) {
    if (found.notActive) return askTokenMissResponse(ctx);
    return askErrorResponse("ASK_UNAVAILABLE");
  }

  const value = createClaimIntentCookieValue(
    ctx.contributorId,
    token,
    ctx.secrets.cookieSecret
  );
  if (!value) return askErrorResponse("ASK_UNAVAILABLE");

  const response = NextResponse.json({ ok: true, returnPath });
  response.cookies.set(CLAIM_INTENT_COOKIE, value, CLAIM_INTENT_COOKIE_OPTIONS);
  return response;
}
