import { describe, expect, it } from "vitest";
import { parseImdbUrl, parsePasteUrl, parseTmdbUrl } from "./parse";

describe("parseTmdbUrl", () => {
  it("parses movie and tv URLs, with and without slug/locale", () => {
    expect(parseTmdbUrl("https://www.themoviedb.org/movie/603-the-matrix")).toEqual({
      provider: "tmdb",
      kind: "movie",
      external_id: "603",
    });
    expect(parseTmdbUrl("https://themoviedb.org/tv/1399")).toEqual({
      provider: "tmdb",
      kind: "series",
      external_id: "1399",
    });
    expect(parseTmdbUrl("https://www.themoviedb.org/fr/movie/603-matrix?language=fr")).toEqual({
      provider: "tmdb",
      kind: "movie",
      external_id: "603",
    });
  });

  it("rejects foreign hosts, wrong paths and non-http schemes", () => {
    expect(parseTmdbUrl("https://evil.example/movie/603")).toBeNull();
    expect(parseTmdbUrl("https://www.themoviedb.org/person/603")).toBeNull();
    expect(parseTmdbUrl("javascript:alert(1)")).toBeNull();
    expect(parseTmdbUrl("")).toBeNull();
  });
});

describe("parseImdbUrl", () => {
  it("parses tt ids only", () => {
    expect(parseImdbUrl("https://www.imdb.com/title/tt0133093/")).toEqual({
      provider: "imdb",
      imdb_id: "tt0133093",
    });
    expect(parseImdbUrl("https://m.imdb.com/title/tt0133093")).toEqual({
      provider: "imdb",
      imdb_id: "tt0133093",
    });
    expect(parseImdbUrl("https://www.imdb.com/name/nm0000206/")).toBeNull();
    expect(parseImdbUrl("https://imdb.evil.example/title/tt0133093")).toBeNull();
  });
});

describe("parsePasteUrl", () => {
  it("tries TMDB then IMDb", () => {
    expect(parsePasteUrl("https://www.imdb.com/title/tt0133093")?.provider).toBe("imdb");
    expect(parsePasteUrl("https://www.themoviedb.org/movie/603")?.provider).toBe("tmdb");
    expect(parsePasteUrl("https://example.com/movie/603")).toBeNull();
  });
});
