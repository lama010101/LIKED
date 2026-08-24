import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({ rpc: mockRpc })),
}));

import { rpc } from "./rpc";

describe("rpc", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("returns the data on success", async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    const result = await rpc("some_fn", { a: 1 });

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith("some_fn", { a: 1 });
  });

  it("throws a namespaced error when Supabase returns one", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(rpc("some_fn", {})).rejects.toThrow("[RPC:some_fn] boom");
  });
});
