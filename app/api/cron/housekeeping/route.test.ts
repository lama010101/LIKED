import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  processJobs: vi.fn(),
  runDeletionPipeline: vi.fn(),
  getSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient,
}));
vi.mock("@/lib/enrich/processJobs", () => ({ processJobs: mocks.processJobs }));
vi.mock("@/lib/account/deletionPipeline", () => ({
  runDeletionPipeline: mocks.runDeletionPipeline,
}));

import { GET } from "./route";

const SECRET = "c".repeat(32);

function req(authorization?: string): Request {
  return new Request("http://localhost/api/cron/housekeeping", {
    headers: authorization ? { authorization } : {},
  });
}

function setupHappyPath() {
  const client = { rpc: mocks.rpc };
  mocks.getSupabaseServiceClient.mockReturnValue(client);
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "enrichment_enqueue_stale") return { data: 3, error: null };
    if (fn === "items_purge_unreferenced") return { data: 2, error: null };
    if (fn === "housekeeping_purge") return { data: null, error: null };
    if (fn === "deletion_jobs_claim_stuck") {
      return {
        data: [{ user_id: "user-1", email: "u@example.com", stage: "auth", attempts: 1 }],
        error: null,
      };
    }
    return { data: null, error: null };
  });
  mocks.processJobs.mockResolvedValue({ ok: true, claimed: 3, done: 3, unavailable: 0, errored: 0 });
  mocks.runDeletionPipeline.mockResolvedValue({ ok: true, stage: "done" });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/cron/housekeeping", () => {
  it("CRON_SECRET unset -> 503 and no work runs", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "cron_unavailable" });
    expect(mocks.getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("missing or wrong bearer -> 401 and no work runs", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(mocks.getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("valid bearer -> ordered maintenance RPCs, worker drain, and stuck deletion resume", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    setupHappyPath();
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      enqueued: 3,
      itemsPurged: 2,
      stuckDeletionJobs: 1,
      deletionResumed: 1,
      deletionFailed: 0,
    });
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual([
      "enrichment_enqueue_stale",
      "items_purge_unreferenced",
      "housekeeping_purge",
      "deletion_jobs_claim_stuck",
    ]);
    expect(mocks.processJobs).toHaveBeenCalledTimes(1);
    expect(mocks.runDeletionPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", email: "u@example.com", fromStage: "auth" })
    );
  });

  it("maintenance RPC failure -> 500 without SQL detail", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.getSupabaseServiceClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "relation secret_table does not exist" } });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "housekeeping_failed" });
    expect(mocks.processJobs).not.toHaveBeenCalled();
  });
});
