import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  guardAskRequest,
  readAskJsonBody,
} from "@/lib/ask/guard";
import { rlBucket, rlHit } from "@/lib/ask/rateLimit";
import { hashRlKey } from "@/lib/ask/clientIp";
import { getHumanCheckProvider, honeypotTripped } from "@/lib/ask/humanCheck";

/**
 * POST /api/delete-requests (PLAN-V2-002 §3.6, P0-20).
 * Public deletion-by-email form. Origin/JSON guard + HumanCheck (PoW;
 * Turnstile stays the deny-stub via the shared provider) + rate limits
 * delreq_ip 5/hour/IP and 3/day/address. The response is ALWAYS the same
 * generic body — the form is not an account-existence oracle. The
 * one-time token is random 32 bytes; only its sha256 is stored
 * (deletion_request_create owns the insert + confirm-mail outbox row).
 * Body {action:"challenge"} returns a PoW challenge for the form.
 */
const GENERIC_OK = { ok: true, message: "If an account exists for this address you will receive an email." };

export async function POST(request: Request) {
  const guard = guardAskRequest(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const bodyRes = await readAskJsonBody(request);
  if (!bodyRes.ok) return bodyRes.response;
  const body = bodyRes.body as Record<string, unknown> | null;

  // Challenge issuance for the PoW widget (same provider as /api/ask/*).
  if (body && body.action === "challenge") {
    const provider = getHumanCheckProvider();
    const challenge = provider.issue?.();
    if (!challenge) {
      return NextResponse.json({ error: "ASK_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ challenge });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!email || email.length < 3 || email.length > 254 || !token) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (honeypotTripped(body?.website)) {
    return NextResponse.json(GENERIC_OK);
  }

  // Rate limits BEFORE any DB write: 5/hour/IP (§4.3 delreq_ip) and
  // 3/day/address. Limit hits still get the generic response.
  const ipOk = await rlBucket("delreq_ip", ctx.ipKeyHash);
  const addrKey = hashRlKey("email", email.toLowerCase(), ctx.secrets.rateLimitPepper);
  const addrOk = await rlHit("delreq_addr", addrKey, 86400, 3);
  if (!ipOk || !addrOk) {
    return NextResponse.json(GENERIC_OK, { status: 429 });
  }

  const human = await getHumanCheckProvider().verify(token, {
    pepper: ctx.secrets.rateLimitPepper,
  });
  if (!human) {
    return NextResponse.json({ error: "CAPTCHA_FAILED" }, { status: 403 });
  }

  const confirmToken = randomBytes(32);
  const tokenHash = createHash("sha256").update(confirmToken).digest();
  const origin = new URL(request.url).origin;
  const confirmUrl = `${origin}/api/delete-requests/confirm?t=${confirmToken.toString("base64url")}`;

  const client = getSupabaseServiceClient() as never;
  const { error } = await (client as {
    rpc: (fn: string, p: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  }).rpc("deletion_request_create", {
    p_email: email,
    p_token_hash: `\\x${tokenHash.toString("hex")}`,
    p_ip_hash: ctx.ipKeyHash,
    p_confirm_payload: { confirm_url: confirmUrl },
  });
  if (error) {
    console.error("[delete-requests] create failed:", error.message ?? "rpc failed");
    return NextResponse.json({ error: "ASK_UNAVAILABLE" }, { status: 503 });
  }

  return NextResponse.json(GENERIC_OK);
}
