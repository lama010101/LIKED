/**
 * URL ↔ FilterState serialization + deterministic feed parameter builder
 * P9-T03-B: Determinism & State Ownership Hardening
 *
 * Compliance: 04_FEED_SQL_SPEC.md §2 (get_feed parameter contract)
 *             01_PRD.md §8 (context), §16 (filtering), §7 (feed)
 *
 * INVARIANTS:
 * - ALL normalization happens here (single authority)
 * - Same logical URL → identical FilterState → identical buildFeedParams output
 * - Arrays: deduplicated, sorted, non-empty strings only
 * - Search: trimmed, collapsed whitespace, empty → null
 * - Context: priority friend > folder > group (deterministic)
 * - Sort: snake_case ONLY in state (no camelCase)
 * - buildFeedParams is the ONLY place sort maps to RPC values
 */

import { type FilterState, type FeedViewTab, type SortOption, DEFAULT_FILTER_STATE } from "@/lib/store/filterStore";

// ── Validation sets ───────────────────────────────────────────────

const VALID_VIEWS: readonly string[] = ["all", "mine", "received"];
const VALID_SORTS: readonly string[] = ["newest", "oldest", "most_shared", "highest_rated", "custom"];

/** Canonical URL key order — deterministic, never reorder */
const URL_KEY_ORDER = ["view", "sort", "friend", "folder", "group", "tags", "friends", "folders", "search"] as const;

// ── Normalization utilities ───────────────────────────────────────

/**
 * Normalize an array of IDs:
 * - Remove null/undefined/empty strings
 * - Deduplicate
 * - Sort ascending (stable, string comparison)
 * - Ensure all entries are strings
 */
export function normalizeArray(input: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of input) {
    if (item == null) continue;
    const s = String(item).trim();
    if (s.length === 0) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    result.push(s);
  }
  result.sort();
  return result;
}

/**
 * Normalize a search query:
 * - Trim
 * - Collapse internal whitespace to single space
 * - Empty result → null
 */
export function normalizeSearch(input: string | null | undefined): string | null {
  if (input == null) return null;
  const collapsed = input.trim().replace(/\s+/g, " ");
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * Validate an ID: accept UUID format OR numeric strings.
 * Invalid entries are removed (not crash).
 */
export function isValidId(id: string): boolean {
  if (id.length === 0) return false;
  // Numeric IDs
  if (/^\d+$/.test(id)) return true;
  // UUID format (with or without dashes)
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) return true;
  return false;
}

/**
 * Normalize an array of IDs: normalizeArray + isValidId filter
 */
function normalizeIdArray(input: (string | null | undefined)[]): string[] {
  return normalizeArray(input).filter(isValidId);
}

// ── FilterState normalization ─────────────────────────────────────

/**
 * Canonicalize a FilterState. This is the SINGLE normalization point.
 * After this, two states with the same logical filters will be deeply equal.
 */
export function normalizeFilterState(state: Partial<FilterState>): FilterState {
  const view: FeedViewTab = VALID_VIEWS.includes(state.view ?? "") ? (state.view as FeedViewTab) : DEFAULT_FILTER_STATE.view;
  const sort: SortOption = VALID_SORTS.includes(state.sort ?? "") ? (state.sort as SortOption) : DEFAULT_FILTER_STATE.sort;
  const mineSubTab = state.mineSubTab ?? DEFAULT_FILTER_STATE.mineSubTab;

  // Context: priority friend > folder > group (deterministic)
  let friendId: string | null = null;
  let folderId: string | null = null;
  let groupId: string | null = null;
  if (state.friendId && isValidId(state.friendId)) {
    friendId = state.friendId;
  } else if (state.folderId && isValidId(state.folderId)) {
    folderId = state.folderId;
  } else if (state.groupId && isValidId(state.groupId)) {
    groupId = state.groupId;
  }

  return {
    view,
    sort,
    mineSubTab,
    friendId,
    folderId,
    groupId,
    tagIds: normalizeIdArray(state.tagIds ?? []),
    viewMode: state.viewMode ?? DEFAULT_FILTER_STATE.viewMode,
    zoom: state.zoom ?? DEFAULT_FILTER_STATE.zoom,
    filterFriendIds: normalizeIdArray(state.filterFriendIds ?? []),
    filterFolderIds: normalizeIdArray(state.filterFolderIds ?? []),
    searchQuery: normalizeSearch(state.searchQuery ?? null),
  };
}

// ── Deep equality for FilterState ─────────────────────────────────

/**
 * Deep compare two FilterState objects.
 * Relies on both being normalized (arrays sorted, etc).
 */
export function isEqualFilterState(a: FilterState, b: FilterState): boolean {
  if (a.view !== b.view) return false;
  if (a.sort !== b.sort) return false;
  if (a.mineSubTab !== b.mineSubTab) return false;
  if (a.friendId !== b.friendId) return false;
  if (a.folderId !== b.folderId) return false;
  if (a.groupId !== b.groupId) return false;
  if (a.searchQuery !== b.searchQuery) return false;
  if (a.tagIds.length !== b.tagIds.length) return false;
  if (a.filterFriendIds.length !== b.filterFriendIds.length) return false;
  if (a.filterFolderIds.length !== b.filterFolderIds.length) return false;
  for (let i = 0; i < a.tagIds.length; i++) { if (a.tagIds[i] !== b.tagIds[i]) return false; }
  for (let i = 0; i < a.filterFriendIds.length; i++) { if (a.filterFriendIds[i] !== b.filterFriendIds[i]) return false; }
  for (let i = 0; i < a.filterFolderIds.length; i++) { if (a.filterFolderIds[i] !== b.filterFolderIds[i]) return false; }
  return true;
}

