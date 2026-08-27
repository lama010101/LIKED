/**
 * Embed detection utility — extracted from CardDetailSheet.tsx
 * Detects the platform embed kind from a URL (YouTube, Vimeo, Spotify, etc.)
 */

export type EmbedKind = "youtube" | "vimeo" | "spotify" | "suno" | "audio" | "video" | "generic" | "none";

export function detectEmbed(url: string | null): {
  kind: EmbedKind;
  src?: string;
  platform?: string;
} {
  if (!url) return { kind: "none" };
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const pathname = u.pathname.toLowerCase();
    const ext = pathname.split(".").pop() ?? "";

    // Audio files
    if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
      return { kind: "audio", src: url, platform: "Audio" };
    }

    // Video files
    if (["mp4", "webm", "mov"].includes(ext)) {
      return { kind: "video", src: url, platform: "Video" };
    }

    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${id}`,
          platform: "YouTube",
        };
      }
      const m = u.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]+)/);
      if (m) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${m[1]}`,
          platform: "YouTube",
        };
      }
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${id}`,
          platform: "YouTube",
        };
      }
    }

    // Vimeo
    if (host === "vimeo.com") {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) {
        return {
          kind: "vimeo",
          src: `https://player.vimeo.com/video/${m[1]}?autoplay=0&title=0&byline=0&portrait=0`,
          platform: "Vimeo",
        };
      }
    }

    // Spotify
    if (host === "open.spotify.com" || host === "spotify.com") {
      // URL shape: /track/:id, /playlist/:id, /album/:id, /episode/:id
      const m = u.pathname.match(
        /^\/(track|playlist|album|episode|show)\/([A-Za-z0-9]+)/
      );
      if (m) {
        return {
          kind: "spotify",
          src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
          platform: "Spotify",
        };
      }
    }

    // Suno
    if (host === "suno.com" || host === "suno.ai") {
      const m = u.pathname.match(/^\/song\/([A-Za-z0-9-]+)/);
      if (m) {
        return {
          kind: "suno",
          src: `https://suno.com/embed/${m[1]}`,
          platform: "Suno",
        };
      }
      return { kind: "generic", src: url, platform: "Suno" };
    }

    // Generic
    return {
      kind: "generic",
      src: url,
      platform: host.split(".").slice(-2, -1)[0] ?? host,
    };
  } catch {
    return { kind: "none" };
  }
}
