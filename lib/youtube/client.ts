/**
 * YouTube Data API v3 client helper
 *
 * Auth model: Option A — uses the Google provider_token from the
 * Supabase session (stored when user signs in with Google + YouTube scopes).
 *
 * All YouTube API calls are server-side only. The provider_token is never
 * sent to the client.
 *
 * Ref: docs/Youtube_Activity_Amendment.md §41.6
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeAuthResult {
  ok: boolean;
  accessToken: string | null;
  error?: string;
}

/**
 * Get the Google provider_token (with YouTube scopes) from the Supabase session.
 * Returns null if the user is not authenticated or doesn't have a provider token.
 */
export async function getYouTubeAccessToken(): Promise<YouTubeAuthResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return { ok: false, accessToken: null, error: "Not authenticated" };
    }

    const providerToken = session.provider_token;
    if (!providerToken) {
      return {
        ok: false,
        accessToken: null,
        error: "No YouTube connection. Please connect your YouTube account first.",
      };
    }

    return { ok: true, accessToken: providerToken };
  } catch (err) {
    return {
      ok: false,
      accessToken: null,
      error: (err as Error).message,
    };
  }
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  description: string;
}

export interface YouTubeSubscription {
  id: string;
  title: string;
  thumbnail: string;
  channelId: string;
  subscriberCount: string;
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

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data: YouTubeListResponse<{
    id: string;
    snippet: { title: string; thumbnails: { medium?: { url: string } }; channelTitle: string; channelId: string; description: string };
  }> = await res.json();

  if (!res.ok) {
    return { videos: [], nextPageToken: null, error: data.error?.message ?? `YouTube API error: ${res.status}` };
  }

  const videos: YouTubeVideo[] = (data.items ?? []).map((item) => ({
    id: item.id,
    title: item.snippet?.title ?? "Unknown",
    thumbnail: item.snippet?.thumbnails?.medium?.url ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    channelId: item.snippet?.channelId ?? "",
    description: item.snippet?.description ?? "",
  }));

  return { videos, nextPageToken: data.nextPageToken ?? null };
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

  const res = await fetch(`${YOUTUBE_API_BASE}/videos/rate?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error?.message ?? `YouTube API error: ${res.status}` };
  }

  return { ok: true };
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

  const res = await fetch(`${YOUTUBE_API_BASE}/subscriptions?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data: YouTubeListResponse<{
    id: string;
    snippet: {
      title: string;
      thumbnails: { medium?: { url: string } };
      resourceId: { channelId: string };
    };
  }> = await res.json();

  if (!res.ok) {
    return { subscriptions: [], nextPageToken: null, error: data.error?.message ?? `YouTube API error: ${res.status}` };
  }

  const subscriptions: YouTubeSubscription[] = (data.items ?? []).map((item) => ({
    id: item.id,
    title: item.snippet?.title ?? "Unknown",
    thumbnail: item.snippet?.thumbnails?.medium?.url ?? "",
    channelId: item.snippet?.resourceId?.channelId ?? "",
    subscriberCount: "",
  }));

  return { subscriptions, nextPageToken: data.nextPageToken ?? null };
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

  const res = await fetch(`${YOUTUBE_API_BASE}/subscriptions?${params}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error?.message ?? `YouTube API error: ${res.status}` };
  }

  return { ok: true };
}
