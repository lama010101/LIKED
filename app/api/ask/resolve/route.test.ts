import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import { POST } from "./route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const TMDB_TOKEN = "t".repeat(40);
const YT_KEY = "y".repeat(40);
const CONTRIBUTOR_ID = "123e4567-e89b-42d3-a456-426614174000";
const ASK_ID = "223e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "ask-token-0123456789abcdefghijklmnop";
const ITEM_ID = "323e4567-e89b-42d3-a456-426614174000";
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const COOKIE = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, COOKIE_SECRET);

const savedEnv = { ...process.env };

const ITEM_ROW = {
  id: ITEM_ID,
  source: "tmdb",
  kind: "movie",
  external_id: "603",
  name: "The Matrix",
  release_date: "1999-03-31",
  poster_path: "/m.jpg",
  thumb_url: null,
  fetched_at: new Date().toISOString(),
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  process.env.TMDB_API_READ_ACCESS_TOKEN = TMDB_TOKEN;
  process.env.YOUTUBE_API_KEY = YT_KEY;
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "guest_verify") {
      return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
    }
    if (fn === "guest_get_ask") {
      return {
        data: [
          {
            ask_id: ASK_ID,
            owner_display_name: "Owner",
            owner_avatar_key: null,
            prompt: null,
            note: null,
            liked_genres: [],
            owner_has_visible_picks: false,
          },
        ],
        error: null,
      };
    }
    if (fn === "rl_hit") return { data: true, error: null };
    if (fn === "yt_budget_consume") return { data: { allowed: true }, error: null };
    if (fn === "upsert_item") return { data: ITEM_ROW, error: null };
    return { data: null, error: null };
  });
  mocks.from.mockImplementation(() => ({
    select: () => {
      const chain = {
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  }));
  vi.unstubAllGlobals();
});

