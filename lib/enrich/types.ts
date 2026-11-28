// Enrichment worker contracts (PLAN-V2-002 §2.11/§6.6, task P0-15).
// The worker only READS v2 tables and writes exclusively through the
// class-S RPCs of migration 143 (enrichment_claim, enrichment_finish,
// item_apply_details, item_apply_availability, item_refresh_apply) —
// REPO-15 forbids direct table writes in app code.

export interface EnrichmentJob {
  id: string;
  item_id: string;
  job_kind: "details" | "availability";
  /** TMDB language tag for 'details', region code for 'availability'. */
  param: string;
  status: string;
  attempts: number;
}

export interface EnrichmentItem {
  id: string;
  source: "tmdb" | "youtube";
  kind: "movie" | "series" | "video" | "channel" | "playlist";
  external_id: string;
  /** Localized display fields already applied, keyed by TMDB language tag. */
  localized?: Record<string, unknown> | null;
}

/** Minimal surface of the service-role Supabase client used here. */
export interface EnrichDb {
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: readonly string[]
      ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
    };
  };
}

export interface ProviderEnv {
  tmdbToken: string | null;
  youtubeKey: string | null;
}

/** Result of one provider lookup. 'unavailable' means the provider
 *  answered that the item no longer exists (404 / empty list): the
 *  display fields are nulled instead of retried. */
export type ProviderResult<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export function readProviderEnv(): ProviderEnv {
  return {
    tmdbToken: process.env.TMDB_API_READ_ACCESS_TOKEN || null,
    youtubeKey: process.env.YOUTUBE_API_KEY || null,
  };
}
