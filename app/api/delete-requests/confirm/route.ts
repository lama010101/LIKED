import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/delete-requests/confirm?t=<token> (PLAN-V2-002 §3.6, P0-20).
 * Proves mailbox ownership: sha256(token) is looked up via the class-S
 * deletion_request_confirm RPC. Always redirects to /delete-account with
 * a generic status — never an oracle.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const t = new URL(request.url).searchParams.get("t") ?? "";
  let status = "invalid";
  if (/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
    const hash = createHash("sha256").update(t, "utf8").digest();
    const client = getSupabaseServiceClient() as never;
    const { data, error } = await (client as {
      rpc: (fn: string, p: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
    }).rpc("deletion_request_confirm", {
      p_token_hash: `\\x${hash.toString("hex")}`,
    });
    if (!error && data === true) status = "confirmed";
  }
  return NextResponse.redirect(`${origin}/delete-account?status=${status}`);
}
