import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  verify: vi.fn(),
  rlBucket: vi.fn(),
  rlHit: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

vi.mock("@/lib/ask/rateLimit", () => ({
  rlBucket: mocks.rlBucket,
  rlHit: mocks.rlHit,
}));

vi.mock("@/lib/ask/humanCheck", () => ({
  getHumanCheckProvider: () => ({ verify: mocks.verify, issue: vi.fn() }),
  honeypotTripped: () => false,
}));

import { POST } from "./route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const APP_URL = "https://liked.example.com";

function deletionRequest(
  url = "https://spoofed.example.com/api/delete-requests",
  origin = APP_URL
): Request {
  return new Request(url, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "fixture@example.com", token: "pow-ok" }),
  });
}

describe("POST /api/delete-requests confirm link origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GUEST_COOKIE_SECRET", COOKIE_SECRET);
    vi.stubEnv("RATE_LIMIT_PEPPER", PEPPER);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    mocks.verify.mockResolvedValue(true);
    mocks.rlBucket.mockResolvedValue(true);
    mocks.rlHit.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses only NEXT_PUBLIC_APP_URL and points to the confirm page", async () => {
    const res = await POST(deletionRequest());
    expect(res.status).toBe(200);
    const call = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "deletion_request_create"
    ) as unknown as [string, { p_confirm_payload: { confirm_url: string } }];
    expect(call).toBeDefined();
    const confirmUrl = call[1].p_confirm_payload.confirm_url;
    expect(confirmUrl.startsWith(`${APP_URL}/delete-account/confirm?t=`)).toBe(true);
    expect(confirmUrl).not.toContain("spoofed.example.com");
    expect(confirmUrl).not.toContain("/api/delete-requests/confirm");
  });

  it("answers 503 without NEXT_PUBLIC_APP_URL and does not write", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const res = await POST(deletionRequest());
    expect(res.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
