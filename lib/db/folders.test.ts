import { describe, it, expect, beforeEach, vi } from "vitest";
import { getFoldersForNodes } from "@/lib/db/folders";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/db/rpc", () => ({ rpc: vi.fn() }));
vi.mock("@/lib/db/permissions", () => ({
  hasFolderPermission: vi.fn(),
  assertFolderPermission: vi.fn(),
}));

import { getSupabaseServerClient } from "@/lib/supabase/server";

const mockGetServerClient = vi.mocked(getSupabaseServerClient);
const inMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({ in: inMock })),
    })),
  } as never);
});

describe("getFoldersForNodes", () => {
  it("returns an entry for every requested node_id — \"\" when no folder_edges row is visible", async () => {
    inMock.mockResolvedValue({
      data: [
        { node_id: "n1", folder_id: "f1" },
        { node_id: "n3", folder_id: "f3" },
      ],
      error: null,
    });
    const res = await getFoldersForNodes(["n1", "n2", "n3"]);
    expect(res).toEqual({ n1: "f1", n2: "", n3: "f3" });
    // Regression (BUG-CARDCLICK-002): every requested id must be present so
    // callers' "not yet fetched" sets empty after one round — a sparse map
    // made FeedHome refetch the same ids forever.
    for (const id of ["n1", "n2", "n3"]) expect(id in res).toBe(true);
  });

  it("keeps first folder per node when multiple edges exist", async () => {
    inMock.mockResolvedValue({
      data: [
        { node_id: "n1", folder_id: "f1" },
        { node_id: "n1", folder_id: "f2" },
      ],
      error: null,
    });
    const res = await getFoldersForNodes(["n1"]);
    expect(res).toEqual({ n1: "f1" });
  });

  it("returns {} for empty input without touching supabase", async () => {
    const res = await getFoldersForNodes([]);
    expect(res).toEqual({});
    expect(mockGetServerClient).not.toHaveBeenCalled();
  });

  it("throws on query error", async () => {
    inMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getFoldersForNodes(["n1"])).rejects.toThrow("Failed to fetch node folders");
  });
});