// ── URL param helper ──────────────────────────────────────────────

function getParam(sp: URLSearchParams | Record<string, string | string[] | undefined>, key: string): string | null {
  if (sp instanceof URLSearchParams) {
    const v = sp.get(key);
    return v ? decodeURIComponent(v) : null;
  }
  const v = sp[key];
  const raw = Array.isArray(v) ? v[0] ?? null : v ?? null;
  return raw ? decodeURIComponent(raw) : null;
}

function splitCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

// ── Parse URL → FilterState ────────────────────────────────────────

/**
 * Parse URL searchParams → FilterState.
 * - decodeURIComponent applied
 * - Normalization applied immediately
 * - Invalid values silently ignored
 * - Context conflict: priority friend > folder > group
 * - IDs validated
 */
export function parseURLToFilterState(
  sp: URLSearchParams | Record<string, string | string[] | undefined>
): FilterState {
  const rv = getParam(sp, "view");
  const rs = getParam(sp, "sort");
  const rf = getParam(sp, "friend");
  const rfo = getParam(sp, "folder");
  const rg = getParam(sp, "group");

  return normalizeFilterState({
    view: rv && VALID_VIEWS.includes(rv) ? (rv as FeedViewTab) : undefined,
    sort: rs && VALID_SORTS.includes(rs) ? (rs as SortOption) : undefined,
    friendId: rf || undefined,
    folderId: rfo || undefined,
    groupId: rg || undefined,
    tagIds: splitCsv(getParam(sp, "tags")),
    filterFriendIds: splitCsv(getParam(sp, "friends")),
    filterFolderIds: splitCsv(getParam(sp, "folders")),
    searchQuery: getParam(sp, "search"),
  });
}

// ── Serialize FilterState → URL ───────────────────────────────────

/**
 * Serialize FilterState → query string.
 * - Omits default values
 * - Arrays already normalized (sorted, deduped)
 * - Deterministic key order (URL_KEY_ORDER)
 * - Values encodeURIComponent-encoded
 */
export function serializeFilterStateToURL(state: FilterState): string {
  const m = new Map<string, string>();
  if (state.view !== DEFAULT_FILTER_STATE.view) m.set("view", state.view);
  if (state.sort !== DEFAULT_FILTER_STATE.sort) m.set("sort", state.sort);
  if (state.friendId) m.set("friend", state.friendId);
  if (state.folderId) m.set("folder", state.folderId);
  if (state.groupId) m.set("group", state.groupId);
  if (state.tagIds.length > 0) m.set("tags", state.tagIds.join(","));
  if (state.filterFriendIds.length > 0) m.set("friends", state.filterFriendIds.join(","));
  if (state.filterFolderIds.length > 0) m.set("folders", state.filterFolderIds.join(","));
  if (state.searchQuery) m.set("search", state.searchQuery);
  return URL_KEY_ORDER
    .filter((k) => m.has(k))
    .map((k) => `${k}=${encodeURIComponent(m.get(k)!)}`)
    .join("&");
}

// ── Sort mapping (SINGLE AUTHORITY) ────────────────────────────────

/**
 * Map filterStore.SortOption (snake_case) → RPC p_sort value.
 * This is the ONLY place sort values are mapped.
 * filterStore.SortOption uses snake_case: newest, oldest, most_shared, highest_rated, custom
 * get_feed RPC uses: newest, oldest, most_shared, custom
 */
const SORT_TO_RPC: Record<SortOption, string> = {
  newest: "newest",
  oldest: "oldest",
  most_shared: "most_shared",
  highest_rated: "highest_rated",
  custom: "custom",
};

// ── Build feed params (SINGLE AUTHORITY) ──────────────────────────

/**
 * Build EXACT params for get_feed(...) RPC.
 * Pure function. ALL mapping logic centralized here.
 * Empty arrays → undefined (NULL for RPC).
 * Sort mapped via SORT_TO_RPC (only mapping point).
 */
export function buildFeedParams(state: FilterState, userId: string, languageCode = "en") {
  return {
    p_user_id: userId,
    p_language_code: languageCode,
    p_view: state.view,
    p_sort: SORT_TO_RPC[state.sort],
    p_friend_id: state.friendId ?? undefined,
    p_folder_id: state.folderId ?? undefined,
    p_group_id: state.groupId ?? undefined,
    p_filter_tag_ids: state.tagIds.length > 0 ? state.tagIds : undefined,
    p_filter_friend_ids: state.filterFriendIds.length > 0 ? state.filterFriendIds : undefined,
    p_filter_folder_ids: state.filterFolderIds.length > 0 ? state.filterFolderIds : undefined,
    p_search_query: state.searchQuery ?? undefined,
  };
}

// ── Determinism verification utility ──────────────────────────────

/**
 * Verify determinism: two URLs that are logically equivalent
 * must produce identical buildFeedParams output.
 * Returns true if deterministic, false otherwise.
 */
export function verifyDeterminism(urlA: string, urlB: string, userId: string): boolean {
  const spA = new URLSearchParams(urlA);
  const spB = new URLSearchParams(urlB);
  const stateA = parseURLToFilterState(spA);
  const stateB = parseURLToFilterState(spB);
  if (!isEqualFilterState(stateA, stateB)) return false;
  const paramsA = buildFeedParams(stateA, userId);
  const paramsB = buildFeedParams(stateB, userId);
  return JSON.stringify(paramsA) === JSON.stringify(paramsB);
}
