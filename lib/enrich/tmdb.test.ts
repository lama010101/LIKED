import { describe, expect, it } from "vitest";
import {
  fetchTmdbAvailability,
  fetchTmdbDetails,
  mapTmdbAvailability,
  mapTmdbDetails,
} from "./tmdb";
import type { EnrichmentItem } from "./types";

const movie: EnrichmentItem = {
  id: "i1",
  source: "tmdb",
  kind: "movie",
  external_id: "603",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("mapTmdbDetails", () => {
  it("maps a movie: namespaced genres, documentary flag, trailer, localized", () => {
    const payload = mapTmdbDetails({
      title: "The Matrix",
      release_date: "1999-03-31",
      original_language: "en",
      genres: [
        { id: 28, name: "Action" },
        { id: 99, name: "Documentary" },
      ],
      overview: "A hacker learns the truth.",
      tagline: "Welcome to the real world.",
      runtime: 136,
      poster_path: "/abc.jpg",
      vote_average: 8.2,
      vote_count: 25000,
      videos: {
        results: [
          { key: "no", site: "Vimeo", type: "Trailer" },
          { key: "yes", site: "YouTube", type: "Trailer" },
        ],
      },
    });
    expect(payload).toMatchObject({
      name: "The Matrix",
      release_date: "1999-03-31",
      original_language: "en",
      genres: ["tmdb:28", "tmdb:99"],
      is_documentary: true,
      runtime_min: 136,
      poster_path: "/abc.jpg",
      trailer_url: "https://www.youtube.com/watch?v=yes",
      tmdb_rating: 8.2,
      tmdb_votes: 25000,
      localized: {
        name: "The Matrix",
        overview: "A hacker learns the truth.",
        tagline: "Welcome to the real world.",
      },
    });
  });

  it("maps a series (name/first_air_date/episode_run_time) and omits empty values", () => {
    const payload = mapTmdbDetails({
      name: "Dark",
      first_air_date: "2017-12-01",
      episode_run_time: [60],
      overview: "",
      genres: [],
    });
    expect(payload.name).toBe("Dark");
    expect(payload.release_date).toBe("2017-12-01");
    expect(payload.runtime_min).toBe(60);
    expect(payload.overview).toBeUndefined();
    expect(payload.genres).toEqual([]);
    expect(payload.is_documentary).toBe(false);
    expect(payload.trailer_url).toBeUndefined();
  });
});

describe("mapTmdbAvailability", () => {
  it("emits Stream/Rent/Buy rows with the region link and no prices", () => {
    const rows = mapTmdbAvailability(
      {
        results: {
          US: {
            link: "https://www.themoviedb.org/movie/603/watch?locale=US",
            flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/n.png" }],
            rent: [{ provider_id: 2, provider_name: "Apple TV", logo_path: "/a.png" }],
            buy: [{ provider_id: 2, provider_name: "Apple TV" }],
          },
        },
      },
      "US"
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      provider_id: 8,
      provider: "Netflix",
      offer_type: "flatrate",
      link: "https://www.themoviedb.org/movie/603/watch?locale=US",
      logo_key: "/n.png",
    });
    expect(rows.map((r) => r.offer_type)).toEqual(["flatrate", "rent", "buy"]);
    expect(JSON.stringify(rows)).not.toMatch(/price/i);
  });

  it("returns an explicit empty list for a region absent from results", () => {
    expect(mapTmdbAvailability({ results: { FR: {} } }, "US")).toEqual([]);
    expect(mapTmdbAvailability({}, "US")).toEqual([]);
  });
});

describe("fetchTmdbDetails", () => {
  it("sends the bearer token, the language tag and append_to_response=videos", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = new Headers(init?.headers).get("authorization") ?? "";
      return jsonResponse({ title: "The Matrix", genres: [] });
    }) as typeof fetch;
    const res = await fetchTmdbDetails(movie, "fr-FR", { token: "tok", fetchImpl });
    expect(res.status).toBe("ok");
    expect(seenUrl).toContain("/movie/603?language=fr-FR&append_to_response=videos");
    expect(seenAuth).toBe("Bearer tok");
  });

  it("maps 404 to unavailable (item gone at the provider)", async () => {
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch;
    const res = await fetchTmdbDetails(movie, "en-US", { token: "tok", fetchImpl });
    expect(res).toEqual({ status: "unavailable" });
  });

  it("maps 500 to an error result without leaking the token", async () => {
    const fetchImpl = (async () => jsonResponse({}, 500)) as typeof fetch;
    const res = await fetchTmdbDetails(movie, "en-US", { token: "secret-token", fetchImpl });
    expect(res.status).toBe("error");
    expect(JSON.stringify(res)).not.toContain("secret-token");
  });

  it("maps a network throw to an error result", async () => {
    const fetchImpl = (async () => {
      throw new Error("dns down");
    }) as typeof fetch;
    const res = await fetchTmdbDetails(movie, "en-US", { token: "tok", fetchImpl });
    expect(res).toMatchObject({ status: "error" });
    if (res.status === "error") expect(res.message).toContain("dns down");
  });

  it("passes an AbortSignal and maps a timeout to a retryable error", async () => {
    let seenSignal: AbortSignal | null = null;
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      seenSignal = (init?.signal as AbortSignal | null) ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation timed out.", "TimeoutError"))
        );
      });
    }) as typeof fetch;
    const res = await fetchTmdbDetails(movie, "en-US", {
      token: "tok",
      fetchImpl,
      timeoutMs: 30,
    });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(res).toEqual({ status: "error", message: "provider_timeout" });
  });
});

describe("fetchTmdbAvailability", () => {
  it("requests watch/providers and maps the region", async () => {
    let seenUrl = "";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seenUrl = String(input);
      return jsonResponse({
        results: { FR: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } },
      });
    }) as typeof fetch;
    const res = await fetchTmdbAvailability(movie, "FR", { token: "tok", fetchImpl });
    expect(seenUrl).toContain("/movie/603/watch/providers");
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.value).toHaveLength(1);
  });
});
