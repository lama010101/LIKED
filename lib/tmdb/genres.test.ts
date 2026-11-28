import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), tmdbGet: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

vi.mock("./client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./client")>();
  return { ...mod, tmdbGenres: mocks.tmdbGet };
});

import { ensureTmdbGenres } from "./genres";

const savedEnv = { ...process.env };

function chain(data: unknown, error: unknown = null) {
  const limit = vi.fn(async () => ({ data, error }));
  const eq2 = { limit };
  const eq1 = { eq: vi.fn(() => eq2) };
  return { select: vi.fn(() => ({ eq: vi.fn(() => eq1) })) };
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.tmdbGet.mockReset();
});

afterAll(() => {
  process.env = savedEnv;
});

describe("ensureTmdbGenres (lazy sync)", () => {
  it("does nothing when rows already exist for media+lang", async () => {
    mocks.from.mockReturnValue(chain([{ id: 28 }]));
    const n = await ensureTmdbGenres("movie", "en-US", {
      rpc: mocks.rpc,
      from: mocks.from,
    } as never);
    expect(n).toBe(0);
    expect(mocks.tmdbGet).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fetches and syncs when the catalog is empty", async () => {
    mocks.from.mockReturnValue(chain([]));
    mocks.tmdbGet.mockResolvedValue([
      { id: 28, name: "Action" },
      { id: 12, name: "Adventure" },
    ]);
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    const n = await ensureTmdbGenres("movie", "en-US", {
      rpc: mocks.rpc,
      from: mocks.from,
    } as never);
    expect(n).toBe(2);
    expect(mocks.tmdbGet).toHaveBeenCalledWith("movie", "en-US");
    const [fn, params] = mocks.rpc.mock.calls[0] as unknown as [
      string,
      { p_rows: { media: string; id: number; lang: string; name: string }[] },
    ];
    expect(fn).toBe("tmdb_genres_sync");
    expect(params.p_rows).toEqual([
      { media: "movie", id: 28, lang: "en-US", name: "Action" },
      { media: "movie", id: 12, lang: "en-US", name: "Adventure" },
    ]);
  });

  it("returns 0 and never syncs when the upstream fetch fails", async () => {
    mocks.from.mockReturnValue(chain([]));
    mocks.tmdbGet.mockRejectedValue(new Error("TMDB_UPSTREAM"));
    const n = await ensureTmdbGenres("tv", "fr-FR", {
      rpc: mocks.rpc,
      from: mocks.from,
    } as never);
    expect(n).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
