// POST /api/ask/resolve — paste-link / picked-result resolution
// (PLAN-V2-002 §6.2, P0-11 TMDB + IMDb, P0-12 YouTube video/channel).
//
// The server NEVER fetches a user-supplied URL: it parses the URL against
// an allowlist, then calls the provider with the extracted id. Item rows
// are created only through the class-S upsert_item RPC (T8: a guest can
// never invent a title), and provider data is written server-side only.
//
// YouTube resolve costs 1 quota unit and is metered by yt_budget_consume
// (kind='resolve'); exhaustion answers {status:'busy'} and TMDB keeps
// working (§6.4).

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { readAskJsonBody } from "@/lib/ask/guard";
import { askErrorResponse, mapAskRpcError } from "@/lib/ask/errors";
import { readCookieHeader } from "@/lib/ask/guest";
import { negotiateLocale } from "@/lib/i18n/negotiate";
import { tmdbTagFor } from "@/lib/i18n/languages";
import {
  details,
  findImdbDetails,
  isTmdbTag,
  TmdbError,
  tmdbConfigured,
  TMDB_FRESH_MS,
  type TmdbBaseFacts,
  type TmdbDetails,
  type TmdbTag,
} from "@/lib/tmdb/client";
import { parsePasteUrl } from "@/lib/tmdb/parse";
import {
  fetchYouTubeChannel,
  fetchYouTubeVideo,
  parseYouTubeUrl,
  YouTubeError,
  youtubeConfigured,
  YOUTUBE_FRESH_MS,
  type YouTubeResolved,
} from "@/lib/youtube/serverKey";
import { consumeYouTubeBudget } from "@/lib/youtube/budget";
import {
  hitContributorBucket,
  rateLimited,
  requireGuestAsk,
} from "../_lib/guestRequest";

export const dynamic = "force-dynamic";

const TMDB_LANG_COOKIE = "LIKED_TMDB_LANG";
const YOUTUBE_VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_RE = /^UC[A-Za-z0-9_-]{22}$/;

interface LooseSelectChain {
  eq(column: string, value: string): LooseSelectChain;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
}

