// Lazy TMDB genre catalog sync (PLAN-V2-002 §6.2/§6.3, migration-147
// contract). tmdb_genres is populated on first need: when no rows exist
// for a (media, lang) pair, fetch /genre/<media>/list and push the rows
// through the class-S tmdb_genres_sync RPC (service_role only, REPO-16).
// Once synced the existence check short-circuits — the hot path never
// fetches twice for the same media+lang.

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { tmdbGenres, type TmdbTag } from "./client";

export type TmdbGenreMedia = "movie" | "tv";

type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

interface GenreRow {
  media: string;
  id: number;
  lang: string;
  name: string;
}

interface LooseChain {
  eq(column: string, value: string): LooseChain;
  limit(count: number): Promise<{ data: unknown; error: unknown }>;
}

interface LooseClient {
  from(table: string): { select(columns: string): LooseChain };
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

/** Ensure tmdb_genres has rows for (media, lang). Returns the number of
 *  rows synced (0 when the catalog was already present or the fetch
 *  failed — genre names degrade to empty, never break the page). */
export async function ensureTmdbGenres(
  media: TmdbGenreMedia,
  lang: TmdbTag,
  client: ServiceClient = getSupabaseServiceClient()
): Promise<number> {
  const db = client as unknown as LooseClient;
  try {
    const { data, error } = await db
      .from("tmdb_genres")
      .select("id")
      .eq("media", media)
      .eq("lang", lang)
      .limit(1);
    if (error) return 0;
    if (Array.isArray(data) && data.length > 0) return 0;

    const genres = await tmdbGenres(media, lang);
    if (genres.length === 0) return 0;
    const rows: GenreRow[] = genres.map((g) => ({
      media,
      id: g.id,
      lang,
      name: g.name,
    }));
    const { data: synced, error: syncError } = await db.rpc("tmdb_genres_sync", {
      p_rows: rows,
    });
    if (syncError) return 0;
    return typeof synced === "number" ? synced : rows.length;
  } catch {
    return 0;
  }
}
