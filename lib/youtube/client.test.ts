import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchLikedVideos,
  fetchSubscriptions,
  unlikeVideo,
  unsubscribeFromChannel,
} from "./client";

describe("fetchLikedVideos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps YouTube API items to YouTubeVideo shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "abc123",
              snippet: {
                title: "A video",
                thumbnails: { medium: { url: "https://i.ytimg.com/thumb.jpg" } },
                channelTitle: "A channel",
                channelId: "chan1",
                description: "desc",
              },
            },
          ],
          nextPageToken: "next-token",
        }),
      })
    );

    const result = await fetchLikedVideos("token");

    expect(result.error).toBeUndefined();
    expect(result.nextPageToken).toBe("next-token");
    expect(result.videos).toEqual([
      {
        id: "abc123",
        title: "A video",
        thumbnail: "https://i.ytimg.com/thumb.jpg",
        channelTitle: "A channel",
        channelId: "chan1",
        description: "desc",
      },
    ]);
  });

  it("falls back to defaults for missing snippet fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ id: "x", snippet: {} }] }),
      })
    );

    const result = await fetchLikedVideos("token");

    expect(result.videos).toEqual([
      { id: "x", title: "Unknown", thumbnail: "", channelTitle: "", channelId: "", description: "" },
    ]);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns an error when the API responds non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "quota exceeded", code: 403 } }),
      })
    );

    const result = await fetchLikedVideos("token");

    expect(result.videos).toEqual([]);
    expect(result.error).toBe("quota exceeded");
  });

  it("sends the pageToken when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchLikedVideos("token", "page-2");

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("pageToken=page-2");
  });
});

describe("fetchSubscriptions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps YouTube API items to YouTubeSubscription shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "sub1",
              snippet: {
                title: "A channel",
                thumbnails: { medium: { url: "https://yt3.ggpht.com/avatar.jpg" } },
                resourceId: { channelId: "chan1" },
              },
            },
          ],
        }),
      })
    );

    const result = await fetchSubscriptions("token");

    expect(result.subscriptions).toEqual([
      {
        id: "sub1",
        title: "A channel",
        thumbnail: "https://yt3.ggpht.com/avatar.jpg",
        channelId: "chan1",
        subscriberCount: "",
      },
    ]);
  });
});

describe("unlikeVideo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const result = await unlikeVideo("token", "video1");
    expect(result).toEqual({ ok: true });
  });

  it("surfaces the API error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "bad request" } }),
      })
    );
    const result = await unlikeVideo("token", "video1");
    expect(result).toEqual({ ok: false, error: "bad request" });
  });
});

describe("unsubscribeFromChannel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const result = await unsubscribeFromChannel("token", "sub1");
    expect(result).toEqual({ ok: true });
  });

  it("falls back to a generic error when the body can't be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })
    );
    const result = await unsubscribeFromChannel("token", "sub1");
    expect(result).toEqual({ ok: false, error: "YouTube API error: 500" });
  });
});