interface LooseClient {
  from(table: string): { select(columns: string): LooseSelectChain };
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

interface ItemRow {
  id: string;
  source: string;
  kind: string;
  external_id: string;
  name: string | null;
  release_date: string | null;
  poster_path: string | null;
  thumb_url: string | null;
  fetched_at: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function viewerTag(request: Request): TmdbTag {
  const cookie = readCookieHeader(request.headers, TMDB_LANG_COOKIE);
  if (isTmdbTag(cookie)) return cookie;
  const accept = request.headers.get("accept-language");
  const tag = tmdbTagFor(negotiateLocale(accept), accept);
  return isTmdbTag(tag) ? tag : "en-US";
}

function toItemRow(v: unknown): ItemRow | null {
  const r = asRecord(v);
  if (!r) return null;
  const id = str(r.id);
  const source = str(r.source);
  const kind = str(r.kind);
  const externalId = str(r.external_id);
  if (!id || !source || !kind || !externalId) return null;
  return {
    id,
    source,
    kind,
    external_id: externalId,
    name: str(r.name),
    release_date: str(r.release_date),
    poster_path: str(r.poster_path),
    thumb_url: str(r.thumb_url),
    fetched_at: str(r.fetched_at),
  };
}

function itemResponse(row: ItemRow): NextResponse {
  const yearMatch = row.release_date ? /^(\d{4})/.exec(row.release_date) : null;
  return NextResponse.json({
    item_id: row.id,
    source: row.source,
    kind: row.kind,
    external_id: row.external_id,
    name: row.name,
    year: yearMatch ? Number(yearMatch[1]) : null,
    poster_path: row.poster_path,
    thumb_url: row.thumb_url,
  });
}

function isFresh(fetchedAt: string | null, freshMs: number, now = Date.now()): boolean {
  if (!fetchedAt) return false;
  const t = new Date(fetchedAt).getTime();
  return Number.isFinite(t) && now - t < freshMs;
}

async function findExistingItem(
  client: LooseClient,
  source: "tmdb" | "youtube",
  kind: "movie" | "series" | "video" | "channel",
  externalId: string
): Promise<ItemRow | null> {
  const { data, error } = await client
    .from("items")
    .select("id, source, kind, external_id, name, release_date, poster_path, thumb_url, fetched_at")
    .eq("source", source)
    .eq("kind", kind)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) return null;
  return toItemRow(data);
}

async function upsertItem(
  client: LooseClient,
  source: "tmdb" | "youtube",
  kind: "movie" | "series" | "video" | "channel",
  externalId: string,
  base: TmdbBaseFacts | Record<string, unknown>
): Promise<NextResponse> {
  const { data, error } = await client.rpc("upsert_item", {
    p_source: source,
    p_kind: kind,
    p_external_id: externalId,
    p_base: base,
  });
  if (error) return mapAskRpcError(error);
  const row = toItemRow(data);
  if (!row) return askErrorResponse("ASK_UNAVAILABLE");
  return itemResponse(row);
}

type Target =
  | { provider: "tmdb"; kind: "movie" | "series"; external_id: string }
  | { provider: "imdb"; imdb_id: string }
  | { provider: "youtube"; kind: "video"; external_id: string }
  | { provider: "youtube"; kind: "channel"; external_id: string }
  | { provider: "youtube"; kind: "channel"; handle: string };

function targetFromBody(body: Record<string, unknown>): Target | null {
  const url = str(body.url);
  if (url) {
    const tmdb = parsePasteUrl(url);
    if (tmdb) return tmdb.provider === "tmdb" ? tmdb : { provider: "imdb", imdb_id: tmdb.imdb_id };
    const yt = parseYouTubeUrl(url);
    if (!yt) return null;
    if ("external_id" in yt) {
      return yt.kind === "video"
        ? { provider: "youtube", kind: "video", external_id: yt.external_id }
        : { provider: "youtube", kind: "channel", external_id: yt.external_id };
    }
    return { provider: "youtube", kind: "channel", handle: yt.handle };
  }

  const source = str(body.source);
  const kind = str(body.kind);
  const externalId = str(body.external_id) ?? "";
  if (source === "tmdb") {
    if (kind !== "movie" && kind !== "series") return null;
    if (!/^\d{1,10}$/.test(externalId)) return null;
    return { provider: "tmdb", kind, external_id: externalId };
  }
  if (source === "youtube") {
    if (kind === "video" && YOUTUBE_VIDEO_RE.test(externalId)) {
      return { provider: "youtube", kind: "video", external_id: externalId };
    }
    if (kind === "channel" && YOUTUBE_CHANNEL_RE.test(externalId)) {
      return { provider: "youtube", kind: "channel", external_id: externalId };
    }
    return null;
  }
  return null;
}

async function resolveTmdb(
  client: LooseClient,
  target: Extract<Target, { provider: "tmdb" | "imdb" }>,
  tag: TmdbTag
): Promise<NextResponse> {
  if (!tmdbConfigured()) return askErrorResponse("ASK_UNAVAILABLE");

  let detailsResult: TmdbDetails | null;
  if (target.provider === "imdb") {
    detailsResult = await findImdbDetails(target.imdb_id, tag);
    if (!detailsResult) return askErrorResponse("NOT_FOUND");
  } else {
    const existing = await findExistingItem(client, "tmdb", target.kind, target.external_id);
    if (existing && isFresh(existing.fetched_at, TMDB_FRESH_MS)) return itemResponse(existing);
    detailsResult = await details(target.kind, target.external_id, tag);
  }

  const existing = await findExistingItem(
    client,
    "tmdb",
    detailsResult.result.kind,
    detailsResult.result.external_id
  );
  if (existing && isFresh(existing.fetched_at, TMDB_FRESH_MS)) return itemResponse(existing);

  return upsertItem(
    client,
    "tmdb",
    detailsResult.result.kind,
    detailsResult.result.external_id,
    detailsResult.base
  );
}

async function resolveYouTube(
  client: LooseClient,
  target: Extract<Target, { provider: "youtube" }>
): Promise<NextResponse> {
  if (!youtubeConfigured()) return askErrorResponse("ASK_UNAVAILABLE");

  const knownId = "external_id" in target ? target.external_id : null;
  const kind = target.kind;
  if (knownId) {
    const existing = await findExistingItem(client, "youtube", kind, knownId);
    if (existing && isFresh(existing.fetched_at, YOUTUBE_FRESH_MS)) return itemResponse(existing);
  }

  const allowed = await consumeYouTubeBudget("resolve", null);
  if (!allowed) return NextResponse.json({ status: "busy" });

  let resolved: YouTubeResolved;
  if (target.kind === "video") {
    resolved = await fetchYouTubeVideo(target.external_id);
  } else if ("external_id" in target) {
    resolved = await fetchYouTubeChannel({ id: target.external_id });
  } else {
    resolved = await fetchYouTubeChannel({ handle: target.handle });
  }

  return upsertItem(client, "youtube", resolved.kind, resolved.external_id, {
    ...resolved.base,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guest = await requireGuestAsk(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;

  if (!(await hitContributorBucket("ask_resolve_c", ctx))) {
    return rateLimited("ask_resolve_c");
  }

  const parsed = await readAskJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  if (!body) return askErrorResponse("BAD_REQUEST");

  const target = targetFromBody(body);
  if (!target) {
    return NextResponse.json({ error: "UNSUPPORTED_URL" }, { status: 422 });
  }

  const client = getSupabaseServiceClient() as unknown as LooseClient;
  try {
    if (target.provider === "youtube") {
      return await resolveYouTube(client, target);
    }
    const tag = viewerTag(request);
    return await resolveTmdb(client, target, tag);
  } catch (error) {
    if (error instanceof TmdbError) {
      return error.code === "TMDB_NOT_FOUND"
        ? askErrorResponse("NOT_FOUND")
        : askErrorResponse("ASK_UNAVAILABLE");
    }
    if (error instanceof YouTubeError) {
      return error.code === "YT_NOT_FOUND"
        ? askErrorResponse("NOT_FOUND")
        : askErrorResponse("ASK_UNAVAILABLE");
    }
    return askErrorResponse("ASK_UNAVAILABLE");
  }
}
