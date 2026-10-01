/** YouTube URL helpers (UX-BATCH-003): detect a video id from the common
 *  URL shapes so feed thumbnails and the card page can embed the player. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    if (/^(www\.|m\.)?youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(videoId: string, autoplay = true): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}${autoplay ? "?autoplay=1" : ""}`;
}
