// Guarded YouTube guest search (PLAN-V2-002 §6.4, migration-147 contract).
//
// query_key = sha256(normalized query | lang | region) — the same shape
// documented on youtube_search_cache.query_key. A cache hit costs ZERO
// upstream calls and ZERO budget units; a miss consumes yt_budget_consume
// ('search'), calls search.list once and yt_cache_puts the payload with a
// TTL <= 12 h. Budget exhaustion answers {status:'busy'} — TMDB keeps
// working. Upstream 403/429/5xx caches {status:'error'} for 5 minutes so a
// failing provider is not hammered.
//
// All three DB touches go through class-S RPCs on the service client
// (REPO-15/REPO-16): yt_cache_get / yt_cache_put / yt_budget_consume.
// Single-flight per query_key coalesces parallel identical requests so
// they share one budget unit and one upstream call; the DB stays the
// source of truth — the map holds no result state.

import { createHash } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { consumeYouTubeBudget } from "./budget";
import {
  youtubeGet,
  YouTubeError,
  youtubeThumbUrl,
  type YouTubeDeps,
} from "./serverKey";

export const YT_SEARCH_CACHE_TTL_HOURS_DEFAULT = 12;
export const YT_SEARCH_ERROR_TTL_SECONDS = 300;
const MAX_RESULTS = 10;

export function normalizeYouTubeQuery(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

/** sha256(normalized | lang | region) hex — matches the table comment. */
export function youtubeQueryKey(
  normalizedQuery: string,
  lang: string,
  region = "any"
): string {
  return createHash("sha256")
    .update(`${normalizedQuery}|${lang}|${region}`)
    .digest("hex");
}

export interface YouTubeSearchResult {
  source: "youtube";
  kind: "video";
  external_id: string;
  title: string;
  channel: string | null;
  published_at: string | null;
  thumb_url: string | null;
}

export type YouTubeSearchOutcome =
  | { status: "ok"; results: YouTubeSearchResult[] }
  | { status: "busy" };

interface CachePayload {
  status?: unknown;
  results?: unknown;
}

interface LooseRpc {
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

function rpc(client: ServiceClient): LooseRpc {
  return (client as unknown as { rpc: LooseRpc }).rpc.bind(client);
}

async function ytCacheGet(
  client: ServiceClient,
  queryKey: string
): Promise<CachePayload | null> {
  try {
    const { data, error } = await rpc(client)("yt_cache_get", {
      p_query_key: queryKey,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    return data as CachePayload;
  } catch {
    return null;
  }
}

async function ytCachePut(
  client: ServiceClient,
  queryKey: string,
  payload: CachePayload,
  ttlSeconds: number
): Promise<void> {
  try {
    await rpc(client)("yt_cache_put", {
      p_query_key: queryKey,
      p_payload: payload,
      p_ttl_seconds: ttlSeconds,
    });
  } catch {
    // A cache-write failure must never fail the search itself.
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Cache TTL in seconds, capped at 12 h (§6.4 / youtube_search_cache rule). */
export function youtubeSearchTtlSeconds(): number {
  const hours = positiveInt(
    process.env.YT_SEARCH_CACHE_TTL_HOURS,
    YT_SEARCH_CACHE_TTL_HOURS_DEFAULT
  );
  return Math.min(hours * 3600, YT_SEARCH_CACHE_TTL_HOURS_DEFAULT * 3600);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface SearchListItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: unknown;
  };
}

/** Map a search.list payload to our result rows; bad rows are dropped. */
export function mapYouTubeSearchPayload(payload: unknown): YouTubeSearchResult[] {
  const p = asRecord(payload);
  const items = p && Array.isArray(p.items) ? (p.items as SearchListItem[]) : [];
  const out: YouTubeSearchResult[] = [];
  for (const item of items) {
    const videoId = asString(item?.id?.videoId);
    const snippet = item?.snippet;
    const title = asString(snippet?.title);
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title) continue;
    out.push({
      source: "youtube",
      kind: "video",
      external_id: videoId,
      title,
      channel: asString(snippet?.channelTitle),
      published_at: asString(snippet?.publishedAt),
      thumb_url: youtubeThumbUrl(videoId),
    });
  }
  return out;
}

async function fetchAndCache(
  client: ServiceClient,
  queryKey: string,
  normalized: string,
  deps: YouTubeDeps
): Promise<YouTubeSearchOutcome> {
  let payload: unknown;
  try {
    payload = await youtubeGet(
      "/search",
      {
        part: "snippet",
        type: "video",
        maxResults: MAX_RESULTS,
        q: normalized,
      },
      deps
    );
  } catch (error) {
    if (error instanceof YouTubeError && error.code === "YT_NOT_CONFIGURED") {
      throw error;
    }
    // 403/429/5xx and transport failures: cache a short error marker so a
    // broken provider is not hammered, then degrade to busy (§6.4 step 5).
    await ytCachePut(
      client,
      queryKey,
      { status: "error" },
      YT_SEARCH_ERROR_TTL_SECONDS
    );
    return { status: "busy" };
  }
  const results = mapYouTubeSearchPayload(payload);
  await ytCachePut(
    client,
    queryKey,
    { status: "ok", results },
    youtubeSearchTtlSeconds()
  );
  return { status: "ok", results };
}

const inFlight = new Map<string, Promise<YouTubeSearchOutcome>>();

export interface YouTubeSearchOptions {
  contributorId: string;
  lang: string;
  region?: string;
  client?: ServiceClient;
  deps?: YouTubeDeps;
}

/** Guarded YouTube search: cache -> budget -> upstream -> cache put. */
export async function searchYouTube(
  rawQuery: string,
  opts: YouTubeSearchOptions
): Promise<YouTubeSearchOutcome> {
  const normalized = normalizeYouTubeQuery(rawQuery);
  if (!normalized) return { status: "ok", results: [] };

  const client = opts.client ?? getSupabaseServiceClient();
  const queryKey = youtubeQueryKey(normalized, opts.lang, opts.region ?? "any");

  const run = async (): Promise<YouTubeSearchOutcome> => {
    const cached = await ytCacheGet(client, queryKey);
    if (cached) {
      if (cached.status === "error") return { status: "busy" };
      if (cached.status === "ok" && Array.isArray(cached.results)) {
        return {
          status: "ok",
          results: cached.results as YouTubeSearchResult[],
        };
      }
    }
    const allowed = await consumeYouTubeBudget(
      "search",
      opts.contributorId,
      client
    );
    if (!allowed) return { status: "busy" };
    return fetchAndCache(client, queryKey, normalized, opts.deps ?? {});
  };

  const pending = inFlight.get(queryKey);
  if (pending) return pending;
  const promise = run().finally(() => {
    inFlight.delete(queryKey);
  });
  inFlight.set(queryKey, promise);
  return promise;
}
