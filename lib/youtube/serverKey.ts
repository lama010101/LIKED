// YouTube server-key access (PLAN-V2-002 §6.4, task P0-12).
//
// The guest flow uses a SERVER API key only — no user OAuth, no stored
// token. YOUTUBE_API_KEY is server-only; it is appended to the upstream
// query by this module and never appears in a log line, an error message
// or a response. Every call here costs quota units: videos.list and
// channels.list = 1 unit (search.list = 100 and is NOT here — the guarded
// search path needs the DB cache, see the P0-12 report note).
//
// Cached YouTube display fields may be kept at most 30 days; refresh at
// 20 (§6.5). Nothing in this module writes to the database.

export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
export const YOUTUBE_TIMEOUT_MS = 8_000;
export const YOUTUBE_FRESH_DAYS = 20;
export const YOUTUBE_FRESH_MS = YOUTUBE_FRESH_DAYS * 24 * 60 * 60 * 1000;
/** videos.list / channels.list quota cost (§6.4). */
export const YOUTUBE_LIST_UNITS = 1;

const YOUTUBE_KEY_MIN_LENGTH = 20;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@?[A-Za-z0-9._-]{3,30}$/;

export type YouTubeErrorCode = "YT_NOT_CONFIGURED" | "YT_UPSTREAM" | "YT_NOT_FOUND";

/** Messages are codes only — the upstream URL (which carries the key)
 *  never reaches a log or a response. */
export class YouTubeError extends Error {
  readonly code: YouTubeErrorCode;
  constructor(code: YouTubeErrorCode) {
    super(code);
    this.name = "YouTubeError";
    this.code = code;
  }
}

export function getYouTubeApiKey(): string | null {
  const v = process.env.YOUTUBE_API_KEY?.trim();
  return v && v.length >= YOUTUBE_KEY_MIN_LENGTH ? v : null;
}

export function youtubeConfigured(): boolean {
  return getYouTubeApiKey() !== null;
}

export interface YouTubeDeps {
  /** Explicit key (tests). `undefined` = env; `null` = not configured. */
  key?: string | null;
  fetchImpl?: typeof fetch;
}

export async function youtubeGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  deps: YouTubeDeps = {}
): Promise<T> {
  const key = deps.key === undefined ? getYouTubeApiKey() : deps.key;
  if (!key) throw new YouTubeError("YT_NOT_CONFIGURED");
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  url.searchParams.set("key", key);
  const f = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new YouTubeError("YT_UPSTREAM");
  }
  if (res.status === 404) throw new YouTubeError("YT_NOT_FOUND");
  if (!res.ok) throw new YouTubeError("YT_UPSTREAM");
  try {
    return (await res.json()) as T;
  } catch {
    throw new YouTubeError("YT_UPSTREAM");
  }
}

export type ParsedYouTubeTarget =
  | { kind: "video"; external_id: string }
  | { kind: "channel"; external_id: string }
  | { kind: "channel"; handle: string };

/** Allowlist parse of a pasted YouTube URL (§6.2 table). `/c/<name>`
 *  custom URLs are not resolvable through the API -> null (422). */
