import { describe, expect, it } from "vitest";
import { processJobs } from "./processJobs";
import type { EnrichDb, EnrichmentItem, EnrichmentJob } from "./types";

interface Call {
  fn: string;
  params: Record<string, unknown>;
}

function job(partial: Partial<EnrichmentJob> = {}): EnrichmentJob {
  return {
    id: "job-1",
    item_id: "item-1",
    job_kind: "details",
    param: "fr-FR",
    status: "processing",
    attempts: 0,
    ...partial,
  };
}

function item(partial: Partial<EnrichmentItem> = {}): EnrichmentItem {
  return {
    id: "item-1",
    source: "tmdb",
    kind: "movie",
    external_id: "603",
    ...partial,
  };
}

function makeClient(opts: {
  jobs?: EnrichmentJob[];
  items?: EnrichmentItem[];
  rpcError?: Record<string, { message: string }>;
  throwOn?: string;
} = {}) {
  const calls: Call[] = [];
  const tables: string[] = [];
  const client: EnrichDb = {
    async rpc(fn, params) {
      if (opts.throwOn === fn) throw new Error("rpc exploded");
      calls.push({ fn, params });
      const err = opts.rpcError?.[fn];
      if (err) return { data: null, error: err };
      return { data: fn === "enrichment_claim" ? (opts.jobs ?? []) : null, error: null };
    },
    from(table: string) {
      tables.push(table);
      return {
        select() {
          return {
            in: async () => ({ data: opts.items ?? [], error: null }),
          };
        },
      };
    },
  };
  return { client, calls, tables };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ENV = { tmdbToken: "tmdb-tok", youtubeKey: "yt-key" };

describe("processJobs — credentials", () => {
  it("is a no-op without any provider credential (no claim, no retries burned)", async () => {
    const { client, calls } = makeClient();
    const summary = await processJobs({
      client,
      env: { tmdbToken: null, youtubeKey: null },
    });
    expect(summary).toMatchObject({ ok: true, reason: "no_provider_credentials", claimed: 0 });
    expect(calls).toHaveLength(0);
  });

  it("returns an empty summary when no job is due", async () => {
    const { client } = makeClient({ jobs: [] });
    const summary = await processJobs({ client, env: ENV });
    expect(summary).toMatchObject({ ok: true, claimed: 0, done: 0, errored: 0 });
    expect(summary.reason).toBeUndefined();
  });

  it("propagates a claim RPC failure", async () => {
    const { client } = makeClient({ rpcError: { enrichment_claim: { message: "boom" } } });
    await expect(processJobs({ client, env: ENV })).rejects.toThrow("enrichment_claim: boom");
  });

  it("propagates an items read failure", async () => {
    const client = makeClient({ jobs: [job()] }).client;
    client.from = () => ({
      select: () => ({ in: async () => ({ data: null, error: { message: "read boom" } }) }),
    });
    await expect(processJobs({ client, env: ENV })).rejects.toThrow("items read: read boom");
  });
});

describe("processJobs — details", () => {
  it("TMDB details: applies the payload under the job tag, then finishes ok", async () => {
    const { client, calls, tables } = makeClient({
      jobs: [job()],
      items: [item()],
    });
    const fetchImpl = (async () =>
      jsonResponse({
        title: "The Matrix",
        genres: [{ id: 28, name: "Action" }],
        poster_path: "/abc.jpg",
        vote_average: 8.2,
      })) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });

    expect(tables).toEqual(["items"]);
    const apply = calls.find((c) => c.fn === "item_apply_details");
    expect(apply?.params).toMatchObject({ p_item_id: "item-1", p_tag: "fr-FR" });
    expect((apply?.params.p_payload as Record<string, unknown>).name).toBe("The Matrix");
    expect((apply?.params.p_payload as Record<string, unknown>).genres).toEqual(["tmdb:28"]);
    expect(calls.find((c) => c.fn === "enrichment_finish")?.params).toMatchObject({
      p_job_id: "job-1",
      p_ok: true,
    });
    expect(summary).toMatchObject({ claimed: 1, done: 1, errored: 0, unavailable: 0 });
  });

  it("TMDB 404: nulls the display fields and finishes ok (unavailable, not retried)", async () => {
    const { client, calls } = makeClient({ jobs: [job()], items: [item()] });
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });

    expect(calls.find((c) => c.fn === "item_refresh_apply")?.params).toMatchObject({
      p_item_id: "item-1",
      p_payload: {},
      p_unavailable: true,
    });
    expect(calls.find((c) => c.fn === "enrichment_finish")?.params.p_ok).toBe(true);
    expect(calls.some((c) => c.fn === "item_apply_details")).toBe(false);
    expect(summary).toMatchObject({ done: 1, unavailable: 1, errored: 0 });
  });

  it("TMDB 500: finishes not-ok with a sanitized error (retry owned by SQL)", async () => {
    const { client, calls } = makeClient({ jobs: [job()], items: [item()] });
    const fetchImpl = (async () => jsonResponse({}, 500)) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });

    expect(calls.find((c) => c.fn === "enrichment_finish")?.params).toMatchObject({
      p_ok: false,
      p_error: "tmdb_http_500",
    });
    expect(summary).toMatchObject({ done: 0, errored: 1 });
  });

  it("YouTube details: uses videos.list and never calls TMDB", async () => {
    const { client, calls } = makeClient({
      jobs: [job({ param: "en-US" })],
      items: [item({ source: "youtube", kind: "video", external_id: "dQw4w9WgXcQ" })],
    });
    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse({
        items: [{ id: "dQw4w9WgXcQ", snippet: { title: "Video", channelId: "UCx" } }],
      });
    }) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("googleapis.com/youtube/v3/videos");
    expect(calls.find((c) => c.fn === "item_apply_details")?.params.p_tag).toBe("en-US");
    expect(summary).toMatchObject({ done: 1 });
  });

  it("YouTube empty result: unavailable path", async () => {
    const { client, calls } = makeClient({
      jobs: [job()],
      items: [item({ source: "youtube", kind: "video", external_id: "aaaaaaaaaaa" })],
    });
    const fetchImpl = (async () => jsonResponse({ items: [] })) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });
    expect(calls.find((c) => c.fn === "item_refresh_apply")?.params.p_unavailable).toBe(true);
    expect(summary).toMatchObject({ done: 1, unavailable: 1 });
  });

  it("a provider credential missing for this item finishes not-ok without a call", async () => {
    const { client, calls } = makeClient({ jobs: [job()], items: [item()] });
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      return jsonResponse({});
    }) as typeof fetch;
    const summary = await processJobs({
      client,
      fetchImpl,
      env: { tmdbToken: null, youtubeKey: "yt" },
    });
    expect(fetched).toBe(0);
    expect(calls.find((c) => c.fn === "enrichment_finish")?.params).toMatchObject({
      p_ok: false,
      p_error: "credential_missing:TMDB_API_READ_ACCESS_TOKEN",
    });
    expect(summary).toMatchObject({ errored: 1 });
  });

  it("a job whose item row is missing finishes not-ok", async () => {
    const { client, calls } = makeClient({ jobs: [job()], items: [] });
    const summary = await processJobs({ client, env: ENV });
    expect(calls.find((c) => c.fn === "enrichment_finish")?.params).toMatchObject({
      p_ok: false,
      p_error: "item_not_found",
    });
    expect(summary).toMatchObject({ errored: 1 });
  });

  it("R2: a provider error carrying the API key never reaches p_error", async () => {
    const { client, calls } = makeClient({
      jobs: [job()],
      items: [item({ source: "youtube", kind: "video", external_id: "dQw4w9WgXcQ" })],
    });
    const leaky =
      "network: connect ECONNREFUSED https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=yt-key";
    const fetchImpl = (async () => {
      throw new Error(leaky);
    }) as typeof fetch;
    await processJobs({ client, fetchImpl, env: ENV });
    const pError = calls.find((c) => c.fn === "enrichment_finish")?.params.p_error;
    expect(typeof pError).toBe("string");
    expect(pError).not.toContain("yt-key");
    expect(pError).toContain("key=<redacted>");
  });
});

