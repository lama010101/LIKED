// Owner inbox — shared types and pure helpers (PLAN-V2-002 §2.5 contract as
// built by migration 145, CTO-frozen for P0-16). No rendering here; every
// value comes from get_inbox/get_friend_rail and nothing is derived that the
// RPC already decides (no client-side filtering, sorting or merging).

export type InboxCardType = "movie" | "series" | "documentary" | "youtube" | string;

export interface Recommender {
  contributor_id: string;
  display_name: string;
  initials: string;
  rating: number | null;
}

export interface InboxItemDetailItem {
  id: string;
  source: string;
  kind: string;
  external_id: string;
  name: string | null;
  overview: string | null;
  release_date: string | null;
  runtime_min: number | null;
  genres: string[];
  poster_path: string | null;
  thumb_url: string | null;
  trailer_url: string | null;
  tmdb_rating: number | null;
  tmdb_votes: number | null;
  display_status: string;
  enrichment_status: string;
}

export interface InboxItemDetailRecommender {
  name: string;
  initials: string;
  rating: number | null;
  comment: string | null;
  platform_text: string | null;
  created_at: string;
}

export interface InboxItemDetail {
  item: InboxItemDetailItem;
  recommenders: InboxItemDetailRecommender[];
  owner_status: string;
}

export interface InboxCard {
  item_id: string;
  status: string;
  type: InboxCardType;
  title: string | null;
  original_title: string | null;
  year: number | null;
  runtime_min: number | null;
  release_date: string | null;
  original_language: string | null;
  genres: string[];
  overview: string | null;
  poster_path: string | null;
  thumb_url: string | null;
  source: "tmdb" | "youtube" | string;
  kind: string;
  is_documentary: boolean;
  trailer_url: string | null;
  tmdb_score: number | null;
  enrichment_status: string;
  skeleton: boolean;
  recommender_count: number;
  rater_count: number;
  friends_avg: number | null;
  recommenders: Recommender[];
  more_count: number;
  quote: string | null;
  platforms: string[];
  in_library: boolean;
  recommended_again: boolean;
  latest_at: string;
}

export interface InboxCounts {
  to_watch: number;
  watched: number;
  dismissed: number;
}

export interface InboxCursor {
  key: number;
  item_id: string;
}

export interface InboxPayload {
  cards: InboxCard[];
  next_cursor: InboxCursor | null;
  counts: InboxCounts;
}

export interface FriendRailEntry {
  contributor_id: string;
  display_name: string;
  last_submission_at: string;
  unseen_count: number;
  total_count: number;
}

export interface FriendRail {
  all_unseen: number;
  friends: FriendRailEntry[];
}

export interface AskRow {
  id: string;
  owner_id: string;
  token: string;
  prompt: string | null;
  note: string | null;
  liked_genres: number[];
  is_active: boolean;
  created_at: string;
  rotated_at: string | null;
}

export interface UserPrefs {
  region_code: string | null;
  notify_email: boolean;
  theme: string;
  accent: string;
  tmdb_lang: string | null;
  language_set_at: string | null;
}

export interface MarkSeenResult {
  cleared_submissions: number;
  cleared_recommendations: number;
}

// ── Score ring geometry ─────────────────────────────────────────────────
// One viewBox for the card ring and the two detail-sheet rings.
export const RING_VIEWBOX = 44;
export const RING_RADIUS = 18;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function clampPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Stroke dash geometry for a 0–100 percentage. */
export function ringDash(percent: number | null | undefined): {
  dasharray: number;
  dashoffset: number;
} {
  const p = clampPercent(percent);
  return {
    dasharray: RING_CIRCUMFERENCE,
    dashoffset: RING_CIRCUMFERENCE * (1 - p / 100),
  };
}

// ── Display helpers ─────────────────────────────────────────────────────

/** i18n key for the card type chip (PRD §6.2: Movie / Series / Documentary / YouTube).
 *  kind "playlist" (D32) maps to the playlist.* namespace — the SQL type stays
 *  'youtube' so the W8 type filter keeps grouping playlists with videos. */
export function typeKey(
  type: InboxCardType,
  kind?: string
): "typeMovie" | "typeSeries" | "typeDocumentary" | "typeYoutube" | "typePlaylist" {
  if (kind === "playlist") return "typePlaylist";
  switch (type) {
    case "series":
      return "typeSeries";
    case "documentary":
      return "typeDocumentary";
    case "youtube":
      return "typeYoutube";
    default:
      return "typeMovie";
  }
}

/** Runtime split for i18n; null when the enrichment has not filled it. */
export function splitRuntime(minutes: number | null | undefined): { hours: number; minutes: number } | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Hotlinked TMDB poster (PRD §7: never copied). Null when the enrichment has no path. */
export function tmdbPosterUrl(posterPath: string | null | undefined): string | null {
  if (!posterPath) return null;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `https://image.tmdb.org/t/p/w342${posterPath.startsWith("/") ? "" : "/"}${posterPath}`;
}

/** Card image: TMDB poster hotlink, else the YouTube thumbnail the RPC cached. */
export function cardImageUrl(card: Pick<InboxCard, "source" | "poster_path" | "thumb_url">): string | null {
  if (card.source === "tmdb") return tmdbPosterUrl(card.poster_path);
  return card.thumb_url || null;
}

/** "87%" — percentage formatting kept out of JSX text (react/jsx-no-literals). */
export function formatPercent(value: number): string {
  return `${value}%`;
}

/** Canonical YouTube playlist URL for the detail-sheet Open action (D32). */
export function youtubePlaylistUrl(externalId: string | null | undefined): string | null {
  if (!externalId || !/^(PL|OL|UU|FL)[A-Za-z0-9_-]{11,62}$/.test(externalId)) return null;
  return `https://www.youtube.com/playlist?list=${externalId}`;
}

/** Locale rendering for the recommendation timestamp returned by get_inbox_item. */
export function formatRecommenderDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

/** Public Ask link for a token. */
export function buildAskUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${token}`;
}

/** Append a page without duplicating cards already shown (keyset pages never overlap). */
export function mergeCards(existing: InboxCard[], next: InboxCard[]): InboxCard[] {
  const seen = new Set(existing.map((c) => c.item_id));
  return [...existing, ...next.filter((c) => !seen.has(c.item_id))];
}

/** "All" unseen total = SUM of the per-friend counts (PRD §6.3). */
export function unseenTotal(friends: Pick<FriendRailEntry, "unseen_count">[]): number {
  return friends.reduce((sum, f) => sum + (f.unseen_count || 0), 0);
}

/** True only for values the RPC marked as still enriching (never fabricated). */
export function isSkeleton(card: Pick<InboxCard, "skeleton" | "enrichment_status">): boolean {
  return card.skeleton || card.enrichment_status === "pending";
}

/** get_inbox returns namespaced genre keys ('tmdb:28', 'yt:10') whose display
 *  names live in tmdb_genres, which the frozen contract does not join. Only
 *  plain names are renderable; keys are never shown to the owner. */
export function displayableGenres(genres: string[] | null | undefined): string[] {
  if (!genres) return [];
  return genres.filter((g) => g.length > 0 && !/^(tmdb|yt):/.test(g));
}

/** Human language name for an ISO code; falls back to the code itself. */
export function languageName(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  if (!/^[a-z]{2,3}$/i.test(code)) return code;
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    return name && !/unknown/i.test(name) ? name : code;
  } catch {
    return code;
  }
}
