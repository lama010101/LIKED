import { describe, expect, it, vi } from "vitest";
import { consumeYouTubeBudget, youtubeBudgetLimits } from "./budget";

function clientReturning(value: unknown) {
  const rpc = vi.fn(async () => ({ data: value, error: null }));
  return { rpc } as unknown as Parameters<typeof consumeYouTubeBudget>[2];
}

const CONTRIBUTOR = "123e4567-e89b-42d3-a456-426614174000";

describe("youtubeBudgetLimits", () => {
  it("reads positive integer env values and falls back on garbage", () => {
    const saved = { ...process.env };
    process.env.YT_SEARCH_DAILY_GLOBAL = "7";
    process.env.YT_SEARCH_DAILY_PER_CONTRIBUTOR = "0";
    process.env.YT_UNITS_DAILY_HARD_CAP = "nope";
    expect(youtubeBudgetLimits()).toEqual({
      globalSearchLimit: 7,
      contributorSearchLimit: 5,
      unitsHardCap: 8_000,
    });
    process.env = saved;
  });
});

describe("consumeYouTubeBudget", () => {
  it("passes the limits and contributor to yt_budget_consume", async () => {
    const client = clientReturning({ allowed: true });
    const ok = await consumeYouTubeBudget("search", CONTRIBUTOR, client, {
      globalSearchLimit: 11,
      contributorSearchLimit: 3,
      unitsHardCap: 900,
    });
    expect(ok).toBe(true);
    const rpc = (client as unknown as { rpc: { mock: { calls: [string, Record<string, unknown>][] } } })
      .rpc;
    expect(rpc.mock.calls[0][0]).toBe("yt_budget_consume");
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_contributor_id: CONTRIBUTOR,
      p_kind: "search",
      p_global_search_limit: 11,
      p_contributor_search_limit: 3,
      p_units_hard_cap: 900,
    });
  });

  it("returns false when a scope is exhausted", async () => {
    const client = clientReturning({ allowed: false, reason: "global_search" });
    await expect(consumeYouTubeBudget("search", CONTRIBUTOR, client)).resolves.toBe(false);
  });

  it("fails closed on an RPC error or a missing contributor", async () => {
    const failing = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
    } as unknown as Parameters<typeof consumeYouTubeBudget>[2];
    await expect(consumeYouTubeBudget("resolve", null, failing)).resolves.toBe(false);
    const spy = clientReturning({ allowed: true });
    await expect(consumeYouTubeBudget("search", null, spy)).resolves.toBe(false);
    expect(
      (spy as unknown as { rpc: { mock: { calls: unknown[] } } }).rpc.mock.calls.length
    ).toBe(0);
  });

  it("never sends a contributor id for resolve", async () => {
    const client = clientReturning({ allowed: true });
    await consumeYouTubeBudget("resolve", CONTRIBUTOR, client);
    const rpc = (client as unknown as { rpc: { mock: { calls: [string, Record<string, unknown>][] } } })
      .rpc;
    expect(rpc.mock.calls[0][1].p_contributor_id).toBeNull();
  });
});