afterAll(() => {
  process.env = savedEnv;
  vi.unstubAllGlobals();
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3001/api/ask/resolve", {
    method: "POST",
    headers: {
      origin: "http://localhost:3001",
      "content-type": "application/json",
      cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`,
      "x-ask-token": ASK_TOKEN,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ask/resolve", () => {
  it("rejects a forged cookie with 401 and ZERO database calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, "wrong-key-wrong-key-wrong-key");
    const res = await POST(
      post({ source: "tmdb", kind: "movie", external_id: "603" }, { cookie: `${GUEST_COOKIE_NAME}=${forged}` })
    );
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects a cross-site POST without a matching Origin (403)", async () => {
    const res = await POST(
      post({ url: "https://www.themoviedb.org/movie/603" }, { origin: "https://evil.example" })
    );
    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("resolves a pasted TMDB URL through upsert_item", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 603,
        title: "The Matrix",
        release_date: "1999-03-31",
        genres: [{ id: 28, name: "Action" }],
        poster_path: "/m.jpg",
        vote_average: 8.2,
        vote_count: 100,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: "https://www.themoviedb.org/movie/603-the-matrix" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item_id: string; external_id: string; year: number };
    expect(body).toMatchObject({ item_id: ITEM_ID, external_id: "603", year: 1999 });
    const upsert = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "upsert_item"
    ) as unknown as [string, Record<string, unknown>];
    expect(upsert[1]).toMatchObject({
      p_source: "tmdb",
      p_kind: "movie",
      p_external_id: "603",
    });
    const base = upsert[1].p_base as Record<string, unknown>;
    expect(base.genres).toEqual(["tmdb:28"]);
  });

  it("resolves a pasted IMDb URL with one /find call", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        movie_results: [
          { id: 603, title: "The Matrix", release_date: "1999-03-31", genre_ids: [28] },
        ],
        tv_results: [],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: "https://www.imdb.com/title/tt0133093/" }));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBe(1);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/3/find/tt0133093");
  });

  it("answers 422 for an unsupported URL without any provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: "https://www.youtube.com/c/SomeName" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "UNSUPPORTED_URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a YouTube video with 1 quota unit and upserts kind=video", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: "dQw4w9WgXcQ",
            snippet: {
              title: "A video",
              publishedAt: "2009-10-25T06:57:33Z",
              channelId: "UC38IQsAvIsxxjztdMZQtwHA",
              channelTitle: "A channel",
            },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(res.status).toBe(200);
    const budget = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "yt_budget_consume"
    ) as unknown as [string, Record<string, unknown>];
    expect(budget[1]).toMatchObject({ p_kind: "resolve", p_contributor_id: null });
    const upsert = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "upsert_item"
    ) as unknown as [string, Record<string, unknown>];
    expect(upsert[1]).toMatchObject({ p_source: "youtube", p_kind: "video", p_external_id: "dQw4w9WgXcQ" });
  });

  it("resolves a pure playlist URL as kind=playlist through playlists.list", async () => {
    const id = "PLMlG3wbBwCVZ4N44bIm-K_DWRgv8NWNiu";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id,
            snippet: {
              title: "A playlist",
              channelId: "UC38IQsAvIsxxjztdMZQtwHA",
              channelTitle: "A channel",
              thumbnails: { high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" } },
            },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: `https://www.youtube.com/playlist?list=${id}` }));
    expect(res.status).toBe(200);
    const calls = fetchMock.mock.calls as unknown as [string][];
    expect(calls.length).toBe(1);
    const url = new URL(calls[0][0]);
    expect(url.pathname).toBe("/youtube/v3/playlists");
    expect(url.searchParams.get("part")).toBe("snippet");
    const upsert = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "upsert_item"
    ) as unknown as [string, Record<string, unknown>];
    expect(upsert[1]).toMatchObject({ p_source: "youtube", p_kind: "playlist", p_external_id: id });
    const base = upsert[1].p_base as Record<string, unknown>;
    expect(base).toMatchObject({ name: "A playlist", creator_name: "A channel" });
  });

  it("keeps watch?v=…&list=… a video and rejects RD/LL/WL playlists with 422 and no provider call", async () => {
    const videoPayload = {
      items: [
        {
          id: "dQw4w9WgXcQ",
          snippet: { title: "A video", publishedAt: "2009-10-25T06:57:33Z", channelId: "UC38IQsAvIsxxjztdMZQtwHA", channelTitle: "A channel" },
        },
      ],
    };
    const fetchMock = vi.fn(async () => jsonResponse(videoPayload));
    vi.stubGlobal("fetch", fetchMock);
    const list = "PLMlG3wbBwCVZ4N44bIm-K_DWRgv8NWNiu";
    const res = await POST(post({ url: `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${list}` }));
    expect(res.status).toBe(200);
    const upsert = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "upsert_item"
    ) as unknown as [string, Record<string, unknown>];
    expect(upsert[1]).toMatchObject({ p_kind: "video", p_external_id: "dQw4w9WgXcQ" });

    for (const bad of ["RDDQw4w9WgXcQ", "LL", "WL"]) {
      mocks.rpc.mockClear();
      (fetchMock as unknown as { mockClear: () => void }).mockClear();
      const blocked = await POST(post({ url: `https://www.youtube.com/playlist?list=${bad}` }));
      expect(blocked.status).toBe(422);
      expect(await blocked.json()).toEqual({ error: "UNSUPPORTED_URL" });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("resolves an explicit {source:youtube, kind:playlist} body", async () => {
    const id = "PLMlG3wbBwCVZ4N44bIm-K_DWRgv8NWNiu";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id,
            snippet: {
              title: "A playlist",
              channelId: "UC38IQsAvIsxxjztdMZQtwHA",
              channelTitle: "A channel",
            },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ source: "youtube", kind: "playlist", external_id: id }));
    expect(res.status).toBe(200);
    const upsert = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "upsert_item"
    ) as unknown as [string, Record<string, unknown>];
    expect(upsert[1]).toMatchObject({ p_kind: "playlist", p_external_id: id });
  });

  it("answers NOT_FOUND when playlists.list returns an empty items array", async () => {
    const id = "PLMlG3wbBwCVZ4N44bIm-K_DWRgv8NWNiu";
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: `https://www.youtube.com/playlist?list=${id}` }));
    expect(res.status).toBe(404);
  });

  it("answers {status:'busy'} when the resolve budget is exhausted, with no upstream call", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "yt_budget_consume") return { data: { allowed: false, reason: "global_units" }, error: null };
      return { data: null, error: null };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(post({ url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "busy" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413", async () => {
    const big = { url: "https://youtu.be/dQw4w9WgXcQ", pad: "x".repeat(70 * 1024) };
    const res = await POST(post(big));
    expect(res.status).toBe(413);
  });

  it("rejects malformed JSON with 400", async () => {
    const req = new Request("http://localhost:3001/api/ask/resolve", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        "content-type": "application/json",
        cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`,
        "x-ask-token": ASK_TOKEN,
      },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
