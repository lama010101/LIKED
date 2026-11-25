import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient,
}));

import { GET } from "./route";

function req(path: string) {
  return new Request(`https://liked.test${path}`);
}

describe("GET /api/delete-requests/confirm", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("missing token redirects to the generic invalid status without an RPC", async () => {
    const res = await GET(req("/api/delete-requests/confirm"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://liked.test/delete-account?status=invalid");
    expect(mocks.getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("unconfirmed token redirects to invalid", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc });
    const token = "a".repeat(32);
    const res = await GET(req(`/api/delete-requests/confirm?t=${token}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://liked.test/delete-account?status=invalid");
  });

  it("confirmed token redirects to confirmed", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc });
    const token = "a".repeat(32);
    const res = await GET(req(`/api/delete-requests/confirm?t=${token}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://liked.test/delete-account?status=confirmed");
  });
});
