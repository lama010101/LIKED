import { describe, it, expect } from "vitest";
import {
  normalizeArray,
  normalizeSearch,
  isValidId,
  buildFeedParams,
  verifyDeterminism,
  parseURLToFilterState,
  serializeFilterStateToURL,
} from "@/lib/utils/feedParams";
import { DEFAULT_FILTER_STATE } from "@/lib/store/filterStore";

describe("normalizeArray", () => {
  it("removes null and undefined entries", () => {
    expect(normalizeArray(["a", null, "b", undefined, "c"])).toEqual(["a", "b", "c"]);
  });

  it("removes empty strings", () => {
    expect(normalizeArray(["a", "", "b", "  ", "c"])).toEqual(["a", "b", "c"]);
  });

  it("deduplicates entries", () => {
    expect(normalizeArray(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("sorts entries ascending", () => {
    expect(normalizeArray(["c", "a", "b"])).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace", () => {
    expect(normalizeArray(["  a  ", "b"])).toEqual(["a", "b"]);
  });

  it("returns empty array for all-null input", () => {
    expect(normalizeArray([null, undefined, null])).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeArray([])).toEqual([]);
  });

  it("converts non-string entries to strings", () => {
    expect(normalizeArray([123 as unknown as string, "abc"])).toEqual(["123", "abc"]);
  });
});

describe("normalizeSearch", () => {
  it("trims whitespace", () => {
    expect(normalizeSearch("  hello  ")).toBe("hello");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeSearch("hello    world")).toBe("hello world");
  });

  it("returns null for empty string", () => {
    expect(normalizeSearch("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeSearch("   ")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(normalizeSearch(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeSearch(undefined)).toBeNull();
  });

  it("preserves single word", () => {
    expect(normalizeSearch("hello")).toBe("hello");
  });
});

describe("isValidId", () => {
  it("accepts UUID format with dashes", () => {
    expect(isValidId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts UUID format without dashes", () => {
    expect(isValidId("550e8400e29b41d4a716446655440000")).toBe(true);
  });

  it("accepts numeric strings", () => {
    expect(isValidId("12345")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidId("")).toBe(false);
  });

  it("rejects random strings", () => {
    expect(isValidId("hello-world")).toBe(false);
  });

  it("rejects strings with special characters", () => {
    expect(isValidId("abc!@#")).toBe(false);
  });
});

describe("buildFeedParams", () => {
  it("maps basic state to RPC params", () => {
    const state = { ...DEFAULT_FILTER_STATE, view: "all" as const, sort: "newest" as const };
    const params = buildFeedParams(state, "user-123", "en");
    expect(params.p_user_id).toBe("user-123");
    expect(params.p_language_code).toBe("en");
    expect(params.p_view).toBe("all");
    expect(params.p_sort).toBe("newest");
  });

  it("maps sort correctly", () => {
    const state = { ...DEFAULT_FILTER_STATE, sort: "oldest" as const };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_sort).toBe("oldest");
  });

  it("maps most_shared sort", () => {
    const state = { ...DEFAULT_FILTER_STATE, sort: "most_shared" as const };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_sort).toBe("most_shared");
  });

  it("converts empty arrays to undefined", () => {
    const state = { ...DEFAULT_FILTER_STATE };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_filter_tag_ids).toBeUndefined();
    expect(params.p_filter_friend_ids).toBeUndefined();
    expect(params.p_filter_folder_ids).toBeUndefined();
  });

  it("passes non-empty arrays as-is", () => {
    const state = {
      ...DEFAULT_FILTER_STATE,
      tagIds: ["tag1", "tag2"],
    };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_filter_tag_ids).toEqual(["tag1", "tag2"]);
  });

  it("converts null context IDs to undefined", () => {
    const state = { ...DEFAULT_FILTER_STATE };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_friend_id).toBeUndefined();
    expect(params.p_folder_id).toBeUndefined();
    expect(params.p_group_id).toBeUndefined();
  });

  it("sets p_exclude_foldered to true when no folder context", () => {
    const state = { ...DEFAULT_FILTER_STATE };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_exclude_foldered).toBe(true);
  });

  it("sets p_exclude_foldered to false when folder context is set", () => {
    const state = {
      ...DEFAULT_FILTER_STATE,
      folderId: "550e8400-e29b-41d4-a716-446655440000",
    };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_exclude_foldered).toBe(false);
  });

  it("passes search query when set", () => {
    const state = { ...DEFAULT_FILTER_STATE, searchQuery: "hello world" };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_search_query).toBe("hello world");
  });

  it("converts null search query to undefined", () => {
    const state = { ...DEFAULT_FILTER_STATE, searchQuery: null };
    const params = buildFeedParams(state, "user-123");
    expect(params.p_search_query).toBeUndefined();
  });
});

describe("verifyDeterminism", () => {
  it("returns true for identical URLs", () => {
    expect(verifyDeterminism("view=all", "view=all", "user-123")).toBe(true);
  });

  it("returns true for logically equivalent URLs with different tag order", () => {
    expect(
      verifyDeterminism("tags=a,b,c", "tags=c,b,a", "user-123")
    ).toBe(true);
  });

  it("returns false for different views", () => {
    expect(verifyDeterminism("view=all", "view=mine", "user-123")).toBe(false);
  });
});

describe("parseURLToFilterState + serializeFilterStateToURL roundtrip", () => {
  it("roundtrips a simple view param", () => {
    const sp = new URLSearchParams("view=mine");
    const state = parseURLToFilterState(sp);
    const url = serializeFilterStateToURL(state);
    expect(url).toContain("view=mine");
  });

  it("roundtrips tags", () => {
    // Tags must be valid IDs (UUID or numeric) — use UUIDs
    const tag1 = "550e8400-e29b-41d4-a716-446655440001";
    const tag2 = "550e8400-e29b-41d4-a716-446655440002";
    const sp = new URLSearchParams(`tags=${tag1},${tag2}`);
    const state = parseURLToFilterState(sp);
    const url = serializeFilterStateToURL(state);
    expect(url).toContain(`tags=${encodeURIComponent(tag1 + "," + tag2)}`);
  });

  it("omits default values", () => {
    const sp = new URLSearchParams("");
    const state = parseURLToFilterState(sp);
    const url = serializeFilterStateToURL(state);
    expect(url).toBe("");
  });
});
