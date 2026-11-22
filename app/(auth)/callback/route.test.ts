import { describe, expect, it, vi, beforeEach } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const serviceClientSpy = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession, getUser },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: serviceClientSpy,
}));

import { GET } from "./route";

const req = (qs: string) =>
  new Request(`http://localhost:3000/callback?${qs}`);

describe("auth callback (P0-07 / D25)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          provider_token: "yt-token",
          provider_refresh_token: "yt-refresh",
        },
      },
      error: null,
    });
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "u@example.com" } },
      error: null,
    });
  });

  it("a login carrying provider_token makes zero service-client calls", async () => {
    const res = await GET(req("code=abc"));
    expect(res.status).toBe(307);
    expect(serviceClientSpy).not.toHaveBeenCalled();
  });

  it("open-redirect attempts fall back to /feed", async () => {
    for (const bad of ["@evil.example", "//evil.example", "https://evil.example", "/\\evil"]) {
      const res = await GET(req(`code=abc&next=${encodeURIComponent(bad)}`));
      expect(res.headers.get("location")).toBe("http://localhost:3000/feed");
    }
  });

  it("a local path passes through", async () => {
    const res = await GET(req("code=abc&next=" + encodeURIComponent("/inbox?x=1")));
    expect(res.headers.get("location")).toBe("http://localhost:3000/inbox?x=1");
  });
});
