"use server";

// v2 owner server actions (PLAN-V2-002 §2.5/§2.12): the owner's cookie-session
// Supabase client calls the class-O RPCs of migration 145 directly. Same
// pattern as sessionRpc in app/lib/actions/mvp2.ts. No owner/user id is ever
// passed — every RPC resolves auth.uid() server-side.

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { ensureTmdbGenres } from "@/lib/tmdb/genres";
import { isTmdbTag, type TmdbTag } from "@/lib/tmdb/client";
import { cookies } from "next/headers";
import { isLanguageCode, LOCALE_COOKIE, tmdbTagFor } from "@/lib/i18n/languages";
import type {
  AskRow,
  FriendRail,
  InboxItemDetail,
  InboxPayload,
  MarkSeenResult,
  UserPrefs,
} from "@/components/v2/inbox/inbox-utils";

type RpcArgs = Record<string, unknown>;

async function ownerRpc<T>(fn: string, args?: RpcArgs): Promise<T> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("UNAUTHENTICATED");
  const { data, error } = await (
    supabase as unknown as {
      rpc: (f: string, a?: RpcArgs) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface InboxQuery {
  friendId?: string | null;
  cursor?: { key: number; item_id: string } | null;
  limit?: number;
}

/** get_inbox, To watch + recent only (P0 scope; Watched/Dismissed are P1). */
export async function getInboxAction(query: InboxQuery = {}): Promise<InboxPayload> {
  return ownerRpc<InboxPayload>("get_inbox", {
    p_status: "to_watch",
    p_friend_id: query.friendId ?? null,
    p_filters: {},
    p_sort: "recent",
    p_cursor_key: query.cursor?.key ?? null,
    p_cursor_item: query.cursor?.item_id ?? null,
    p_limit: query.limit ?? 30,
  });
}

/** get_inbox_item (migration 148): owner detail rows, without offers or region_missing. */
export async function getInboxItemAction(itemId: string): Promise<InboxItemDetail> {
  return ownerRpc<InboxItemDetail>("get_inbox_item", { p_item_id: itemId });
}

/** ensure_my_ask on first load (PRD §6.1: one link per owner, created automatically). */
export async function ensureMyAskAction(): Promise<AskRow> {
  return ownerRpc<AskRow>("ensure_my_ask");
}

export async function getMyAskAction(): Promise<AskRow> {
  return ownerRpc<AskRow>("get_my_ask");
}

/** Rotates the token in place; the old link stops resolving immediately. */
export async function regenerateMyAskAction(): Promise<string> {
  return ownerRpc<string>("regenerate_my_ask");
}

export async function setAskActiveAction(active: boolean): Promise<void> {
  await ownerRpc<void>("set_ask_active", { p_active: active });
}


export interface GenreOption {
  id: number;
  name: string;
}

interface LooseGenreChain {
  eq(column: string, value: string): LooseGenreChain;
  then<T>(onfulfilled: (value: { data: unknown; error: unknown }) => T): Promise<T>;
}

interface LooseGenreClient {
  from(table: string): {
    select(columns: string): LooseGenreChain;
  };
}

/** Localized TMDB genre catalog for the owner picker/filter UI. The rows are
 *  non-secret reference data; the service client is required because
 *  tmdb_genres is class-S storage. Catalog synchronization remains lazy. */
export async function getGenreCatalogAction(): Promise<GenreOption[]> {
  const prefs = await getMyPrefsAction();
  const store = await cookies();
  const cookieTag = store.get("LIKED_TMDB_LANG")?.value;
  const candidate = prefs.tmdb_lang ?? cookieTag ?? "en-US";
  const tag: TmdbTag = isTmdbTag(candidate) ? candidate : "en-US";
  const service = getSupabaseServiceClient();
  await Promise.all([ensureTmdbGenres("movie", tag, service), ensureTmdbGenres("tv", tag, service)]);
  const db = service as unknown as LooseGenreClient;
  const byId = new Map<number, string>();
  for (const media of ["movie", "tv"]) {
    const { data, error } = await (db.from("tmdb_genres").select("id,name").eq("media", media).eq("lang", tag) as unknown as Promise<{ data: unknown; error: unknown }>);
    if (error || !Array.isArray(data)) continue;
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const name = (row as { name?: unknown }).name;
      if (typeof id === "number" && typeof name === "string" && name && !byId.has(id)) byId.set(id, name);
    }
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** update_ask_settings (migration 145): prompt/note/genre cap validation lives
 *  in the RPC; the UI passes the current prompt through unchanged. */
export async function updateAskSettingsAction(input: {
  prompt: string | null;
  note: string | null;
  likedGenres: number[];
}): Promise<void> {
  await ownerRpc<void>("update_ask_settings", {
    p_prompt: input.prompt,
    p_note: input.note,
    p_liked_genres: input.likedGenres,
  });
}

/** Defaults are returned when the owner has no user_prefs row (no write). */
export async function getMyPrefsAction(): Promise<UserPrefs> {
  return ownerRpc<UserPrefs>("get_my_prefs");
}

/** Friend rail (PRD §6.3): All = SUM of the per-friend unseen counts. */
export async function getFriendRailAction(): Promise<FriendRail> {
  return ownerRpc<FriendRail>("get_friend_rail");
}

/** Stamps that contributor's unseen submissions as seen for the caller's ask;
 *  all_unseen drops by exactly cleared_recommendations (PRD §13 item 8). */
export async function markFriendSeenAction(contributorId: string): Promise<MarkSeenResult> {
  return ownerRpc<MarkSeenResult>("mark_friend_seen", { p_contributor_id: contributorId });
}

export interface MyPrefsPatch {
  /** undefined = unchanged, null = clear, else an ISO 3166-1 alpha-2 code. */
  regionCode?: string | null;
  notifyEmail?: boolean;
  theme?: "light" | "dark" | "system";
  accent?: string;
}

/** set_my_prefs: partial update; tmdb_lang is derived by set_language only. */
export async function setMyPrefsAction(patch: MyPrefsPatch): Promise<void> {
  await ownerRpc<void>("set_my_prefs", {
    p_region_code: patch.regionCode === undefined ? null : (patch.regionCode ?? ""),
    p_notify_email: patch.notifyEmail ?? null,
    p_theme: patch.theme ?? null,
    p_accent: patch.accent ?? null,
  });
  const store = await cookies();
  const maxAge = 60 * 60 * 24 * 365;
  if (patch.theme) store.set("LIKED_THEME", patch.theme, { path: "/", maxAge, sameSite: "lax" });
  if (patch.accent) store.set("LIKED_ACCENT", patch.accent, { path: "/", maxAge, sameSite: "lax" });
}

/** Language switch (PRD §6.8/§7.2): writes the LIKED_LOCALE cookie (single
 *  source for i18n/request.ts), the TMDB tag cookie, and persists the choice
 *  through set_language (user_prefs.tmdb_lang + language_set_at). */
export async function setLanguageAction(code: string): Promise<void> {
  if (!isLanguageCode(code)) throw new Error("unsupported language");
  const store = await cookies();
  const maxAge = 60 * 60 * 24 * 365;
  store.set(LOCALE_COOKIE, code, { path: "/", maxAge, sameSite: "lax" });
  store.set("LIKED_TMDB_LANG", tmdbTagFor(code), { path: "/", maxAge, sameSite: "lax" });
  await ownerRpc<void>("set_language", { p_language_code: code });
}

export interface PromoteFolderChoice {
  id: string;
  name: string;
  parent_folder_id: string | null;
  depth: number;
  system_kind: string | null;
}

export interface PromoteFolderChoices {
  last_used_folder_id: string | null;
  folders: PromoteFolderChoice[];
}

export async function getPromoteFolderChoicesAction(): Promise<PromoteFolderChoices> {
  return ownerRpc<PromoteFolderChoices>("get_promote_folder_choices");
}

export interface InboxLibraryTarget {
  recommendation_id: string | null;
  library_node_id: string | null;
}

export async function getInboxLibraryTargetAction(itemId: string): Promise<InboxLibraryTarget | null> {
  return ownerRpc<InboxLibraryTarget | null>("get_inbox_library_target", { p_item_id: itemId });
}

export interface PromoteResult {
  node_id: string;
  already: boolean;
}

export async function promoteRecommendationAction(recommendationId: string, folderId: string | null): Promise<PromoteResult> {
  return ownerRpc<PromoteResult>("promote_recommendation", {
    p_recommendation_id: recommendationId,
    p_folder_id: folderId,
  });
}

export async function getNodeItemPostersAction(nodeIds: string[]): Promise<Record<string, string>> {
  const rows = await ownerRpc<{ node_id: string; image_url: string }[]>("get_node_item_posters", { p_node_ids: nodeIds });
  return Object.fromEntries((rows ?? []).map((row) => [row.node_id, row.image_url]));
}

export type PickVisibility = "private" | "contributors" | "public";

export interface MyPick {
  node_id: string;
  item_id: string;
  kind: string;
  external_id: string;
  source: string;
  name: string;
  release_date: string | null;
  poster_path: string | null;
  thumb_url: string | null;
  visibility: Exclude<PickVisibility, "private">;
  created_at: string;
}

export async function listMyPicksAction(): Promise<MyPick[]> {
  return ownerRpc<MyPick[]>("list_my_picks");
}

export async function setPickVisibilityAction(nodeId: string, visibility: PickVisibility): Promise<void> {
  await ownerRpc<null>("set_pick_visibility", { p_node_id: nodeId, p_visibility: visibility });
}
