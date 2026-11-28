import { describe, expect, it, vi } from "vitest";
import { runDeletionPipeline, type PipelineDb } from "./deletionPipeline";

function clientWithAdvanceFailure(): { client: PipelineDb; deleteUser: ReturnType<typeof vi.fn> } {
  const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  const client: PipelineDb = {
    rpc: vi.fn(async (fn: string) => {
      if (fn === "delete_account") return { data: { deleted: true }, error: null };
      if (fn === "deletion_job_advance") {
        return { data: null, error: { message: "injected ledger failure" } };
      }
      return { data: null, error: null };
    }),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    })),
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    auth: {
      admin: { deleteUser },
    },
  };
  return { client, deleteUser };
}

describe("runDeletionPipeline", () => {
  it("returns ok:false and remains resumable when the pre-done ledger advance fails", async () => {
    const { client, deleteUser } = clientWithAdvanceFailure();

    const result = await runDeletionPipeline({
      userId: "00000000-0000-4000-8000-000000000001",
      email: "fixture@example.com",
      client,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.stage).toBe("storage");
    expect(result.error).toContain("deletion_job_advance");
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
