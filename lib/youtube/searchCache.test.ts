import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

import {
  mapYouTubeSearchPayload,
  normalizeYouTubeQuery,
  searchYouTube,
  youtubeQueryKey,
  youtubeSearchTtlSeconds,
} from "./searchCache";

const YT_KEY = "y".repeat(30);
const CONTRIBUTOR = "123e4567-e89b-42d3-a456-426614174000";
const savedEnv = { ...process.env };

function ytResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function videoItem(id: string, title = "Video"): unknown {
  return {
    id: { videoId: id },
    snippet: { title, channelTitle: "Chan", publishedAt: "2024-01-01T00:00:00Z" },
  };
}

/** rpc router: yt_cache_get reads `cache` map; yt_budget_consume reads
 *  `budget`; yt_cache_put writes `cache`. */
function installRpc(cache: Map<string, unknown>, budget: { allowed: boolean }) {
  mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
    if (fn === "yt_cache_get") {
      const key = params.p_query_key as string;
      return { data: cache.has(key) ? cache.get(key) : null, error: null };
    }
    if (fn === "yt_cache_put") {
      cache.set(params.p_query_key as string, params.p_payload);
      return { data: null, error: null };
    }
    if (fn === "yt_budget_consume") {
      return { data: { allowed: budget.allowed }, error: null };
    }
    return { data: null, error: null };
  });
}

beforeEach(() => {
  process.env.YOUTUBE_API_KEY = YT_KEY;
  mocks.rpc.mockReset();
  vi.unstubAllGlobals();
});

afterAll(() => {
  process.env = savedEnv;
  vi.unstubAllGlobals();
});

describe("normalizeYouTubeQuery / youtubeQueryKey", () => {
  it("normalizes NFKC, case, whitespace", () => {
    expect(normalizeYouTubeQuery("  The   MATRIX ")).toBe("the matrix");
    expect(normalizeYouTubeQuery("Ｆｕｌｌ\u3000Ｗｉｄｔｈ")).toBe("full width");
  });

  it("keys on normalized|lang|region", () => {
    const a = youtubeQueryKey("the matrix", "en-US", "any");
    const b = youtubeQueryKey("the matrix", "fr-FR", "any");
    const c = youtubeQueryKey("the matrix", "en-US", "US");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(youtubeQueryKey("x", "en-US")).toBe(youtubeQueryKey("x", "en-US", "any"));
  });
});

describe("searchYouTube cache contract", () => {
  it("cache hit: zero upstream calls and zero budget units", async () => {
    const cache = new Map<string, unknown>();
    const key = youtubeQueryKey("the matrix", "en-US");
    cache.set(key, {
      status: "ok",
      results: [{ source: "youtube", kind: "video", external_id: "dQw4w9WgXcQ", title: "T" }],
    });
    installRpc(cache, { allowed: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchYouTube("The Matrix", {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
    });
    expect(out.status).toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
    const fns = mocks.rpc.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(fns).toEqual(["yt_cache_get"]);
  });

  it("expired/absent cache: budget consume -> upstream -> yt_cache_put (ttl<=12h)", async () => {
    const cache = new Map<string, unknown>();
    installRpc(cache, { allowed: true });
    const fetchMock = vi.fn(async () => ytResponse([videoItem("dQw4w9WgXcQ", "Matrix")]));
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchYouTube("the matrix", {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
      deps: { key: YT_KEY },
    });
    expect(out.status).toBe("ok");
    if (out.status === "ok") {
      expect(out.results[0].external_id).toBe("dQw4w9WgXcQ");
      expect(out.results[0].thumb_url).toContain("dQw4w9WgXcQ");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fns = mocks.rpc.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(fns).toEqual(["yt_cache_get", "yt_budget_consume", "yt_cache_put"]);
    const put = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "yt_cache_put"
    ) as unknown as [string, { p_ttl_seconds: number; p_payload: { status: string } }];
    expect(put[1].p_ttl_seconds).toBeLessThanOrEqual(12 * 3600);
    expect(put[1].p_payload.status).toBe("ok");
    // Second identical query = cache hit = still 1 upstream call total.
    const again = await searchYouTube("THE  MATRIX", {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
    });
    expect(again.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("error payload cached on upstream failure -> busy, then hit stays busy", async () => {
    const cache = new Map<string, unknown>();
    installRpc(cache, { allowed: true });
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchYouTube("boom", {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
      deps: { key: YT_KEY },
    });
    expect(out.status).toBe("busy");
    const puts = mocks.rpc.mock.calls.filter(
      (c) => (c as unknown as [string])[0] === "yt_cache_put"
    );
    expect(puts.length).toBe(1);
    const second = await searchYouTube("boom", {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
      deps: { key: YT_KEY },
    });
    expect(second.status).toBe("busy");
    // The cached error marker served the second call: no second upstream.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("budget exhausted -> busy with zero upstream calls", async () => {
    const cache = new Map<string, unknown>();
    installRpc(cache, { allowed: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchYouTube("exhausted", {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
      deps: { key: YT_KEY },
    });
    expect(out.status).toBe("busy");
    expect(fetchMock).not.toHaveBeenCalled();
    const fns = mocks.rpc.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(fns).toEqual(["yt_cache_get", "yt_budget_consume"]);
  });

  it("parallel identical requests share one budget unit and one upstream call", async () => {
    const cache = new Map<string, unknown>();
    installRpc(cache, { allowed: true });
    let resolveFetch: ((r: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const opts = {
      contributorId: CONTRIBUTOR,
      lang: "en-US",
      client: { rpc: mocks.rpc } as never,
      deps: { key: YT_KEY },
    };
    const p1 = searchYouTube("parallel query", opts);
    const p2 = searchYouTube("parallel query", opts);
    // Let both reach the in-flight check before upstream resolves.
    await new Promise((r) => setTimeout(r, 10));
    resolveFetch!(ytResponse([videoItem("dQw4w9WgXcQ")]));
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(o1.status).toBe("ok");
    expect(o2.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const consumes = mocks.rpc.mock.calls.filter(
      (c) => (c as unknown as [string])[0] === "yt_budget_consume"
    );
    expect(consumes.length).toBe(1);
  });
});

describe("mapYouTubeSearchPayload / ttl", () => {
  it("drops malformed rows and derives thumbs", () => {
    const rows = mapYouTubeSearchPayload({
      items: [
        videoItem("dQw4w9WgXcQ", "Good"),
        { id: { videoId: "bad!!" }, snippet: { title: "x" } },
        { id: {}, snippet: { title: "no id" } },
        { id: { videoId: "abcdefghijk" }, snippet: {} },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("video");
  });

  it("ttl honors env and caps at 12h", () => {
    process.env.YT_SEARCH_CACHE_TTL_HOURS = "6";
    expect(youtubeSearchTtlSeconds()).toBe(6 * 3600);
    process.env.YT_SEARCH_CACHE_TTL_HOURS = "48";
    expect(youtubeSearchTtlSeconds()).toBe(12 * 3600);
    delete process.env.YT_SEARCH_CACHE_TTL_HOURS;
    expect(youtubeSearchTtlSeconds()).toBe(12 * 3600);
  });
});
