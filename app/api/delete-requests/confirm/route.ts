import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { guardAskRequest, readAskJsonBody } from "@/lib/ask/guard";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * GET /api/delete-requests/confirm?t=<token> only redirects to the
 * two-step confirmation page. It never confirms anything: mail-gateway
 * link scanners must not be able to burn the one-time token.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/delete-account/confirm", url.origin);
  const token = url.searchParams.get("t");
  if (token) target.searchParams.set("t", token);
  return NextResponse.redirect(target, 307);
}

/**
 * POST /api/delete-requests/confirm (PLAN-V2-002 §3.6, P0-20).
 * The browser button posts {token}; the Origin/JSON guard is mandatory.
 * Unknown, expired, already-used and malformed tokens all return the
 * same generic invalid body — never an account/existence oracle.
 */
export async function POST(request: Request) {
  const guard = guardAskRequest(request);
  if (!guard.ok) return guard.response;
  const bodyRes = await readAskJsonBody(request);
  if (!bodyRes.ok) return bodyRes.response;
  const token =
    typeof bodyRes.body === "object" &&
    bodyRes.body !== null &&
    typeof (bodyRes.body as { token?: unknown }).token === "string"
      ? (bodyRes.body as { token: string }).token
      : "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ status: "invalid" });
  }

  const hash = createHash("sha256").update(token, "utf8").digest();
  const client = getSupabaseServiceClient() as never;
  const { data, error } = await (client as {
    rpc: (fn: string, p: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  }).rpc("deletion_request_confirm", {
    p_token_hash: `\\x${hash.toString("hex")}`,
  });
  if (error) {
    return NextResponse.json({ error: "ASK_UNAVAILABLE" }, { status: 503 });
  }
  return NextResponse.json({ status: data === true ? "confirmed" : "invalid" });
}
