import { encryptToken } from "@/lib/youtube/token-crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/utils/logger";

/**
 * Persist a Google OAuth grant's YouTube tokens to youtube_connections.
 *
 * Used by the unified signup/login grant (PRD §41.2): when the Supabase
 * Google OAuth session carries provider_token/provider_refresh_token, the
 * YouTube connection is established at signup time — no separate connect
 * step. Mirrors the persistence shape of app/api/youtube/callback/route.ts.
 *
 * Best-effort: throws nothing — failures are logged and swallowed so auth
 * never fails because token persistence did.
 */
export async function persistYouTubeConnectionFromSession(params: {
  userId: string;
  email: string | null;
  providerToken: string;
  providerRefreshToken?: string | null;
  scope?: string | null;
}): Promise<void> {
  const { userId, email, providerToken, providerRefreshToken, scope } = params;
  try {
    // Channel metadata enrichment (non-critical).
    let channelId: string | null = null;
    let channelTitle: string | null = null;
    try {
      const channelsRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${providerToken}` } }
      );
      if (channelsRes.ok) {
        const channelsData = (await channelsRes.json()) as {
          items?: { id: string; snippet?: { title?: string } }[];
        };
        channelId = channelsData.items?.[0]?.id ?? null;
        channelTitle = channelsData.items?.[0]?.snippet?.title ?? null;
      }
    } catch {
      logger.warn("[auth/callback] YouTube channels fetch failed; channel metadata will be null");
    }

    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      // Under the unified grant the Google account IS the LIKED account.
      google_account_email: email ?? "unknown@gmail.com",
      connected_at: new Date().toISOString(),
      revoked_at: null,
      access_token: encryptToken(providerToken),
      // Supabase provider access tokens are ~1h; conservative expiry.
      token_expires_at: new Date(Date.now() + 3500 * 1000).toISOString(),
      scopes: scope?.split(" ") ?? [],
      channel_id: channelId,
      channel_title: channelTitle,
      last_synced_at: null,
      last_sync_error: null,
    };
    if (providerRefreshToken) {
      upsertPayload.refresh_token = encryptToken(providerRefreshToken);
    }

    const serviceClient = getSupabaseServiceClient();
    const { error } = await serviceClient
      .from("youtube_connections")
      .upsert(upsertPayload as never, { onConflict: "user_id" });

    if (error) {
      logger.error("[auth/callback] youtube_connections upsert failed:", error.message);
    }
  } catch (err) {
    logger.error("[auth/callback] persistYouTubeConnectionFromSession error:", err);
  }
}
