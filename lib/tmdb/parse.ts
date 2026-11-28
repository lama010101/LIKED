// Paste-link parsing for /api/ask/resolve (PLAN-V2-002 §6.2).
// The server NEVER fetches a user-supplied URL — it only parses it against
// this allowlist and then calls the provider with the extracted id.
// Anything else -> null (route answers 422 UNSUPPORTED_URL).

export type ParsedTmdbTarget =
  | { provider: "tmdb"; kind: "movie" | "series"; external_id: string }
  | { provider: "imdb"; imdb_id: string };

const TMDB_HOSTS = new Set(["themoviedb.org", "www.themoviedb.org"]);
const IMDB_HOSTS = new Set(["imdb.com", "www.imdb.com", "m.imdb.com"]);

function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

/** themoviedb.org/(movie|tv)/<id>[-slug], with an optional locale prefix
 *  (/fr/movie/603-matrix). The id is the only thing we keep. */
export function parseTmdbUrl(raw: string): ParsedTmdbTarget | null {
  const url = parseUrl(raw);
  if (!url || !TMDB_HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = /\/(movie|tv)\/(\d{1,10})(?:[-/]|$)/.exec(url.pathname);
  if (!m) return null;
  const id = m[2];
  if (!/^\d{1,10}$/.test(id) || Number(id) <= 0) return null;
  return { provider: "tmdb", kind: m[1] === "movie" ? "movie" : "series", external_id: id };
}

/** imdb.com/title/tt<7-10 digits> — resolved through TMDB /find. */
export function parseImdbUrl(raw: string): ParsedTmdbTarget | null {
  const url = parseUrl(raw);
  if (!url || !IMDB_HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = /^\/title\/(tt\d{7,10})(?:\/|$)/.exec(url.pathname);
  if (!m) return null;
  return { provider: "imdb", imdb_id: m[1] };
}

/** TMDB URL first, then IMDb — one entry point for the route. */
export function parsePasteUrl(raw: string): ParsedTmdbTarget | null {
  return parseTmdbUrl(raw) ?? parseImdbUrl(raw);
}
