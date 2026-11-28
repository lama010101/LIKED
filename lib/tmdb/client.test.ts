import { describe, expect, it, vi } from "vitest";
import {
  findImdbDetails,
  mapSearchItem,
  posterUrl,
  searchMulti,
  toBaseFacts,
  tmdbGenres,
} from "./client";

const TOKEN = "test-tmdb-token-0123456789";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("mapSearchItem", () => {
  it("maps a movie and a tv row", () => {
    expect(
      mapSearchItem({
        media_type: "movie",
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        poster_path: "/abc.jpg",
        vote_average: 8.2,
      })
    ).toEqual({
      source: "tmdb",
      kind: "movie",
      external_id: "603",
      title: "The Matrix",
      year: 1999,
      poster_path: "/abc.jpg",
      vote_average: 8.2,
    });
    expect(
      mapSearchItem({
        media_type: "tv",
        id: 1399,
        name: "Game of Thrones",
        first_air_date: "2011-04-17",
        poster_path: null,
        vote_average: 8.4,
      })
    ).toMatchObject({ kind: "series", external_id: "1399", year: 2011 });
  });

  it("drops persons, adult rows, bad ids and blank titles", () => {
    expect(mapSearchItem({ media_type: "person", id: 1, name: "X" })).toBeNull();
    expect(mapSearchItem({ media_type: "movie", id: 1, title: "X", adult: true })).toBeNull();
    expect(mapSearchItem({ media_type: "movie", id: 0, title: "X" })).toBeNull();
    expect(mapSearchItem({ media_type: "movie", id: 5, title: "" })).toBeNull();
    expect(mapSearchItem(null)).toBeNull();
  });

  it("rejects a malformed poster path", () => {
    const mapped = mapSearchItem({
      media_type: "movie",
      id: 9,
      title: "T",
      poster_path: "https://evil.example/x.jpg",
    });
    expect(mapped?.poster_path).toBeNull();
  });
});

describe("posterUrl", () => {
  it("builds an image.tmdb.org hotlink only for a valid path", () => {
    expect(posterUrl("/abc.jpg", "w500")).toBe("https://image.tmdb.org/t/p/w500/abc.jpg");
    expect(posterUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
    expect(posterUrl(null)).toBeNull();
    expect(posterUrl("abc.jpg")).toBeNull();
  });
});

describe("searchMulti", () => {
  it("sends the viewer tag and include_adult=false", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ results: [] })) as unknown as typeof fetch;
    await searchMulti("matrix", "fr-FR", { token: TOKEN, fetchImpl });
    const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    const url = new URL(call[0]);
    expect(url.pathname).toBe("/3/search/multi");
    expect(url.searchParams.get("language")).toBe("fr-FR");
    expect(url.searchParams.get("include_adult")).toBe("false");
    expect(url.searchParams.get("query")).toBe("matrix");
    expect((call[1].headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("returns [] for a one-character query without a network call", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(searchMulti("a", "en-US", { token: TOKEN, fetchImpl })).resolves.toEqual([]);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });

  it("maps only movies and series", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: [
          { media_type: "movie", id: 1, title: "A", release_date: "2001-01-01" },
          { media_type: "person", id: 2, name: "B" },
          { media_type: "tv", id: 3, name: "C" },
        ],
      })
    ) as unknown as typeof fetch;
    const out = await searchMulti("ab", "en-US", { token: TOKEN, fetchImpl });
    expect(out.map((r) => r.external_id)).toEqual(["1", "3"]);
  });

  it("fails closed when the token is missing", async () => {
    await expect(searchMulti("ab", "en-US", { token: null })).rejects.toMatchObject({
      code: "TMDB_NOT_CONFIGURED",
    });
  });

  it("maps 404 to TMDB_NOT_FOUND and 500 to TMDB_UPSTREAM", async () => {
    const notFound = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(searchMulti("ab", "en-US", { token: TOKEN, fetchImpl: notFound })).rejects.toMatchObject(
      { code: "TMDB_NOT_FOUND" }
    );
    const boom = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(searchMulti("ab", "en-US", { token: TOKEN, fetchImpl: boom })).rejects.toMatchObject({
      code: "TMDB_UPSTREAM",
    });
  });
});

describe("toBaseFacts", () => {
  it("namespaces genres, flags documentary and picks a YouTube trailer", () => {
    const base = toBaseFacts(
      {
        title: "A Documentary",
        release_date: "2020-05-01",
        original_language: "en",
        genres: [{ id: 99, name: "Documentary" }, { id: 28, name: "Action" }],
        runtime: 101.6,
        poster_path: "/p.jpg",
        vote_average: 7.25,
        vote_count: 12,
        videos: { results: [{ site: "YouTube", type: "Trailer", key: "dQw4w9WgXcQ" }] },
      },
      "movie"
    );
    expect(base).toMatchObject({
      name: "A Documentary",
      genres: ["tmdb:99", "tmdb:28"],
      is_documentary: true,
      runtime_min: 102,
      trailer_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("reads episode_run_time for series", () => {
    const base = toBaseFacts({ name: "S", episode_run_time: [45, 50] }, "series");
    expect(base.runtime_min).toBe(45);
    expect(base.name).toBe("S");
  });
});

describe("findImdbDetails", () => {
  it("takes movie_results[0] and builds base facts in one call", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        movie_results: [
          {
            id: 603,
            title: "The Matrix",
            original_title: "The Matrix",
            release_date: "1999-03-31",
            original_language: "en",
            genre_ids: [28, 878],
            poster_path: "/m.jpg",
            vote_average: 8.2,
            vote_count: 25000,
          },
        ],
        tv_results: [],
      })
    ) as unknown as typeof fetch;
    const out = await findImdbDetails("tt0133093", "en-US", { token: TOKEN, fetchImpl });
    expect(out?.result).toMatchObject({ kind: "movie", external_id: "603", year: 1999 });
    expect(out?.base.genres).toEqual(["tmdb:28", "tmdb:878"]);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });

  it("rejects a non-IMDb id without a call", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      findImdbDetails("nm0000001", "en-US", { token: TOKEN, fetchImpl })
    ).resolves.toBeNull();
  });
});

describe("tmdbGenres", () => {
  it("returns id/name rows in the requested tag", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ genres: [{ id: 28, name: "Action" }, { id: "x", name: "bad" }] })
    ) as unknown as typeof fetch;
    await expect(tmdbGenres("movie", "th-TH", { token: TOKEN, fetchImpl })).resolves.toEqual([
      { id: 28, name: "Action" },
    ]);
  });
});
