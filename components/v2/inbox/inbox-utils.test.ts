import { describe, expect, it } from "vitest";
import {
  buildAskUrl,
  cardImageUrl,
  clampPercent,
  displayableGenres,
  languageName,
  mergeCards,
  RING_CIRCUMFERENCE,
  ringDash,
  splitRuntime,
  tmdbPosterUrl,
  typeKey,
  unseenTotal,
  type InboxCard,
} from "./inbox-utils";

function card(partial: Partial<InboxCard> & Pick<InboxCard, "item_id">): InboxCard {
  return {
    status: "to_watch",
    type: "movie",
    title: "t",
    original_title: null,
    year: null,
    runtime_min: null,
    release_date: null,
    original_language: null,
    genres: [],
    overview: null,
    poster_path: null,
    thumb_url: null,
    source: "tmdb",
    kind: "movie",
    is_documentary: false,
    trailer_url: null,
    tmdb_score: null,
    enrichment_status: "pending",
    skeleton: true,
    recommender_count: 1,
    rater_count: 0,
    friends_avg: null,
    recommenders: [],
    more_count: 0,
    quote: null,
    platforms: [],
    in_library: false,
    recommended_again: false,
    latest_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("score ring geometry", () => {
  it("clamps to 0..100", () => {
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(87)).toBe(87);
  });

  it("0% hides the arc, 100% draws it fully", () => {
    expect(ringDash(0).dashoffset).toBeCloseTo(RING_CIRCUMFERENCE, 5);
    expect(ringDash(100).dashoffset).toBeCloseTo(0, 5);
    expect(ringDash(50).dashoffset).toBeCloseTo(RING_CIRCUMFERENCE / 2, 5);
  });

  it("keeps the friends ring and the TMDB ring independent (never blended)", () => {
    const friends = ringDash(80);
    const tmdb = ringDash(61);
    expect(friends.dashoffset).not.toBeCloseTo(tmdb.dashoffset, 3);
  });
});

describe("display helpers", () => {
  it("maps the four card types to their i18n keys", () => {
    expect(typeKey("movie")).toBe("typeMovie");
    expect(typeKey("series")).toBe("typeSeries");
    expect(typeKey("documentary")).toBe("typeDocumentary");
    expect(typeKey("youtube")).toBe("typeYoutube");
    expect(typeKey("unknown")).toBe("typeMovie");
  });

  it("splits runtime only when the enrichment filled it", () => {
    expect(splitRuntime(null)).toBeNull();
    expect(splitRuntime(0)).toBeNull();
    expect(splitRuntime(102)).toEqual({ hours: 1, minutes: 42 });
    expect(splitRuntime(45)).toEqual({ hours: 0, minutes: 45 });
  });

  it("hotlinks TMDB posters and never invents one", () => {
    expect(tmdbPosterUrl(null)).toBeNull();
    expect(tmdbPosterUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
    expect(tmdbPosterUrl("https://image.tmdb.org/t/p/w500/x.jpg")).toBe(
      "https://image.tmdb.org/t/p/w500/x.jpg"
    );
  });

  it("uses the YouTube thumb only for youtube items", () => {
    expect(cardImageUrl({ source: "youtube", poster_path: null, thumb_url: "https://i.ytimg.com/x.jpg" })).toBe(
      "https://i.ytimg.com/x.jpg"
    );
    expect(cardImageUrl({ source: "tmdb", poster_path: null, thumb_url: "https://i.ytimg.com/x.jpg" })).toBeNull();
  });

  it("builds the Ask URL without double slashes", () => {
    expect(buildAskUrl("https://liked-zeta.vercel.app", "tok")).toBe("https://liked-zeta.vercel.app/r/tok");
    expect(buildAskUrl("https://liked-zeta.vercel.app/", "tok")).toBe("https://liked-zeta.vercel.app/r/tok");
  });

  it("merges pages without duplicating an item", () => {
    const a = card({ item_id: "a" });
    const b = card({ item_id: "b" });
    const merged = mergeCards([a, b], [card({ item_id: "b" }), card({ item_id: "c" })]);
    expect(merged.map((c) => c.item_id)).toEqual(["a", "b", "c"]);
  });

  it("All unseen = sum of the friend counts (PRD §6.3)", () => {
    expect(unseenTotal([{ unseen_count: 2 }, { unseen_count: 0 }, { unseen_count: 5 }])).toBe(7);
    expect(unseenTotal([])).toBe(0);
  });

  it("never renders namespaced genre keys as names", () => {
    expect(displayableGenres(["tmdb:28", "yt:10"])).toEqual([]);
    expect(displayableGenres(["Drama", "tmdb:18"])).toEqual(["Drama"]);
    expect(displayableGenres(null)).toEqual([]);
  });

  it("resolves a language display name and falls back to the code", () => {
    expect(languageName(null, "en")).toBeNull();
    expect(languageName("fr", "en")).toBe("French");
    expect(languageName("xx-unknown", "en")).toBe("xx-unknown");
  });
});
