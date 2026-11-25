// YouTube provider calls for the enrichment worker (PLAN-V2-002 §6.6,
// task P0-15). Display data is cached ≤ 30 days and refreshed/deleted by
// the housekeeping cron; the video id itself is kept indefinitely. Video
// thumbnails are derived from the id (i.ytimg.com), never stored.
import type { EnrichmentItem, ProviderResult } from "./types";
import { PROVIDER_TIMEOUT_MS } from "./tmdb";
import { redactSecrets } from "./redact";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

export interface YoutubeDetailsPayload {
  name?: string;
  release_date?: string;
  original_language?: string;
  creator_id?: string;
  creator_name?: string;
  thumb_url?: string;
  localized?: { name?: string };
}

interface YtSnippet {
  title?: string;
  publishedAt?: string;
  channelId?: string;
  channelTitle?: string;
  defaultAudioLanguage?: string;
  thumbnails?: { high?: { url?: string }; default?: { url?: string } };
}

interface YtListResponse {
  items?: { id: string; snippet?: YtSnippet }[];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Map one videos.list/channels.list item to the item_apply_details
 *  payload. `kind` decides which identity fields apply. */
export function mapYoutubeDetails(
  kind: EnrichmentItem["kind"],
  data: { id: string; snippet?: YtSnippet }
): YoutubeDetailsPayload {
  const s = data.snippet ?? {};
  const name = str(s.title);
  const published = str(s.publishedAt);
  if (kind === "channel") {
    return {
      name,
      release_date: published ? published.slice(0, 10) : undefined,
      creator_id: data.id,
      creator_name: name,
      thumb_url: str(s.thumbnails?.high?.url) ?? str(s.thumbnails?.default?.url),
      localized: { name },
    };
  }
  return {
    name,
    release_date: published ? published.slice(0, 10) : undefined,
    original_language: str(s.defaultAudioLanguage),
    creator_id: str(s.channelId),
    creator_name: str(s.channelTitle),
    localized: { name },
  };
}

export async function fetchYoutubeDetails(
  item: EnrichmentItem,
  opts: { key: string; fetchImpl?: typeof fetch; baseUrl?: string; timeoutMs?: number }
): Promise<ProviderResult<YoutubeDetailsPayload>> {
  const isChannel = item.kind === "channel";
  if (item.source !== "youtube" || (!isChannel && item.kind !== "video")) {
    return { status: "error", message: "unsupported_youtube_kind" };
  }
  const base = opts.baseUrl ?? YT_BASE;
  const params = new URLSearchParams({
    part: "snippet",
    id: item.external_id,
    key: opts.key,
  });
  const url = `${base}/${isChannel ? "channels" : "videos"}?${params.toString()}`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    const raw = isTimeout
      ? "provider_timeout"
      : `network: ${err instanceof Error ? err.message : "fetch failed"}`;
    return { status: "error", message: redactSecrets(raw, [opts.key]) };
  }
  if (res.status === 404) return { status: "unavailable" };
  if (!res.ok) return { status: "error", message: `youtube_http_${res.status}` };
  let body: YtListResponse;
  try {
    body = (await res.json()) as YtListResponse;
  } catch {
    return { status: "error", message: "youtube_invalid_json" };
  }
  const first = body.items?.[0];
  // Deleted/private video or unknown channel: the API answers 200 with an
  // empty list. That is an explicit "unavailable", not a retry.
  if (!first) return { status: "unavailable" };
  return { status: "ok", value: mapYoutubeDetails(item.kind, first) };
}