describe("processJobs — availability", () => {
  it("YouTube items have no providers: finished ok with no provider call", async () => {
    const { client, calls } = makeClient({
      jobs: [job({ job_kind: "availability", param: "US" })],
      items: [item({ source: "youtube", kind: "video" })],
    });
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched += 1;
      return jsonResponse({});
    }) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });
    expect(fetched).toBe(0);
    expect(calls.some((c) => c.fn === "item_apply_availability")).toBe(false);
    expect(summary).toMatchObject({ done: 1 });
  });

  it("TMDB availability: applies Stream/Rent/Buy rows for the region", async () => {
    const { client, calls } = makeClient({
      jobs: [job({ job_kind: "availability", param: "FR" })],
      items: [item()],
    });
    const fetchImpl = (async () =>
      jsonResponse({
        results: {
          FR: {
            link: "https://www.themoviedb.org/movie/603/watch?locale=FR",
            flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
          },
        },
      })) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });
    const apply = calls.find((c) => c.fn === "item_apply_availability");
    expect(apply?.params.p_region).toBe("FR");
    expect(apply?.params.p_rows).toEqual([
      {
        provider_id: 8,
        provider: "Netflix",
        offer_type: "flatrate",
        link: "https://www.themoviedb.org/movie/603/watch?locale=FR",
      },
    ]);
    expect(summary).toMatchObject({ done: 1 });
  });

  it("TMDB availability 404: writes the explicit empty fetch marker", async () => {
    const { client, calls } = makeClient({
      jobs: [job({ job_kind: "availability", param: "TH" })],
      items: [item()],
    });
    const fetchImpl = (async () => jsonResponse({}, 404)) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });
    expect(calls.find((c) => c.fn === "item_apply_availability")?.params).toMatchObject({
      p_region: "TH",
      p_rows: [],
    });
    expect(summary).toMatchObject({ done: 1 });
  });
});

describe("processJobs — failure handling", () => {
  it("counts a finish-RPC failure as errored and keeps processing", async () => {
    const { client } = makeClient({
      jobs: [job()],
      items: [item()],
      rpcError: { enrichment_finish: { message: "finish boom" } },
    });
    const fetchImpl = (async () => jsonResponse({ title: "X" })) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });
    expect(summary).toMatchObject({ claimed: 1, done: 0, errored: 1 });
  });

  it("catches a throwing RPC and reports it as a failed job", async () => {
    const { client, calls } = makeClient({
      jobs: [job()],
      items: [item()],
      throwOn: "item_apply_details",
    });
    const fetchImpl = (async () => jsonResponse({ title: "X" })) as typeof fetch;
    const summary = await processJobs({ client, fetchImpl, env: ENV });
    expect(calls.find((c) => c.fn === "enrichment_finish")?.params).toMatchObject({
      p_ok: false,
      p_error: "rpc exploded",
    });
    expect(summary).toMatchObject({ errored: 1 });
  });
});
