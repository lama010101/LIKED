import { describe, expect, it, vi } from "vitest";
import { clientIpFromHeaders, hashRlKey } from "./clientIp";
import { RATE_LIMITS, rlBucket, rlHit } from "./rateLimit";

const headers = (h: Record<string, string>) => new Headers(h);

describe("clientIpFromHeaders (§4.3)", () => {
  it("first x-forwarded-for value wins", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip, then null", () => {
    expect(clientIpFromHeaders(headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": " , " , "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIpFromHeaders(headers({}))).toBeNull();
  });
});

describe("hashRlKey (T17: raw IPs never stored)", () => {
  it("deterministic 64-hex, scope/pepper/value sensitive", () => {
    const a = hashRlKey("ip", "1.2.3.4", "pepper-x");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRlKey("ip", "1.2.3.4", "pepper-x")).toBe(a);
    expect(hashRlKey("contributor", "1.2.3.4", "pepper-x")).not.toBe(a);
    expect(hashRlKey("ip", "1.2.3.4", "pepper-y")).not.toBe(a);
    expect(hashRlKey("ip", "5.6.7.8", "pepper-x")).not.toBe(a);
    expect(a).not.toContain("1.2.3.4");
  });
});

describe("rlHit / rlBucket (§4.3 buckets)", () => {
  it("passes bucket/key/window/limit to rl_hit and returns boolean", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as never;
    expect(await rlHit("b", "k", 60, 30, client)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rl_hit", {
      p_bucket: "b", p_key_hash: "k", p_window_seconds: 60, p_limit: 30,
    });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await rlHit("b", "k", 60, 30, client)).toBe(false);
  });

  it("rpc error fails closed (AskError ASK_UNAVAILABLE → 503)", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) } as never;
    await expect(rlHit("b", "k", 60, 1, client)).rejects.toMatchObject({
      code: "ASK_UNAVAILABLE",
      status: 503,
    });
  });

  it("rlBucket uses the §4.3 table values", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as never;
    await rlBucket("ask_submit_c", "kh", client);
    expect(rpc).toHaveBeenCalledWith("rl_hit", expect.objectContaining({
      p_bucket: "ask_submit_c", p_window_seconds: 3600, p_limit: 10,
    }));
    await rlBucket("ask_submit_token", "kh", client);
    expect(rpc).toHaveBeenLastCalledWith("rl_hit", expect.objectContaining({
      p_bucket: "ask_submit_token", p_window_seconds: 3600, p_limit: 300,
    }));
  });

  it("§4.3 table covers every documented bucket", () => {
    expect(RATE_LIMITS).toEqual({
      ask_view: { windowSeconds: 600, limit: 120 },
      ask_token_miss: { windowSeconds: 3600, limit: 20 },
      ask_session_ip: { windowSeconds: 3600, limit: 10 },
      ask_search_c: { windowSeconds: 60, limit: 30 },
      ask_search_ip: { windowSeconds: 60, limit: 60 },
      ask_resolve_c: { windowSeconds: 60, limit: 30 },
      ask_submit_c: { windowSeconds: 3600, limit: 10 },
      ask_submit_token: { windowSeconds: 3600, limit: 300 },
      delreq_ip: { windowSeconds: 3600, limit: 5 },
      acct_delete_user: { windowSeconds: 3600, limit: 5 },
    });
  });
});
