import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getStoredYouTubeToken } from "@/lib/youtube/client";
import { encryptToken, decryptToken } from "@/lib/youtube/token-crypto";

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: vi.fn(),
}));

import { getSupabaseServiceClient } from "@/lib/supabase/service";

const VALID_KEY = "abcdef0123456789".repeat(4); // 64 hex chars -> 32 bytes
const ORIGINAL_KEYS = {
  encryption: process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY,
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
};

const mockGetServiceClient = vi.mocked(getSupabaseServiceClient);

const fromMock = vi.fn();
const selectMock = vi.fn();
const eqSelectMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateMock = vi.fn();
const eqUpdateMock = vi.fn();
const fetchMock = vi.fn();

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    access_token: encryptToken("plain-access-token"),
    refresh_token: encryptToken("plain-refresh-token"),
    token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    channel_id: "UC123",
    revoked_at: null,
    ...overrides,
  };
}

function mockRow(row: Record<string, unknown> | null): void {
  maybeSingleMock.mockResolvedValue({ data: row, error: null });
}

function mockRefreshSuccess(payload: Record<string, unknown>): void {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response);
}

beforeEach(() => {
  process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = VALID_KEY;
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

  fromMock.mockReset();
  selectMock.mockReset();
  eqSelectMock.mockReset();
  maybeSingleMock.mockReset();
  updateMock.mockReset();
  eqUpdateMock.mockReset();

  mockGetServiceClient.mockReturnValue({ from: fromMock } as never);
  fromMock.mockReturnValue({
    select: selectMock,
    update: updateMock,
  });
  selectMock.mockImplementation(() => ({ eq: eqSelectMock }));
  eqSelectMock.mockImplementation(() => ({ maybeSingle: maybeSingleMock }));
  updateMock.mockImplementation(() => ({ eq: eqUpdateMock }));
  eqUpdateMock.mockResolvedValue({ error: null });
  mockRow(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  const restore = (name: string, original: string | undefined) => {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  };
  restore("YOUTUBE_TOKEN_ENCRYPTION_KEY", ORIGINAL_KEYS.encryption);
  restore("GOOGLE_CLIENT_ID", ORIGINAL_KEYS.clientId);
  restore("GOOGLE_CLIENT_SECRET", ORIGINAL_KEYS.clientSecret);
});

describe("getStoredYouTubeToken", () => {
  it("returns not_connected when no row exists for the user", async () => {
    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: false, error: "not_connected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not_connected when revoked_at is set", async () => {
    mockRow(makeRow({ revoked_at: new Date().toISOString() }));
    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: false, error: "not_connected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not_connected when refresh_token is null", async () => {
    mockRow(makeRow({ refresh_token: null }));
    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: false, error: "not_connected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the decrypted token without calling fetch when not expiring soon", async () => {
    mockRow(makeRow({ token_expires_at: "2099-01-01T00:00:00Z" }));
    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.token.accessToken).toBe("plain-access-token");
      expect(result.token.channelId).toBe("UC123");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refreshes when expired, persists the re-encrypted token, and returns the new plaintext token", async () => {
    mockRow(makeRow({ token_expires_at: "2020-01-01T00:00:00Z" }));
    mockRefreshSuccess({ access_token: "new-plain-access-token", expires_in: 3600 });

    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.token.accessToken).toBe("new-plain-access-token");
      expect(result.token.channelId).toBe("UC123");
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain("grant_type=refresh_token");
    expect(String(init?.body)).toContain("refresh_token=plain-refresh-token");

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArg = updateMock.mock.calls[0][0] as {
      access_token: string;
      token_expires_at: string;
    };
    expect(decryptToken(updateArg.access_token)).toBe("new-plain-access-token");
    expect(updateArg).not.toHaveProperty("refresh_token");
    const expiryMs = new Date(updateArg.token_expires_at).getTime();
    expect(expiryMs).toBeGreaterThan(Date.now() + 3590 * 1000);
    expect(expiryMs).toBeLessThanOrEqual(Date.now() + 3610 * 1000);
    expect(eqUpdateMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("refreshes when the token expires within the 5-minute buffer", async () => {
    mockRow(makeRow({ token_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString() }));
    mockRefreshSuccess({ access_token: "buffer-refreshed-token", expires_in: 3600 });

    const result = await getStoredYouTubeToken("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.token.accessToken).toBe("buffer-refreshed-token");
    }
  });

  it("returns refresh_failed and skips the DB update when Google returns non-2xx", async () => {
    mockRow(makeRow({ token_expires_at: "2020-01-01T00:00:00Z" }));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    } as unknown as Response);

    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: false, error: "refresh_failed" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns refresh_failed and skips the DB update when fetch throws", async () => {
    mockRow(makeRow({ token_expires_at: "2020-01-01T00:00:00Z" }));
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: false, error: "refresh_failed" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns decrypt_failed when the stored access token cannot be decrypted", async () => {
    mockRow(makeRow({ access_token: "v1:AAAA:BBBB:CCCC" }));
    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: false, error: "decrypt_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists a new encrypted refresh_token when the refresh response includes one", async () => {
    mockRow(makeRow({ token_expires_at: "2020-01-01T00:00:00Z" }));
    mockRefreshSuccess({
      access_token: "new-at-with-rt",
      expires_in: 3600,
      refresh_token: "new-plain-refresh-token",
    });

    const result = await getStoredYouTubeToken("user-1");
    expect(result).toMatchObject({ ok: true });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArg = updateMock.mock.calls[0][0] as {
      access_token: string;
      refresh_token?: string;
    };
    expect(decryptToken(updateArg.access_token)).toBe("new-at-with-rt");
    expect(updateArg.refresh_token).toBeDefined();
    expect(decryptToken(updateArg.refresh_token as string)).toBe("new-plain-refresh-token");
  });
});
