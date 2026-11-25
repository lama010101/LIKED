import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import { GET } from "./route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const TMDB_TOKEN = "t".repeat(40);
const CONTRIBUTOR_ID = "123e4567-e89b-42d3-a456-426614174000";
const ASK_ID = "223e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "ask-token-0123456789abcdefghijklmnop";
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const COOKIE = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, COOKIE_SECRET);

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  process.env.TMDB_API_READ_ACCESS_TOKEN = TMDB_TOKEN;
  process.env.YOUTUBE_API_KEY = "y".repeat(30);
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockImplementation(
    async (fn: string) => {
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
      if (fn === "yt_cache_get") return { data: null, error: null };
      if (fn === "yt_budget_consume") return { data: { allowed: false }, error: null };
      if (fn === "yt_cache_put") return { data: null, error: null };
      return { data: null, error: null };
    }
  );
  vi.unstubAllGlobals();
});

afterAll(() => {
  process.env = savedEnv;
  vi.unstubAllGlobals();
});

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3001${path}`, { headers });
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`, "x-ask-token": ASK_TOKEN, ...extra };
}

describe("GET /api/ask/search", () => {
  it("rejects a forged cookie with 401 and ZERO database calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, "wrong-key-wrong-key-wrong-key");
    const res = await GET(
      request("/api/ask/search?q=matrix", {
        cookie: `${GUEST_COOKIE_NAME}=${forged}`,
        "x-ask-token": ASK_TOKEN,
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "NOT_AUTHENTICATED" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects a missing cookie with 401", async () => {
    const res = await GET(request("/api/ask/search?q=matrix", { "x-ask-token": ASK_TOKEN }));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns TMDB results in the viewer tag from the LIKED_TMDB_LANG cookie", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            { media_type: "movie", id: 603, title: "Matrix", release_date: "1999-03-31" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(
      request("/api/ask/search?q=matrix&src=tmdb", authHeaders({ cookie: `${GUEST_COOKIE_NAME}=${COOKIE}; LIKED_TMDB_LANG=fr-FR` }))
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tmdb: { external_id: string }[] };
    expect(body.tmdb.map((r) => r.external_id)).toEqual(["603"]);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("language")).toBe("fr-FR");
  });

  it("derives the tag from Accept-Language when no cookie is set", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(
      request("/api/ask/search?q=matrix", authHeaders({ "accept-language": "th-TH,th;q=0.9" }))
    );
    expect(res.status).toBe(200);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("language")).toBe("th-TH");
  });

  it("answers the identical 404 body for an unknown token and counts the miss", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: null, error: { message: "ASK_NOT_ACTIVE" } };
      }
      return { data: true, error: null };
    });
    const res = await GET(request("/api/ask/search?q=matrix", authHeaders()));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "ASK_NOT_ACTIVE" });
    const buckets = mocks.rpc.mock.calls
      .filter((c) => (c as unknown as [string])[0] === "rl_hit")
      .map((c) => (c as unknown as [string, { p_bucket: string }])[1].p_bucket);
    expect(buckets).toContain("ask_token_miss");
  });

  it("answers 429 when the token-miss bucket is exhausted", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: null, error: { message: "ASK_NOT_ACTIVE" } };
      }
      if (fn === "rl_hit" && params.p_bucket === "ask_token_miss") {
        return { data: false, error: null };
      }
      return { data: true, error: null };
    });
    const res = await GET(request("/api/ask/search?q=matrix", authHeaders()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("answers 429 when the per-contributor search bucket is exhausted", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return {
          data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }],
          error: null,
        };
      }
      if (fn === "rl_hit" && params.p_bucket === "ask_search_c") {
        return { data: false, error: null };
      }
      return { data: true, error: null };
    });
    const res = await GET(request("/api/ask/search?q=matrix", authHeaders()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("serves the YouTube branch as busy when the budget is exhausted, without an upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(request("/api/ask/search?q=matrix&src=youtube", authHeaders()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ youtube: { status: "busy" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves cached YouTube results with zero upstream calls and zero budget units", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return {
          data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }],
          error: null,
        };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "yt_cache_get") {
        return {
          data: {
            status: "ok",
            results: [
              {
                source: "youtube",
                kind: "video",
                external_id: "dQw4w9WgXcQ",
                title: "Cached",
                channel: null,
                published_at: null,
                thumb_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
              },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(request("/api/ask/search?q=matrix&src=youtube", authHeaders()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { youtube: { status: string; results: { external_id: string }[] } };
    expect(body.youtube.status).toBe("ok");
    expect(body.youtube.results[0].external_id).toBe("dQw4w9WgXcQ");
    expect(fetchMock).not.toHaveBeenCalled();
    const fns = mocks.rpc.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(fns).not.toContain("yt_budget_consume");
  });

  it("fails closed with 503 when TMDB is not configured", async () => {
    delete process.env.TMDB_API_READ_ACCESS_TOKEN;
    const res = await GET(request("/api/ask/search?q=matrix", authHeaders()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ASK_UNAVAILABLE" });
  });
});
