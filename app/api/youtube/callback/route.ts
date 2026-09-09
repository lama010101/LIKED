import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { backfillFriendInvites } from "@/lib/db/friends";
import { logger } from "@/lib/utils/logger";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const next = searchParams.get("next") ?? "/youtube";

  if (!code) {
    return NextResponse.redirect(`${origin}/feed`);
  }

  try {
    const cookieStore = await cookies();

    const stateCookie = cookieStore.get("yt_oauth_state")?.value;
    if (!stateCookie) {
      return NextResponse.redirect(`${origin}/feed?youtube_error=missing_state_cookie`);
    }
    if (!state) {
      return NextResponse.redirect(`${origin}/feed?youtube_error=missing_state_param`);
    }
    if (state !== stateCookie) {
      return NextResponse.redirect(`${origin}/feed?youtube_error=state_mismatch`);
    }

    cookieStore.set("yt_oauth_state", "", { path: "/", maxAge: 0 });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/login`);
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      logger.error("[youtube/callback] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env var");
      return NextResponse.redirect(`${origin}/feed?youtube_error=server_misconfigured`);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/youtube/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || tokenData.error) {
      logger.error(
        "[youtube/callback] Google token exchange failed",
        { status: tokenRes.status, error: tokenData.error, error_description: tokenData.error_description }
      );
      return NextResponse.redirect(`${origin}/feed?youtube_error=token_exchange_failed`);
    }

    if (!tokenData.refresh_token) {
      logger.warn("[youtube/callback] No refresh_token returned (expected on re-auth)");
    }

    logger.info("[youtube/callback] OAuth token exchange succeeded", {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    });

    // Backfill any pending friend invites for this user's email.
    if (user.email) {
      try {
        await backfillFriendInvites(user.id, user.email);
      } catch {
        // Non-fatal — invite backfill is a best-effort enhancement.
      }
    }

    return NextResponse.redirect(`${origin}${next}?oauth_step=a5a_success`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube connection failed";
    return NextResponse.redirect(`${origin}/feed?youtube_error=${encodeURIComponent(message)}`);
  }
}
