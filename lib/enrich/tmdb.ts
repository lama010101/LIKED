// TMDB provider calls for the enrichment worker (PLAN-V2-002 §6.6, task
// P0-15). Details: GET /{movie|tv}/{id}?language=<tag>&append_to_response=
// videos. Availability: GET /{movie|tv}/{id}/watch/providers (JustWatch),
// Stream/Rent/Buy, no prices, per region. Posters stay hotlinks: only the
// TMDB path text is stored (PRD v2.6 §7).
import type { EnrichmentItem, ProviderResult } from "./types";
import { redactSecrets } from "./redact";

const TMDB_BASE = "https://api.themoviedb.org/3";
// Every provider call is time-boxed (R1): a hung upstream must become a
// retryable error, never a stuck worker. AbortSignal.timeout rejects with
// a TimeoutError DOMException, mapped to 'provider_timeout' below.
export const PROVIDER_TIMEOUT_MS = 8_000;

export interface TmdbDetailsPayload {
  name?: string;
  release_date?: string;
  original_language?: string;
  genres?: string[];
  is_documentary?: boolean;
  overview?: string;
  runtime_min?: number;
  poster_path?: string;
  trailer_url?: string;
  tmdb_rating?: number;
  tmdb_votes?: number;
  localized?: { name?: string; overview?: string; tagline?: string };
}

export interface TmdbAvailabilityRow {
  provider_id: number;
  provider: string;
  offer_type: "flatrate" | "rent" | "buy";
  link?: string;
  logo_key?: string;
}

interface TmdbMedia {
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  genres?: { id: number; name: string }[];
  overview?: string;
  tagline?: string;
  runtime?: number;
  episode_run_time?: number[];
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  videos?: { results?: { key: string; site: string; type: string }[] };
}

function mediaPath(item: EnrichmentItem): string | null {
  if (item.source !== "tmdb") return null;
  if (item.kind === "movie") return "movie";
  if (item.kind === "series") return "tv";
  return null;
}

/** Non-empty string or undefined (never send '' — item_apply_details
 *  treats '' as NULL and COALESCEs it, which is what we want, but a
 *  missing key is cheaper on the wire). */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Map a TMDB details response to the item_apply_details payload. */
export function mapTmdbDetails(data: TmdbMedia): TmdbDetailsPayload {
  const genres = Array.isArray(data.genres) ? data.genres : [];
  const name = str(data.title) ?? str(data.name);
  const overview = str(data.overview);
  const trailer = (data.videos?.results ?? []).find(
    (v) => v.site === "YouTube" && v.type === "Trailer"
  );
  const runtime =
    num(data.runtime) ??
    (Array.isArray(data.episode_run_time) ? num(data.episode_run_time[0]) : undefined);
  return {
    name,
    release_date: str(data.release_date) ?? str(data.first_air_date),
    original_language: str(data.original_language),
    genres: genres.map((g) => `tmdb:${g.id}`),
    is_documentary: genres.some((g) => g.id === 99),
    overview,
    runtime_min: runtime,
    poster_path: str(data.poster_path ?? undefined),
    trailer_url: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : undefined,
    tmdb_rating: num(data.vote_average),
    tmdb_votes: num(data.vote_count),
    localized: { name, overview, tagline: str(data.tagline) },
  };
}

interface TmdbProviders {
  results?: Record<
    string,
    {
      link?: string;
      flatrate?: { provider_id: number; provider_name: string; logo_path?: string }[];
      rent?: { provider_id: number; provider_name: string; logo_path?: string }[];
      buy?: { provider_id: number; provider_name: string; logo_path?: string }[];
    }
  >;
}

/** Map a watch/providers response for one region. A region absent from
 *  `results` means "not available in {region}" — an explicit empty list
 *  (item_apply_availability still writes the fetch marker). */
export function mapTmdbAvailability(
  data: TmdbProviders,
  region: string
): TmdbAvailabilityRow[] {
  const entry = data.results?.[region];
  if (!entry) return [];
  const rows: TmdbAvailabilityRow[] = [];
  for (const offerType of ["flatrate", "rent", "buy"] as const) {
    for (const p of entry[offerType] ?? []) {
      rows.push({
        provider_id: p.provider_id,
        provider: p.provider_name,
        offer_type: offerType,
        link: entry.link,
        logo_key: p.logo_path,
      });
    }
  }
  return rows;
}

async function getJson(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<ProviderResult<unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    const raw = isTimeout
      ? "provider_timeout"
      : `network: ${err instanceof Error ? err.message : "fetch failed"}`;
    return { status: "error", message: redactSecrets(raw, [token]) };
  }
  if (res.status === 404) return { status: "unavailable" };
  if (!res.ok) return { status: "error", message: `tmdb_http_${res.status}` };
  try {
    return { status: "ok", value: await res.json() };
  } catch {
    return { status: "error", message: "tmdb_invalid_json" };
  }
}

export async function fetchTmdbDetails(
  item: EnrichmentItem,
  tag: string,
  opts: { token: string; fetchImpl?: typeof fetch; baseUrl?: string; timeoutMs?: number }
): Promise<ProviderResult<TmdbDetailsPayload>> {
  const media = mediaPath(item);
  if (!media) return { status: "error", message: "unsupported_tmdb_kind" };
  const base = opts.baseUrl ?? TMDB_BASE;
  const url = `${base}/${media}/${encodeURIComponent(item.external_id)}?language=${encodeURIComponent(
    tag
  )}&append_to_response=videos`;
  const res = await getJson(
    url,
    opts.token,
    opts.fetchImpl ?? fetch,
    opts.timeoutMs ?? PROVIDER_TIMEOUT_MS
  );
  if (res.status !== "ok") return res;
  return { status: "ok", value: mapTmdbDetails(res.value as TmdbMedia) };
}

export async function fetchTmdbAvailability(
  item: EnrichmentItem,
  region: string,
  opts: { token: string; fetchImpl?: typeof fetch; baseUrl?: string; timeoutMs?: number }
): Promise<ProviderResult<TmdbAvailabilityRow[]>> {
  const media = mediaPath(item);
  if (!media) return { status: "error", message: "unsupported_tmdb_kind" };
  const base = opts.baseUrl ?? TMDB_BASE;
  const url = `${base}/${media}/${encodeURIComponent(item.external_id)}/watch/providers`;
  const res = await getJson(
    url,
    opts.token,
    opts.fetchImpl ?? fetch,
    opts.timeoutMs ?? PROVIDER_TIMEOUT_MS
  );
  if (res.status !== "ok") return res;
  return { status: "ok", value: mapTmdbAvailability(res.value as TmdbProviders, region) };
}
