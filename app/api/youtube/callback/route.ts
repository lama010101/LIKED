import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { backfillFriendInvites } from "@/lib/db/friends";
import { logger } from "@/lib/utils/logger";
import { encryptToken } from "@/lib/youtube/token-crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

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

    // --- A5b: persist encrypted tokens to youtube_connections ---

    const accessToken = tokenData.access_token!;
    const encryptedAccessToken = encryptToken(accessToken);
    const tokenExpiresAt = new Date(
      Date.now() + (tokenData.expires_in ?? 3600) * 1000
    ).toISOString();

    // Fetch the Google account email. Under Option B, user.email is the LIKED
    // account (could be email/password or another provider), NOT necessarily
    // the Google account — so we must ask Google directly.
    let googleEmail = user.email ?? "unknown@gmail.com";
    try {
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userinfoRes.ok) {
        const userinfo = (await userinfoRes.json()) as { email?: string };
        if (userinfo.email) googleEmail = userinfo.email;
      } else {
        logger.warn("[youtube/callback] Google userinfo returned non-OK; falling back to user.email");
      }
    } catch {
      logger.warn("[youtube/callback] Google userinfo fetch failed; falling back to user.email");
    }

    // Fetch YouTube channel metadata (enrichment — non-critical path).
    let channelId: string | null = null;
    let channelTitle: string | null = null;
    try {
      const channelsRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (channelsRes.ok) {
        const channelsData = (await channelsRes.json()) as {
          items?: { id: string; snippet?: { title?: string } }[];
        };
        channelId = channelsData.items?.[0]?.id ?? null;
        channelTitle = channelsData.items?.[0]?.snippet?.title ?? null;
      } else {
        logger.warn("[youtube/callback] YouTube channels API returned non-OK; channel metadata will be null");
      }
    } catch {
      logger.warn("[youtube/callback] YouTube channels fetch failed; channel metadata will be null");
    }

    // Build upsert payload. refresh_token is only included when Google
    // returned a new one — omitting it from the payload preserves the existing
    // stored value on re-auth (PostgREST upsert only SETs columns in the payload).
    const upsertPayload: Record<string, unknown> = {
      user_id: user.id,
      google_account_email: googleEmail,
      connected_at: new Date().toISOString(),
      revoked_at: null,
      access_token: encryptedAccessToken,
      token_expires_at: tokenExpiresAt,
      scopes: tokenData.scope?.split(" ") ?? [],
      channel_id: channelId,
      channel_title: channelTitle,
      last_synced_at: null,
      last_sync_error: null,
    };
    if (tokenData.refresh_token) {
      upsertPayload.refresh_token = encryptToken(tokenData.refresh_token);
    }

    const serviceClient = getSupabaseServiceClient();
    const { error: upsertErr } = await serviceClient
      .from("youtube_connections")
      .upsert(upsertPayload as never, { onConflict: "user_id" });

    if (upsertErr) {
      logger.error("[youtube/callback] Failed to upsert YouTube connection:", upsertErr.message);
      return NextResponse.redirect(`${origin}/feed?youtube_error=connection_save_failed`);
    }

    // Backfill any pending friend invites for this user's email.
    if (user.email) {
      try {
        await backfillFriendInvites(user.id, user.email);
      } catch {
        // Non-fatal — invite backfill is a best-effort enhancement.
      }
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube connection failed";
    return NextResponse.redirect(`${origin}/feed?youtube_error=${encodeURIComponent(message)}`);
  }
}
