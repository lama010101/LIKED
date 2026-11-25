import { describe, expect, it } from "vitest";
import { fetchYoutubeDetails, mapYoutubeDetails } from "./youtube";
import type { EnrichmentItem } from "./types";

const video: EnrichmentItem = {
  id: "i2",
  source: "youtube",
  kind: "video",
  external_id: "dQw4w9WgXcQ",
};
const channel: EnrichmentItem = {
  id: "i3",
  source: "youtube",
  kind: "channel",
  external_id: "UC1234567890123456789012",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("mapYoutubeDetails", () => {
  it("maps a video: title, publish date, audio language, channel identity", () => {
    expect(
      mapYoutubeDetails("video", {
        id: "dQw4w9WgXcQ",
        snippet: {
          title: "Never Gonna Give You Up",
          publishedAt: "2009-10-25T07:00:00Z",
          channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
          channelTitle: "Rick Astley",
          defaultAudioLanguage: "en",
        },
      })
    ).toEqual({
      name: "Never Gonna Give You Up",
      release_date: "2009-10-25",
      original_language: "en",
      creator_id: "UCuAXFkgsw1L7xaCfnd5JJOw",
      creator_name: "Rick Astley",
      localized: { name: "Never Gonna Give You Up" },
    });
  });

  it("maps a channel: id as creator_id, thumbnail url, no video-only fields", () => {
    expect(
      mapYoutubeDetails("channel", {
        id: "UC1234567890123456789012",
        snippet: {
          title: "Some Channel",
          publishedAt: "2015-01-02T00:00:00Z",
          thumbnails: { high: { url: "https://yt3.ggpht.com/x" } },
        },
      })
    ).toEqual({
      name: "Some Channel",
      release_date: "2015-01-02",
      creator_id: "UC1234567890123456789012",
      creator_name: "Some Channel",
      thumb_url: "https://yt3.ggpht.com/x",
      localized: { name: "Some Channel" },
    });
  });
});

describe("fetchYoutubeDetails", () => {
  it("calls videos.list for a video and keeps the key out of the result", async () => {
    let seenUrl = "";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seenUrl = String(input);
      return jsonResponse({
        items: [
          {
            id: "dQw4w9WgXcQ",
            snippet: { title: "T", publishedAt: "2020-01-01T00:00:00Z" },
          },
        ],
      });
    }) as typeof fetch;
    const res = await fetchYoutubeDetails(video, { key: "api-key-secret", fetchImpl });
    expect(seenUrl).toContain("/videos?");
    expect(seenUrl).toContain("id=dQw4w9WgXcQ");
    expect(seenUrl).toContain("key=api-key-secret");
    expect(res.status).toBe("ok");
    expect(JSON.stringify(res)).not.toContain("api-key-secret");
  });

  it("calls channels.list for a channel", async () => {
    let seenUrl = "";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seenUrl = String(input);
      return jsonResponse({ items: [{ id: channel.external_id, snippet: { title: "C" } }] });
    }) as typeof fetch;
    const res = await fetchYoutubeDetails(channel, { key: "k", fetchImpl });
    expect(seenUrl).toContain("/channels?");
    expect(res.status).toBe("ok");
  });

  it("maps an empty items list to unavailable (deleted/private video)", async () => {
    const fetchImpl = (async () => jsonResponse({ items: [] })) as typeof fetch;
    const res = await fetchYoutubeDetails(video, { key: "k", fetchImpl });
    expect(res).toEqual({ status: "unavailable" });
  });

  it("maps 403 (quota/forbidden) to an error result", async () => {
    const fetchImpl = (async () => jsonResponse({}, 403)) as typeof fetch;
    const res = await fetchYoutubeDetails(video, { key: "k", fetchImpl });
    expect(res).toEqual({ status: "error", message: "youtube_http_403" });
  });
});
