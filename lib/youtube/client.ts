/**
 * YouTube Data API v3 client helper
 *
 * Auth model: Option B — standalone OAuth. Encrypted tokens are stored in
 * `youtube_connections` and read/refreshed via getStoredYouTubeToken().
 *
 * All YouTube API calls are server-side only. Tokens are never sent to
 * the client.
 *
 * Ref: docs/Youtube_Activity_Amendment.md §41.6
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptToken, decryptToken } from "@/lib/youtube/token-crypto";
import { logger } from "@/lib/utils/logger";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface StoredConnectionRow {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  channel_id: string | null;
  revoked_at: string | null;
}

export interface StoredYouTubeToken {
  accessToken: string;
  channelId: string | null;
}

export type GetStoredTokenResult =
  | { ok: true; token: StoredYouTubeToken }
  | { ok: false; error: "not_connected" | "refresh_failed" | "decrypt_failed"; message: string };

/**
 * Read a user's stored (encrypted) YouTube tokens via the service client,
 * decrypt them, and refresh the access token via Google if it is expired or
 * expiring within 5 minutes. Never throws — always returns a result object.
 */
export async function getStoredYouTubeToken(userId: string): Promise<GetStoredTokenResult> {
  try {
    const supabase = getSupabaseServiceClient();

    // New token columns are not in the generated Database type yet (type regen is a separate task).
    const { data } = await supabase
      .from("youtube_connections")
      .select("access_token, refresh_token, token_expires_at, channel_id, revoked_at")
      .eq("user_id", userId)
      .maybeSingle();
    const row = data as unknown as StoredConnectionRow | null;

    if (!row || row.revoked_at !== null || row.refresh_token === null) {
      return { ok: false, error: "not_connected", message: "No active YouTube connection." };
    }

    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = decryptToken(row.access_token ?? "");
      refreshToken = decryptToken(row.refresh_token);
    } catch {
      return { ok: false, error: "decrypt_failed", message: "Stored YouTube token could not be decrypted." };
    }

    const now = Date.now();
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
    const expiringSoon = expiresAt === null || expiresAt <= now + 5 * 60 * 1000;

    if (!expiringSoon) {
      return { ok: true, token: { accessToken, channelId: row.channel_id } };
    }

    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    let res: Response;
    try {
      res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (err) {
      logger.error("[getStoredYouTubeToken] Google token endpoint request failed:", (err as Error).message);
      return { ok: false, error: "refresh_failed", message: "Failed to refresh YouTube access token. Please reconnect your YouTube account." };
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      logger.error(`[getStoredYouTubeToken] Google token endpoint returned ${res.status}: ${errorBody}`);
      return { ok: false, error: "refresh_failed", message: "Failed to refresh YouTube access token. Please reconnect your YouTube account." };
    }

    let json: { access_token?: string; expires_in?: number; refresh_token?: string };
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: "refresh_failed", message: "Failed to refresh YouTube access token. Please reconnect your YouTube account." };
    }

    if (typeof json.access_token !== "string" || json.access_token.length === 0 || typeof json.expires_in !== "number") {
      logger.error("[getStoredYouTubeToken] refresh response missing access_token or expires_in");
      return { ok: false, error: "refresh_failed", message: "Failed to refresh YouTube access token. Please reconnect your YouTube account." };
    }

    const newAccessToken = json.access_token;
    const newExpiresAt = new Date(now + json.expires_in * 1000).toISOString();

    const update: Record<string, unknown> = {
      access_token: encryptToken(newAccessToken),
      token_expires_at: newExpiresAt,
    };
    if (typeof json.refresh_token === "string" && json.refresh_token.length > 0) {
      update.refresh_token = encryptToken(json.refresh_token);
    }

    const { error: updateErr } = await supabase
      .from("youtube_connections")
      .update(update as never)
      .eq("user_id", userId);

    if (updateErr) {
      logger.error("[getStoredYouTubeToken] failed to persist refreshed token:", updateErr.message);
      return { ok: false, error: "refresh_failed", message: "Failed to refresh YouTube access token. Please reconnect your YouTube account." };
    }

    return { ok: true, token: { accessToken: newAccessToken, channelId: row.channel_id } };
  } catch (err) {
    logger.error("[getStoredYouTubeToken] unexpected error:", (err as Error).message);
    return { ok: false, error: "refresh_failed", message: "Unexpected error retrieving YouTube token." };
  }
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  description: string;
  categoryId: string;
}

