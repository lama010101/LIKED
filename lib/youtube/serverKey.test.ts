import { describe, expect, it, vi } from "vitest";
import {
  fetchYouTubeChannel,
  fetchYouTubeVideo,
  parseYouTubeUrl,
  youtubeThumbUrl,
} from "./serverKey";

const KEY = "test-youtube-key-0123456789";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VIDEO_ITEM = {
  items: [
    {
      id: "dQw4w9WgXcQ",
      snippet: {
        title: "A video",
        publishedAt: "2009-10-25T06:57:33Z",
        channelId: "UC38IQsAvIsxxjztdMZQtwHA",
        channelTitle: "A channel",
        thumbnails: { high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" } },
      },
    },
  ],
};

const CHANNEL_ITEM = {
  items: [
    {
      id: "UC38IQsAvIsxxjztdMZQtwHA",
      snippet: {
        title: "A channel",
        thumbnails: { high: { url: "https://yt3.ggpht.com/abc=s800" } },
      },
    },
  ],
};

describe("parseYouTubeUrl", () => {
  it("accepts every supported video shape", () => {
    const id = "dQw4w9WgXcQ";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}&t=30`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://m.youtube.com/watch?v=${id}`,
    ]) {
      expect(parseYouTubeUrl(url)).toEqual({ kind: "video", external_id: id });
    }
  });

  it("accepts channel ids and handles, rejects custom /c/ URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/channel/UC38IQsAvIsxxjztdMZQtwHA")).toEqual({
      kind: "channel",
      external_id: "UC38IQsAvIsxxjztdMZQtwHA",
    });
    expect(parseYouTubeUrl("https://www.youtube.com/@SomeHandle")).toEqual({
      kind: "channel",
      handle: "@SomeHandle",
    });
    expect(parseYouTubeUrl("https://www.youtube.com/c/SomeName")).toBeNull();
  });

  it("rejects foreign hosts and bad ids", () => {
    expect(parseYouTubeUrl("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeUrl("ftp://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("youtubeThumbUrl", () => {
  it("derives the i.ytimg.com thumbnail from the id only", () => {
    expect(youtubeThumbUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
    expect(youtubeThumbUrl("bad")).toBeNull();
  });
});

describe("fetchYouTubeVideo", () => {
  it("calls videos.list once with the server key and maps base facts", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VIDEO_ITEM)) as unknown as typeof fetch;
    const out = await fetchYouTubeVideo("dQw4w9WgXcQ", { key: KEY, fetchImpl });
    const calls = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls.length).toBe(1);
    const url = new URL(calls[0][0]);
    expect(url.pathname).toBe("/youtube/v3/videos");
    expect(url.searchParams.get("id")).toBe("dQw4w9WgXcQ");
    expect(url.searchParams.get("key")).toBe(KEY);
    expect(out).toMatchObject({
      kind: "video",
      external_id: "dQw4w9WgXcQ",
      title: "A video",
      year: 2009,
      base: { creator_id: "UC38IQsAvIsxxjztdMZQtwHA", creator_name: "A channel", thumb_url: null },
    });
  });

  it("maps an empty items array to YT_NOT_FOUND", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] })) as unknown as typeof fetch;
    await expect(fetchYouTubeVideo("dQw4w9WgXcQ", { key: KEY, fetchImpl })).rejects.toMatchObject({
      code: "YT_NOT_FOUND",
    });
  });

  it("fails closed without a key and never puts the key in the message", async () => {
    await expect(fetchYouTubeVideo("dQw4w9WgXcQ", { key: null })).rejects.toMatchObject({
      code: "YT_NOT_CONFIGURED",
    });
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    const err = await fetchYouTubeVideo("dQw4w9WgXcQ", { key: KEY, fetchImpl }).catch((e) => e);
    expect(err.message).toBe("YT_UPSTREAM");
    expect(JSON.stringify(err)).not.toContain(KEY);
  });
});

describe("fetchYouTubeChannel", () => {
  it("uses forHandle for a handle and id for a channel id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CHANNEL_ITEM)) as unknown as typeof fetch;
    await fetchYouTubeChannel({ handle: "@SomeHandle" }, { key: KEY, fetchImpl });
    await fetchYouTubeChannel({ id: "UC38IQsAvIsxxjztdMZQtwHA" }, { key: KEY, fetchImpl });
    const calls = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls;
    expect(new URL(calls[0][0]).searchParams.get("forHandle")).toBe("@SomeHandle");
    expect(new URL(calls[1][0]).searchParams.get("id")).toBe("UC38IQsAvIsxxjztdMZQtwHA");
  });

  it("maps the avatar to thumb_url and returns kind=channel", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(CHANNEL_ITEM)) as unknown as typeof fetch;
    const out = await fetchYouTubeChannel({ id: "UC38IQsAvIsxxjztdMZQtwHA" }, { key: KEY, fetchImpl });
    expect(out).toMatchObject({
      kind: "channel",
      external_id: "UC38IQsAvIsxxjztdMZQtwHA",
      thumb_url: "https://yt3.ggpht.com/abc=s800",
    });
  });
});
