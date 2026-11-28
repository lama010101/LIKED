import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// G1: the enrichment kick destination must come only from env config —
// never from the request. A spoofed Host / x-forwarded-host header (or a
// request object forced into the call) cannot move the bearer secret.

const afterQueue = vi.hoisted(() => ({ callbacks: [] as Array<() => unknown> }));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    afterQueue.callbacks.push(fn);
  },
}));

import { kickEnrichment } from "./kick";

const savedEnv = { ...process.env };

function kickAndRun(): Promise<void> {
  kickEnrichment();
  const fn = afterQueue.callbacks.pop();
  if (!fn) return Promise.resolve();
  return Promise.resolve(fn() as Promise<void>);
}

beforeEach(() => {
  afterQueue.callbacks.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => {
  process.env = savedEnv;
  vi.unstubAllGlobals();
});

describe("kickEnrichment (G1)", () => {
  it("fetches only the NEXT_PUBLIC_APP_URL origin even with spoofed Host / x-forwarded-host", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    process.env.CRON_SECRET = "cron-secret-0123456789abcdef";
    const spoofed = new Request("https://evil.example/api/ask/submit", {
      method: "POST",
      headers: {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-for": "203.0.113.9",
      },
    });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    // Even forcing the request into the call (extra arg JS would ignore)
    // cannot change the destination: the function reads env only.
    (kickEnrichment as (req?: unknown) => void)(spoofed);
    const fn = afterQueue.callbacks.pop();
    expect(fn).toBeTypeOf("function");
    await fn!();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.example.com/api/cron/enrich");
    expect(String(url)).not.toContain("evil.example");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer cron-secret-0123456789abcdef"
    );
  });

  it("falls back to https://$VERCEL_URL when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "liked-git-main.vercel.app";
    process.env.CRON_SECRET = "cron-secret-0123456789abcdef";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await kickAndRun();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://liked-git-main.vercel.app/api/cron/enrich");
    expect(warn).not.toHaveBeenCalledWith(
      "[enrich/kick] no app base URL — kick skipped"
    );
  });

  it("skips with a log and never fetches when no base URL env exists", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    process.env.CRON_SECRET = "cron-secret-0123456789abcdef";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await kickAndRun();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[enrich/kick] no app base URL — kick skipped");
  });

  it("skips with a log and never fetches when CRON_SECRET is unset", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    delete process.env.CRON_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await kickAndRun();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[enrich/kick] CRON_SECRET is not set — kick skipped");
  });
});
