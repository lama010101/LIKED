import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  REAUTH_STATE_COOKIE,
  REAUTH_STATE_TTL_MS,
  createReauthState,
  getReauthSecret,
} from "@/lib/account/reauth";

/**
 * GET /api/account/reauth/start (PLAN-V2-002 §3.4, P0-20).
 * Owner session required. Sets the signed liked_reauth_state cookie
 * (10 min) and returns the Google authorize URL the client navigates
 * to; the OAuth round trip lands on /callback?next=/api/account/reauth/done.
 */
export async function GET(request: Request) {
  const secret = getReauthSecret();
  if (!secret) {
    return NextResponse.json({ error: "reauth_unavailable" }, { status: 503 });
  }
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const state = createReauthState(user.id);
  if (!state) {
    return NextResponse.json({ error: "reauth_unavailable" }, { status: 503 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : new URL(request.url).origin);
  const redirectTo = `${origin}/callback?next=${encodeURIComponent("/api/account/reauth/done")}`;
  const authorizeUrl =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectTo)}` +
    `&prompt=${encodeURIComponent("select_account consent")}` +
    `&max_age=0`;

  const store = await cookies();
  store.set(REAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(REAUTH_STATE_TTL_MS / 1000),
  });

  return NextResponse.json({ authorizeUrl });
}