export function parseYouTubeUrl(raw: string): ParsedYouTubeTarget | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const path = url.pathname;

  if (host === "youtu.be") {
    const id = path.replace(/^\//, "").split("/")[0];
    return VIDEO_ID_RE.test(id) ? { kind: "video", external_id: id } : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  if (path === "/watch") {
    const v = url.searchParams.get("v") ?? "";
    return VIDEO_ID_RE.test(v) ? { kind: "video", external_id: v } : null;
  }
  const videoPath = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(path);
  if (videoPath) return { kind: "video", external_id: videoPath[1] };

  const channelPath = /^\/channel\/(UC[A-Za-z0-9_-]{22})(?:\/|$)/.exec(path);
  if (channelPath) return { kind: "channel", external_id: channelPath[1] };

  const handlePath = /^\/@([A-Za-z0-9._-]{3,30})(?:\/|$)/.exec(path);
  if (handlePath) {
    const handle = `@${handlePath[1]}`;
    return HANDLE_RE.test(handle) ? { kind: "channel", handle } : null;
  }
  return null;
}

/** Video thumbnails are derived from the id — never stored (§6.5). */
export function youtubeThumbUrl(videoId: string): string | null {
  return VIDEO_ID_RE.test(videoId)
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;
}

export interface YouTubeBaseFacts {
  name: string | null;
  release_date: string | null;
  thumb_url: string | null;
  creator_id: string | null;
  creator_name: string | null;
}

export interface YouTubeResolved {
  source: "youtube";
  kind: "video" | "channel";
  external_id: string;
  title: string;
  year: number | null;
  thumb_url: string | null;
  base: YouTubeBaseFacts;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function firstItem(payload: unknown): Record<string, unknown> | null {
  const p = asRecord(payload);
  const items = p && Array.isArray(p.items) ? p.items : [];
  const first = items[0];
  return asRecord(first);
}

function yearOf(date: string | null): number | null {
  if (!date) return null;
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(date);
  return m ? Number(m[1]) : null;
}

function httpsOrNull(v: string | null): string | null {
  return v && /^https:\/\//.test(v) ? v : null;
}

/** videos.list?part=snippet&id=<id> — 1 quota unit. */
export async function fetchYouTubeVideo(
  videoId: string,
  deps: YouTubeDeps = {}
): Promise<YouTubeResolved> {
  if (!VIDEO_ID_RE.test(videoId)) throw new YouTubeError("YT_NOT_FOUND");
  const item = firstItem(
    await youtubeGet("/videos", { part: "snippet", id: videoId, maxResults: 1 }, deps)
  );
  const snippet = item ? asRecord(item.snippet) : null;
  const title = snippet ? asString(snippet.title) : null;
  if (!item || !snippet || !title) throw new YouTubeError("YT_NOT_FOUND");
  const published = asString(snippet.publishedAt);
  const releaseDate = published && /^\d{4}-\d{2}-\d{2}/.test(published)
    ? published.slice(0, 10)
    : null;
  const channelId = asString(snippet.channelId);
  const channelTitle = asString(snippet.channelTitle);
  const base: YouTubeBaseFacts = {
    name: title,
    release_date: releaseDate,
    thumb_url: null, // derived from the id at render time
    creator_id: channelId,
    creator_name: channelTitle,
  };
  return {
    source: "youtube",
    kind: "video",
    external_id: videoId,
    title,
    year: yearOf(releaseDate),
    thumb_url: youtubeThumbUrl(videoId),
    base,
  };
}

/** channels.list?part=snippet&id=UC… | forHandle=@… — 1 quota unit. */
export async function fetchYouTubeChannel(
  target: { id: string } | { handle: string },
  deps: YouTubeDeps = {}
): Promise<YouTubeResolved> {
  const params: Record<string, string | number | undefined> = {
    part: "snippet",
    maxResults: 1,
  };
  if ("id" in target) {
    if (!CHANNEL_ID_RE.test(target.id)) throw new YouTubeError("YT_NOT_FOUND");
    params.id = target.id;
  } else {
    if (!HANDLE_RE.test(target.handle)) throw new YouTubeError("YT_NOT_FOUND");
    params.forHandle = target.handle;
  }
  const item = firstItem(await youtubeGet("/channels", params, deps));
  const snippet = item ? asRecord(item.snippet) : null;
  const title = snippet ? asString(snippet.title) : null;
  const channelId = item ? asString(item.id) : null;
  if (!item || !snippet || !title || !channelId) throw new YouTubeError("YT_NOT_FOUND");
  const thumbs = asRecord(snippet.thumbnails);
  const high = thumbs ? asRecord(thumbs.high) : null;
  const medium = thumbs ? asRecord(thumbs.medium) : null;
  const thumb = httpsOrNull(
    (high ? asString(high.url) : null) ?? (medium ? asString(medium.url) : null)
  );
  const base: YouTubeBaseFacts = {
    name: title,
    release_date: null,
    thumb_url: thumb,
    creator_id: channelId,
    creator_name: title,
  };
  return {
    source: "youtube",
    kind: "channel",
    external_id: channelId,
    title,
    year: null,
    thumb_url: thumb,
    base,
  };
}
