import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

import * as route from "./route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const APP_URL = "https://liked.example.com";
const VALID_TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

function postRequest(token: string, origin: string | null = APP_URL): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${APP_URL}/api/delete-requests/confirm`, {
    method: "POST",
    headers,
    body: JSON.stringify({ token }),
  });
}

describe("/api/delete-requests/confirm two-step guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GUEST_COOKIE_SECRET", COOKIE_SECRET);
    vi.stubEnv("RATE_LIMIT_PEPPER", PEPPER);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GET never calls deletion_request_confirm", async () => {
    const res = await route.GET(
      new Request(`${APP_URL}/api/delete-requests/confirm?t=${VALID_TOKEN}`)
    );
    expect([303, 307, 308, 405]).toContain(res.status);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a guarded POST calls deletion_request_confirm", async () => {
    const post = (route as { POST?: (request: Request) => Promise<Response> }).POST;
    expect(post).toBeTypeOf("function");
    const res = await post!(postRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "confirmed" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "deletion_request_confirm",
      expect.objectContaining({ p_token_hash: expect.stringMatching(/^\\x[0-9a-f]{64}$/) })
    );
  });

  it("wrong or missing Origin is rejected before the RPC", async () => {
    const post = (route as { POST?: (request: Request) => Promise<Response> }).POST;
    expect(post).toBeTypeOf("function");
    for (const origin of ["https://evil.example.com", null]) {
      mocks.rpc.mockClear();
      const res = await post!(postRequest(VALID_TOKEN, origin));
      expect(res.status).toBe(403);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  });

  it("a malformed token returns generic invalid without an oracle", async () => {
    const post = (route as { POST?: (request: Request) => Promise<Response> }).POST;
    expect(post).toBeTypeOf("function");
    const res = await post!(postRequest("not a valid token"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
