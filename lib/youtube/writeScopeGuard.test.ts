import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  unlikeVideo,
  unsubscribeFromChannel,
  hasYouTubeWriteScope,
  YOUTUBE_SCOPE_MESSAGE,
} from "@/lib/youtube/client";

// client.ts imports the service client at module load — mock it even though
// unlikeVideo/unsubscribeFromChannel never touch it.
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: vi.fn(),
}));

const fetchMock = vi.fn();

function yt403(reasons: string[]) {
  return {
    ok: false,
    status: 403,
    json: async () => ({
      error: {
        code: 403,
        message: "Request had insufficient authentication scopes.",
        errors: reasons.map((reason) => ({ reason, domain: "youtube.api.v3" })),
      },
    }),
  } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YT-SCOPE-GUARD-001 — unlikeVideo", () => {
  it("returns the extra-permission message on a 403 insufficient-scope error", async () => {
    fetchMock.mockResolvedValue(yt403(["insufficientPermissions"]));
    const res = await unlikeVideo("token", "vid-1");
    expect(res).toEqual({ ok: false, error: YOUTUBE_SCOPE_MESSAGE });
  });

  it("returns the extra-permission message on insufficientAuthenticationScopes", async () => {
    fetchMock.mockResolvedValue(yt403(["insufficientAuthenticationScopes"]));
    const res = await unlikeVideo("token", "vid-1");
    expect(res).toEqual({ ok: false, error: YOUTUBE_SCOPE_MESSAGE });
  });

  it("does NOT return the scope message on a quota 403", async () => {
    fetchMock.mockResolvedValue(yt403(["quotaExceeded"]));
    const res = await unlikeVideo("token", "vid-1");
    expect(res.ok).toBe(false);
    expect(res.error).not.toBe(YOUTUBE_SCOPE_MESSAGE);
  });
});

describe("YT-SCOPE-GUARD-001 — unsubscribeFromChannel", () => {
  it("returns the extra-permission message on a 403 insufficient-scope error", async () => {
    fetchMock.mockResolvedValue(yt403(["insufficientPermissions"]));
    const res = await unsubscribeFromChannel("token", "sub-1");
    expect(res).toEqual({ ok: false, error: YOUTUBE_SCOPE_MESSAGE });
  });

  it("does NOT return the scope message on a quota 403", async () => {
    fetchMock.mockResolvedValue(yt403(["rateLimitExceeded"]));
    const res = await unsubscribeFromChannel("token", "sub-1");
    expect(res.ok).toBe(false);
    expect(res.error).not.toBe(YOUTUBE_SCOPE_MESSAGE);
  });
});

describe("hasYouTubeWriteScope", () => {
  it("false for a readonly-only grant", () => {
    expect(hasYouTubeWriteScope(["https://www.googleapis.com/auth/youtube.readonly"])).toBe(false);
  });
  it("true for the full youtube scope", () => {
    expect(hasYouTubeWriteScope(["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube"])).toBe(true);
  });
  it("null when scopes were never recorded", () => {
    expect(hasYouTubeWriteScope(null)).toBeNull();
    expect(hasYouTubeWriteScope([])).toBeNull();
    expect(hasYouTubeWriteScope(undefined)).toBeNull();
  });
});