export interface YouTubeSubscription {
  id: string;
  title: string;
  thumbnail: string;
  channelId: string;
}

interface YouTubeListResponse<T> {
  items: T[];
  nextPageToken?: string;
  error?: { message: string; code: number };
}

/**
 * Fetch the user's liked videos from YouTube Data API.
 * GET /videos?myRating=like
 */
export async function fetchLikedVideos(
  accessToken: string,
  pageToken?: string
): Promise<{ videos: YouTubeVideo[]; nextPageToken: string | null; error?: string }> {
  const params = new URLSearchParams({
    part: "snippet",
    myRating: "like",
    maxResults: "50",
  });
  if (pageToken) params.set("pageToken", pageToken);

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res
      .json()
      .catch(() => null) as YouTubeListResponse<{
      id: string;
      snippet: { title: string; thumbnails: { medium?: { url: string } }; channelTitle: string; channelId: string; description: string; categoryId: string };
    }> | null;

    if (!res.ok) {
      const apiMsg = data?.error?.message ?? `YouTube API error: ${res.status}`;
      if (res.status === 403) {
        return { videos: [], nextPageToken: null, error: "YouTube API access forbidden. Your connection may have expired — try reconnecting your YouTube account." };
      }
      if (res.status === 429) {
        return { videos: [], nextPageToken: null, error: "YouTube API quota exceeded. Please try again later." };
      }
      return { videos: [], nextPageToken: null, error: apiMsg };
    }

    const videos: YouTubeVideo[] = (data?.items ?? []).map((item) => ({
      id: item.id,
      title: item.snippet?.title ?? "Unknown",
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      channelId: item.snippet?.channelId ?? "",
      description: item.snippet?.description ?? "",
      categoryId: item.snippet?.categoryId ?? "",
    }));

    return { videos, nextPageToken: data?.nextPageToken ?? null };
  } catch {
    return { videos: [], nextPageToken: null, error: "Failed to fetch liked videos. Please check your connection and try again." };
  }
}

/**
 * Unlike a video (remove like rating).
 * POST /videos/rate with rating=none
 */
export async function unlikeVideo(
  accessToken: string,
  videoId: string
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({
    id: videoId,
    rating: "none",
  });

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/videos/rate?${params}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (res.status === 403) {
        return { ok: false, error: "YouTube API access forbidden. Try reconnecting your YouTube account." };
      }
      return { ok: false, error: data?.error?.message ?? `YouTube API error: ${res.status}` };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to unlike video. Please check your connection and try again." };
  }
}

/**
 * Fetch the user's subscriptions from YouTube Data API.
 * GET /subscriptions?mine=true
 */
export async function fetchSubscriptions(
  accessToken: string,
  pageToken?: string
): Promise<{ subscriptions: YouTubeSubscription[]; nextPageToken: string | null; error?: string }> {
  const params = new URLSearchParams({
    part: "snippet",
    mine: "true",
    maxResults: "50",
  });
  if (pageToken) params.set("pageToken", pageToken);

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/subscriptions?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res
      .json()
      .catch(() => null) as YouTubeListResponse<{
      id: string;
      snippet: {
        title: string;
        thumbnails: { medium?: { url: string } };
        resourceId: { channelId: string };
      };
    }> | null;

    if (!res.ok) {
      const apiMsg = data?.error?.message ?? `YouTube API error: ${res.status}`;
      if (res.status === 403) {
        return { subscriptions: [], nextPageToken: null, error: "YouTube API access forbidden. Your connection may have expired — try reconnecting your YouTube account." };
      }
      if (res.status === 429) {
        return { subscriptions: [], nextPageToken: null, error: "YouTube API quota exceeded. Please try again later." };
      }
      return { subscriptions: [], nextPageToken: null, error: apiMsg };
    }

    const subscriptions: YouTubeSubscription[] = (data?.items ?? []).map((item) => ({
      id: item.id,
      title: item.snippet?.title ?? "Unknown",
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? "",
      channelId: item.snippet?.resourceId?.channelId ?? "",
    }));

    return { subscriptions, nextPageToken: data?.nextPageToken ?? null };
  } catch {
    return { subscriptions: [], nextPageToken: null, error: "Failed to fetch subscriptions. Please check your connection and try again." };
  }
}

