import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  verify: vi.fn(),
  rpc: vi.fn(),
  getSupabaseServiceClient: vi.fn(),
  rlBucket: vi.fn(),
  rlHit: vi.fn(),
  honeypotTripped: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient,
}));
vi.mock("@/lib/ask/guard", () => ({
  guardAskRequest: () => ({
    ok: true,
    ctx: { ipKeyHash: "ip-hash", secrets: { rateLimitPepper: "pepper" } },
  }),
  readAskJsonBody: async (request: Request) => ({ ok: true, body: await request.json() }),
}));
vi.mock("@/lib/ask/rateLimit", () => ({
  rlBucket: mocks.rlBucket,
  rlHit: mocks.rlHit,
}));
vi.mock("@/lib/ask/clientIp", () => ({ hashRlKey: () => "addr-hash" }));
vi.mock("@/lib/ask/humanCheck", () => ({
  getHumanCheckProvider: () => ({ issue: mocks.issue, verify: mocks.verify }),
  honeypotTripped: mocks.honeypotTripped,
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("https://liked.test/api/delete-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/delete-requests", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("unauthenticated challenge request -> 200 with a PoW challenge", async () => {
    mocks.issue.mockReturnValue("challenge-value");
    const res = await POST(req({ action: "challenge" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "challenge-value" });
  });

  it("unauthenticated malformed submission -> 400", async () => {
    const res = await POST(req({ email: "", token: "" }));
    expect(res.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("unauthenticated valid submission -> 200 generic non-oracle response", async () => {
    mocks.honeypotTripped.mockReturnValue(false);
    mocks.rlBucket.mockResolvedValue(true);
    mocks.rlHit.mockResolvedValue(true);
    mocks.verify.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc });
    const res = await POST(req({ email: "person@example.com", token: "pow-token" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "deletion_request_create",
      expect.objectContaining({ p_email: "person@example.com", p_ip_hash: "ip-hash" })
    );
  });
});
