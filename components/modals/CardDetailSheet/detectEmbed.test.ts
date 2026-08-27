import { describe, it, expect } from "vitest";
import { detectEmbed } from "./detectEmbed";

describe("detectEmbed", () => {
  describe("null / empty input", () => {
    it("returns none for null", () => {
      expect(detectEmbed(null)).toEqual({ kind: "none" });
    });

    it("returns none for empty string", () => {
      expect(detectEmbed("")).toEqual({ kind: "none" });
    });

    it("returns none for invalid URL string", () => {
      expect(detectEmbed("not-a-url")).toEqual({ kind: "none" });
    });
  });

  describe("YouTube", () => {
    it("detects youtube.com/watch?v=ID", () => {
      const result = detectEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result.kind).toBe("youtube");
      expect(result.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(result.platform).toBe("YouTube");
    });

    it("detects youtu.be/ID", () => {
      const result = detectEmbed("https://youtu.be/dQw4w9WgXcQ");
      expect(result.kind).toBe("youtube");
      expect(result.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(result.platform).toBe("YouTube");
    });

    it("detects youtube.com/embed/ID", () => {
      const result = detectEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(result.kind).toBe("youtube");
      expect(result.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    });

    it("detects youtube.com/shorts/ID", () => {
      const result = detectEmbed("https://www.youtube.com/shorts/abc123_-XYZ");
      expect(result.kind).toBe("youtube");
      expect(result.src).toBe("https://www.youtube.com/embed/abc123_-XYZ");
    });

    it("detects m.youtube.com", () => {
      const result = detectEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(result.kind).toBe("youtube");
    });
  });

  describe("Vimeo", () => {
    it("detects vimeo.com/ID", () => {
      const result = detectEmbed("https://vimeo.com/123456789");
      expect(result.kind).toBe("vimeo");
      expect(result.src).toContain("player.vimeo.com/video/123456789");
      expect(result.platform).toBe("Vimeo");
    });
  });

  describe("Spotify", () => {
    it("detects open.spotify.com/track/ID", () => {
      const result = detectEmbed("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT");
      expect(result.kind).toBe("spotify");
      expect(result.src).toContain("open.spotify.com/embed/track/");
      expect(result.platform).toBe("Spotify");
    });

    it("detects open.spotify.com/playlist/ID", () => {
      const result = detectEmbed("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
      expect(result.kind).toBe("spotify");
      expect(result.src).toContain("open.spotify.com/embed/playlist/");
    });

    it("detects open.spotify.com/album/ID", () => {
      const result = detectEmbed("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy");
      expect(result.kind).toBe("spotify");
      expect(result.src).toContain("open.spotify.com/embed/album/");
    });
  });

  describe("Suno", () => {
    it("detects suno.com/song/ID", () => {
      const result = detectEmbed("https://suno.com/song/abc-123-def");
      expect(result.kind).toBe("suno");
      expect(result.src).toContain("suno.com/embed/abc-123-def");
      expect(result.platform).toBe("Suno");
    });

    it("returns generic for suno.com without song path", () => {
      const result = detectEmbed("https://suno.com/");
      expect(result.kind).toBe("generic");
      expect(result.platform).toBe("Suno");
    });
  });

  describe("Audio files", () => {
    it("detects .mp3", () => {
      const result = detectEmbed("https://example.com/audio.mp3");
      expect(result.kind).toBe("audio");
      expect(result.platform).toBe("Audio");
    });

    it("detects .ogg", () => {
      const result = detectEmbed("https://example.com/audio.ogg");
      expect(result.kind).toBe("audio");
    });

    it("detects .wav", () => {
      const result = detectEmbed("https://example.com/audio.wav");
      expect(result.kind).toBe("audio");
    });

    it("detects .m4a", () => {
      const result = detectEmbed("https://example.com/audio.m4a");
      expect(result.kind).toBe("audio");
    });
  });

  describe("Video files", () => {
    it("detects .mp4", () => {
      const result = detectEmbed("https://example.com/video.mp4");
      expect(result.kind).toBe("video");
      expect(result.platform).toBe("Video");
    });

    it("detects .webm", () => {
      const result = detectEmbed("https://example.com/video.webm");
      expect(result.kind).toBe("video");
    });

    it("detects .mov", () => {
      const result = detectEmbed("https://example.com/video.mov");
      expect(result.kind).toBe("video");
    });
  });

  describe("Generic URLs", () => {
    it("returns generic for unknown domain", () => {
      const result = detectEmbed("https://example.com/article");
      expect(result.kind).toBe("generic");
      expect(result.src).toBe("https://example.com/article");
      expect(result.platform).toBe("example");
    });

    it("returns generic for github.com", () => {
      const result = detectEmbed("https://github.com/user/repo");
      expect(result.kind).toBe("generic");
      expect(result.platform).toBe("github");
    });
  });
});
