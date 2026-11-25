import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  REAUTH_PROOF_COOKIE,
  REAUTH_PROOF_TTL_MS,
  REAUTH_STATE_COOKIE,
  createReauthProof,
  verifyReauthState,
} from "@/lib/account/reauth";

/**
 * GET /api/account/reauth/done (PLAN-V2-002 §3.4, P0-20).
 * Reached via /callback?next=/api/account/reauth/done after the Google
 * round trip. The session uid must equal the uid bound into the state
 * cookie — a different Google account means NOTHING is deleted and the
 * user lands on the normal post-login page. On match + fresh state a
 * single-use liked_reauth_proof cookie (5 min) is set.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const store = await cookies();
  const stateToken = store.get(REAUTH_STATE_COOKIE)?.value;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const state = verifyReauthState(stateToken);
  // Wrong account / expired / missing state -> normal post-login page,
  // nothing is deleted, no proof is minted.
  if (!user || !state || state.uid !== user.id) {
    const res = NextResponse.redirect(`${origin}/feed`);
    res.cookies.set(REAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const proof = createReauthProof(user.id);
  if (!proof) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const res = NextResponse.redirect(`${origin}/settings/delete`);
  res.cookies.set(REAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REAUTH_PROOF_COOKIE, proof, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(REAUTH_PROOF_TTL_MS / 1000),
  });
  return res;
}
