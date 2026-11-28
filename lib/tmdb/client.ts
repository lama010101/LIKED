// TMDB server client (PLAN-V2-002 §6.1–§6.3, task P0-11).
//
// Server-only. TMDB_API_READ_ACCESS_TOKEN is a v4 read token and must
// never be prefixed NEXT_PUBLIC_ nor read from a client component: every
// import of this module is a server module (route handler / script).
// Nothing here writes to the database — search results are not stored,
// and resolve persists through the class-S upsert_item RPC (REPO-15).
//
// Posters are hotlinks: the TMDB `poster_path` text is kept and rendered
// as https://image.tmdb.org/t/p/<size><path> (PRD v2.6 §7). No bytes are
// copied or proxied.

export const TMDB_API_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export const TMDB_TIMEOUT_MS = 8_000;
/** TMDB data may be cached at most 6 months; refresh at 5 (§6.5). */
export const TMDB_FRESH_DAYS = 150;
export const TMDB_FRESH_MS = TMDB_FRESH_DAYS * 24 * 60 * 60 * 1000;
/** Tags accepted for items.localized / guest_get_receipt (§2.4, §6.3). */
export const TMDB_TAGS = ["en-US", "fr-FR", "es-ES", "es-MX", "th-TH"] as const;
export type TmdbTag = (typeof TMDB_TAGS)[number];

const TMDB_TOKEN_MIN_LENGTH = 20;
const POSTER_PATH_RE = /^\/[A-Za-z0-9._-]+$/;

export type TmdbErrorCode =
  | "TMDB_NOT_CONFIGURED"
  | "TMDB_NOT_FOUND"
  | "TMDB_UPSTREAM"
  | "TMDB_BAD_RESPONSE";

/** Error messages are the CODE only — a URL (which carries no token, but
 *  still) never reaches logs or a client response. */
export class TmdbError extends Error {
  readonly code: TmdbErrorCode;
  constructor(code: TmdbErrorCode) {
    super(code);
    this.name = "TmdbError";
    this.code = code;
  }
}

export function getTmdbToken(): string | null {
  const v = process.env.TMDB_API_READ_ACCESS_TOKEN?.trim();
  return v && v.length >= TMDB_TOKEN_MIN_LENGTH ? v : null;
}

export function tmdbConfigured(): boolean {
  return getTmdbToken() !== null;
}

export interface TmdbDeps {
  /** Explicit token (tests). `undefined` = read env; `null` = not configured. */
  token?: string | null;
  fetchImpl?: typeof fetch;
}

