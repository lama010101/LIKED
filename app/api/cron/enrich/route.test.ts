import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/enrich/processJobs", () => ({ processJobs: vi.fn() }));

import { GET } from "./route";
import { processJobs } from "@/lib/enrich/processJobs";

const mockedProcessJobs = vi.mocked(processJobs);
const SECRET = "c".repeat(32);

function req(authorization?: string): Request {
  return new Request("http://localhost/api/cron/enrich", {
    headers: authorization ? { authorization } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/enrich — auth (fail closed)", () => {
  it("secret unset -> 503 cron_unavailable and the worker never runs", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "cron_unavailable" });
    expect(mockedProcessJobs).not.toHaveBeenCalled();
  });

  it("no Authorization header -> 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mockedProcessJobs).not.toHaveBeenCalled();
  });

  it("wrong secret -> 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(req("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockedProcessJobs).not.toHaveBeenCalled();
  });

  it("valid bearer -> 200 with the worker summary", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mockedProcessJobs.mockResolvedValue({
      ok: true,
      claimed: 2,
      done: 2,
      unavailable: 0,
      errored: 0,
    });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      claimed: 2,
      done: 2,
      unavailable: 0,
      errored: 0,
    });
    expect(mockedProcessJobs).toHaveBeenCalledTimes(1);
  });

  it("worker failure -> 500 without SQL detail", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mockedProcessJobs.mockRejectedValue(new Error("relation secret_table does not exist"));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "enrich_failed" });
  });
});
