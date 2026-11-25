import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { REAUTH_PROOF_COOKIE, verifyReauthProof } from "@/lib/account/reauth";
import { runDeletionPipeline } from "@/lib/account/deletionPipeline";
import { rlHit } from "@/lib/ask/rateLimit";
import { hashRlKey } from "@/lib/ask/clientIp";

/**
 * POST /api/account/delete (PLAN-V2-002 §3.4, P0-20).
 * Requires: session + body {confirmed:true} + a valid single-use
 * liked_reauth_proof cookie for the same uid (<= 5 min). Missing or
 * expired proof -> REAUTH_REQUIRED. On success the proof cookie is
 * cleared (single use), the deletion pipeline runs, the session is
 * signed out and the browser is redirected to /account-deleted.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { confirmed?: unknown }).confirmed !== true
  ) {
    return NextResponse.json({ error: "CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  const store = await cookies();
  const proof = store.get(REAUTH_PROOF_COOKIE)?.value;
  if (!verifyReauthProof(proof, user.id)) {
    return NextResponse.json({ error: "REAUTH_REQUIRED" }, { status: 401 });
  }
  // Single use: burn the proof before the destructive work starts.
  store.set(REAUTH_PROOF_COOKIE, "", { path: "/", maxAge: 0 });

  // acct_delete_user bucket (§4.3/§2.12): 5/hour per user.
  const pepper = process.env.RATE_LIMIT_PEPPER;
  if (pepper) {
    const keyHash = hashRlKey("user", user.id, pepper);
    const allowed = await rlHit("acct_delete_user", keyHash, 3600, 5);
    if (!allowed) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }
  }

  const email = typeof user.email === "string" ? user.email : null;
  const result = await runDeletionPipeline({
    userId: user.id,
    email,
    client: getSupabaseServiceClient() as never,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "DELETION_FAILED", stage: result.stage },
      { status: 500 }
    );
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // session cookies may already be invalid post-delete
  }
  return NextResponse.redirect(new URL("/account-deleted", request.url), 303);
}