export async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  deps: TmdbDeps = {}
): Promise<T> {
  const token = deps.token === undefined ? getTmdbToken() : deps.token;
  if (!token) throw new TmdbError("TMDB_NOT_CONFIGURED");
  const url = new URL(`${TMDB_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const f = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new TmdbError("TMDB_UPSTREAM");
  }
  if (res.status === 404) throw new TmdbError("TMDB_NOT_FOUND");
  if (!res.ok) throw new TmdbError("TMDB_UPSTREAM");
  try {
    return (await res.json()) as T;
  } catch {
    throw new TmdbError("TMDB_BAD_RESPONSE");
  }
}

export function isTmdbTag(value: string | null | undefined): value is TmdbTag {
  return !!value && (TMDB_TAGS as readonly string[]).includes(value);
}

/** `https://image.tmdb.org/t/p/<size><poster_path>` — null when absent or
 *  malformed (items.poster_path has the same CHECK, §1.4). */
export function posterUrl(
  path: string | null | undefined,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "original" = "w342"
): string | null {
  if (!path || !POSTER_PATH_RE.test(path)) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export interface TmdbSearchResult {
  source: "tmdb";
  kind: "movie" | "series";
  external_id: string;
  title: string;
  year: number | null;
  poster_path: string | null;
  vote_average: number | null;
}

export interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function yearOf(date: string | null): number | null {
  if (!date) return null;
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(date);
  return m ? Number(m[1]) : null;
}

/** One /search/multi row -> our result shape. Persons, adult entries and
 *  rows without a usable title are dropped (never rendered blank). */
export function mapSearchItem(raw: unknown): TmdbSearchResult | null {
  const r = asRecord(raw);
  if (!r) return null;
  const media = r.media_type;
  if (media !== "movie" && media !== "tv") return null;
  if (r.adult === true) return null;
  const id = r.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  const title = media === "movie" ? asString(r.title) : asString(r.name);
  if (!title) return null;
  const date = media === "movie" ? asString(r.release_date) : asString(r.first_air_date);
  const poster = asString(r.poster_path);
  return {
    source: "tmdb",
    kind: media === "movie" ? "movie" : "series",
    external_id: String(id),
    title,
    year: yearOf(date),
    poster_path: poster && POSTER_PATH_RE.test(poster) ? poster : null,
    vote_average: asNumber(r.vote_average),
  };
}

/** GET /search/multi — movies + series in the viewer's tag (§6.2). */
export async function searchMulti(
  query: string,
  tag: TmdbTag,
  deps: TmdbDeps = {}
): Promise<TmdbSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const payload = await tmdbGet<{ results?: unknown[] }>(
    "/search/multi",
    { query: q, include_adult: "false", language: tag, page: 1 },
    deps
  );
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const out: TmdbSearchResult[] = [];
  for (const row of rows) {
    const mapped = mapSearchItem(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** GET /find/<imdb>?external_source=imdb_id — first movie else first TV.
 *  The /find payload is a details-shaped object (plus `genre_ids`), so one
 *  call is enough to upsert the item (§6.2 resolve table). */
export async function findImdbDetails(
  imdbId: string,
  tag: TmdbTag,
  deps: TmdbDeps = {}
): Promise<TmdbDetails | null> {
  if (!/^tt\d{7,10}$/.test(imdbId)) return null;
  const payload = await tmdbGet<{
    movie_results?: unknown[];
    tv_results?: unknown[];
  }>("/find/" + imdbId, { external_source: "imdb_id", language: tag }, deps);
  const movie = Array.isArray(payload?.movie_results) ? payload.movie_results[0] : null;
  if (movie) return detailsFromFind(movie, "movie");
  const tv = Array.isArray(payload?.tv_results) ? payload.tv_results[0] : null;
  if (tv) return detailsFromFind(tv, "series");
  return null;
}

function detailsFromFind(raw: unknown, kind: "movie" | "series"): TmdbDetails | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = asNumber(r.id);
  const title =
    kind === "movie"
      ? asString(r.title) ?? asString(r.original_title)
      : asString(r.name) ?? asString(r.original_name);
  if (id === null || id <= 0 || !title) return null;
  const date = kind === "movie" ? asString(r.release_date) : asString(r.first_air_date);
  const genreIds = Array.isArray(r.genre_ids) ? r.genre_ids : [];
  const genres: string[] = [];
  let documentary = false;
  for (const g of genreIds) {
    const idNum = asNumber(g);
    if (idNum === null) continue;
    if (idNum === 99) documentary = true;
    genres.push(`tmdb:${idNum}`);
  }
  const poster = asString(r.poster_path);
  const base: TmdbBaseFacts = {
    name: title,
    release_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    original_language: asString(r.original_language),
    genres,
    is_documentary: documentary,
    overview: asString(r.overview),
    runtime_min: null,
    poster_path: poster && POSTER_PATH_RE.test(poster) ? poster : null,
    tmdb_rating: asNumber(r.vote_average),
    tmdb_votes: asNumber(r.vote_count),
    trailer_url: null,
  };
  return {
    result: {
      source: "tmdb",
      kind,
      external_id: String(id),
      title,
      year: yearOf(base.release_date),
      poster_path: base.poster_path,
      vote_average: base.tmdb_rating,
    },
    base,
  };
}

export interface TmdbBaseFacts {
  name: string | null;
  release_date: string | null;
  original_language: string | null;
  genres: string[];
  is_documentary: boolean;
  overview: string | null;
  runtime_min: number | null;
  poster_path: string | null;
  tmdb_rating: number | null;
  tmdb_votes: number | null;
  trailer_url: string | null;
}

/** /movie|tv/<id> payload -> the upsert_item p_base whitelist (§2.11). */
export function toBaseFacts(raw: unknown, kind: "movie" | "series"): TmdbBaseFacts {
  const r = asRecord(raw) ?? {};
  const title =
    kind === "movie"
      ? asString(r.title) ?? asString(r.original_title)
      : asString(r.name) ?? asString(r.original_name);
  const date =
    kind === "movie" ? asString(r.release_date) : asString(r.first_air_date);
  const genreRows = Array.isArray(r.genres) ? r.genres : [];
  const genres: string[] = [];
  let documentary = false;
  for (const g of genreRows) {
    const gr = asRecord(g);
    const id = gr ? asNumber(gr.id) : null;
    if (id === null) continue;
    if (id === 99) documentary = true;
    genres.push(`tmdb:${id}`);
  }
  const runtime =
    kind === "movie"
      ? asNumber(r.runtime)
      : Array.isArray(r.episode_run_time)
        ? asNumber(r.episode_run_time[0])
        : null;
  const trailer = pickTrailer(r.videos);
  const poster = asString(r.poster_path);
  return {
    name: title,
    release_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    original_language: asString(r.original_language),
    genres,
    is_documentary: documentary,
    overview: asString(r.overview),
    runtime_min: runtime !== null && runtime >= 0 ? Math.round(runtime) : null,
    poster_path: poster && POSTER_PATH_RE.test(poster) ? poster : null,
    tmdb_rating:
      asNumber(r.vote_average) !== null
        ? Math.min(10, Math.max(0, asNumber(r.vote_average) as number))
        : null,
    tmdb_votes: asNumber(r.vote_count),
    trailer_url: trailer,
  };
}

function pickTrailer(videos: unknown): string | null {
  const v = asRecord(videos);
  const rows = v && Array.isArray(v.results) ? v.results : [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    if (r.site !== "YouTube" || r.type !== "Trailer") continue;
    const key = asString(r.key);
    if (key && /^[A-Za-z0-9_-]{11}$/.test(key)) {
      return `https://www.youtube.com/watch?v=${key}`;
    }
  }
  return null;
}

export interface TmdbDetails {
  result: TmdbSearchResult;
  base: TmdbBaseFacts;
}

/** GET /movie|tv/<id>?language=&append_to_response=videos (§6.2 resolve). */
export async function details(
  kind: "movie" | "series",
  id: string,
  tag: TmdbTag,
  deps: TmdbDeps = {}
): Promise<TmdbDetails> {
  if (!/^\d{1,10}$/.test(id)) throw new TmdbError("TMDB_NOT_FOUND");
  const media = kind === "movie" ? "movie" : "tv";
  const payload = await tmdbGet<Record<string, unknown>>(
    `/${media}/${id}`,
    { language: tag, append_to_response: "videos", include_image_language: `${tag},en,null` },
    deps
  );
  const base = toBaseFacts(payload, kind);
  if (!base.name) throw new TmdbError("TMDB_BAD_RESPONSE");
  return {
    result: {
      source: "tmdb",
      kind,
      external_id: id,
      title: base.name,
      year: yearOf(base.release_date),
      poster_path: base.poster_path,
      vote_average: base.tmdb_rating,
    },
    base,
  };
}

export interface TmdbGenre {
  id: number;
  name: string;
}

/** GET /genre/<media>/list?language=<tag> — the genre catalog (§6.3). */
export async function tmdbGenres(
  media: "movie" | "tv",
  tag: TmdbTag,
  deps: TmdbDeps = {}
): Promise<TmdbGenre[]> {
  const payload = await tmdbGet<{ genres?: unknown[] }>(
    `/genre/${media}/list`,
    { language: tag },
    deps
  );
  const rows = Array.isArray(payload?.genres) ? payload.genres : [];
  const out: TmdbGenre[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    const id = r ? asNumber(r.id) : null;
    const name = r ? asString(r.name) : null;
    if (id === null || !name) continue;
    out.push({ id, name });
  }
  return out;
}

/** GET /configuration/primary_translations — live tag guard (§6.3). */
export async function primaryTranslations(deps: TmdbDeps = {}): Promise<string[]> {
  const payload = await tmdbGet<unknown>("/configuration/primary_translations", {}, deps);
  if (!Array.isArray(payload)) throw new TmdbError("TMDB_BAD_RESPONSE");
  return payload.filter((v): v is string => typeof v === "string");
}