/**
 * Unsubscribe from a channel.
 * DELETE /subscriptions?id=subscriptionId
 */
export async function unsubscribeFromChannel(
  accessToken: string,
  subscriptionId: string
): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({ id: subscriptionId });

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/subscriptions?${params}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (res.status === 403) {
        return { ok: false, error: "YouTube API access forbidden. Try reconnecting your YouTube account." };
      }
      return { ok: false, error: data?.error?.message ?? `YouTube API error: ${res.status}` };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to unsubscribe. Please check your connection and try again." };
  }
}

/**
 * Fetch the human-readable name for a YouTube video category ID.
 * GET /videoCategories?part=snippet&id=<categoryId>
 *
 * Returns null on any failure (non-fatal — category tag is optional).
 */
/**
 * Search YouTube for videos matching a query.
 * GET /search?part=snippet&type=video&q=... then a single batched
 * GET /videos?part=snippet&id=... to obtain full snippets
 * (description, categoryId, channelId, medium thumbnails) needed by
 * importYouTubeActivity.
 */
export async function searchYouTubeVideos(
  accessToken: string,
  query: string
): Promise<{ videos: YouTubeVideo[]; error?: string }> {
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "10",
    q: query,
  });

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res
      .json()
      .catch(() => null) as {
      items?: { id?: { videoId?: string } }[];
      error?: { message: string; code: number };
    } | null;

    if (!res.ok) {
      if (res.status === 403) {
        return { videos: [], error: "YouTube API access forbidden. Your connection may have expired — try reconnecting your YouTube account." };
      }
      if (res.status === 429) {
        return { videos: [], error: "YouTube API quota exceeded. Please try again later." };
      }
      return { videos: [], error: data?.error?.message ?? `YouTube API error: ${res.status}` };
    }

    const ids = (data?.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return { videos: [] };

    const videosParams = new URLSearchParams({
      part: "snippet",
      id: ids.join(","),
    });
    const vidsRes = await fetch(`${YOUTUBE_API_BASE}/videos?${videosParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const vidsData = await vidsRes
      .json()
      .catch(() => null) as YouTubeListResponse<{
      id: string;
      snippet: { title: string; thumbnails: { medium?: { url: string } }; channelTitle: string; channelId: string; description: string; categoryId: string };
    }> | null;

    if (!vidsRes.ok) {
      const apiMsg = vidsData?.error?.message ?? `YouTube API error: ${vidsRes.status}`;
      return { videos: [], error: apiMsg };
    }

    const videos: YouTubeVideo[] = (vidsData?.items ?? []).map((item) => ({
      id: item.id,
      title: item.snippet?.title ?? "Unknown",
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      channelId: item.snippet?.channelId ?? "",
      description: item.snippet?.description ?? "",
      categoryId: item.snippet?.categoryId ?? "",
    }));

    return { videos };
  } catch {
    return { videos: [], error: "Failed to search YouTube. Please check your connection and try again." };
  }
}

export async function fetchVideoCategoryName(
  accessToken: string,
  categoryId: string
): Promise<string | null> {
  if (!categoryId) return null;

  const params = new URLSearchParams({
    part: "snippet",
    id: categoryId,
  });

  try {
    const res = await fetch(`${YOUTUBE_API_BASE}/videoCategories?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => null) as {
      items?: { snippet: { title: string } }[];
    } | null;

    return data?.items?.[0]?.snippet?.title ?? null;
  } catch {
    return null;
  }
}
