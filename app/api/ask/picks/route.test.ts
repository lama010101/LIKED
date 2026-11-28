// Threat tests for GET /api/ask/picks (V2-W9-LIBRARY-1128-001 §4.5 style).
// Mocked service client only; no live DB writes.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import { GET as picksGet } from "./route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const CONTRIBUTOR_ID = "123e4567-e89b-42d3-a456-426614174000";
const ASK_ID = "223e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "ask-token-0123456789abcdefghijklmnop";
const ASK_TOKEN_B = "ask-token-b-0123456789abcdefghijklm";
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const COOKIE = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, COOKIE_SECRET);
const savedEnv = { ...process.env };
const ASK_ROW = [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }];
const PICK_ROWS = [{
  kind: "movie", external_id: "550", source: "tmdb", name: "Film",
  release_year: 1999, poster_path: null, thumb_url: null,
  localized_names: { "en-US": "Film" },
}];

function rpcOk() {
  return async (fn: string, params: Record<string, unknown>) => {
    if (fn === "guest_verify") {
      return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
    }
    if (fn === "guest_get_ask") {
      return params.p_token === ASK_TOKEN || params.p_token === ASK_TOKEN_B
        ? { data: ASK_ROW, error: null }
        : { data: null, error: { message: "ASK_NOT_ACTIVE" } };
    }
    if (fn === "rl_hit") return { data: true, error: null };
    if (fn === "guest_get_picks") return { data: PICK_ROWS, error: null };
    return { data: null, error: null };
  };
}
beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  mocks.rpc.mockReset().mockImplementation(rpcOk());
});
afterAll(() => { process.env = savedEnv; });
function req(token = ASK_TOKEN, cookie = COOKIE) {
  return new Request(`http://localhost:3001/api/ask/picks?token=${token}`, {
    headers: { cookie: `${GUEST_COOKIE_NAME}=${cookie}` },
  });
}

describe("picks threat model", () => {
  it("is unreachable without a valid guest cookie", async () => {
    const res = await picksGet(new Request(`http://localhost:3001/api/ask/picks?token=${ASK_TOKEN}`));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("always binds the RPC to the signed cookie contributor and selected ask token", async () => {
    const res = await picksGet(req(ASK_TOKEN_B));
    expect(res.status).toBe(200);
    const call = mocks.rpc.mock.calls.find((c) => (c as unknown as [string])[0] === "guest_get_picks") as unknown as [string, Record<string, unknown>];
    expect(call[1].p_contributor_id).toBe(CONTRIBUTOR_ID);
    expect(call[1].p_ask_token).toBe(ASK_TOKEN_B);
  });

  it("returns only item display fields and no node/table/owner identifiers", async () => {
    const res = await picksGet(req());
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Record<string, unknown>[] };
    expect(body.items).toHaveLength(1);
    expect(Object.keys(body.items[0]).sort()).toEqual([
      "external_id", "kind", "name", "poster_path", "release_year", "source", "thumb_url",
    ]);
    expect(JSON.stringify(body)).not.toMatch(/node_id|owner_id|ask_id|contributor_id|table/i);
  });

  it("contributor eligibility is enforced inside guest_get_picks (zero-submission data is never selected by the route)", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "guest_get_picks") return { data: [], error: null };
      return rpcOk()(fn, params);
    });
    const res = await picksGet(req());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it("rate limiting is active through ask_view", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "rl_hit" && params.p_bucket === "ask_view") return { data: false, error: null };
      return rpcOk()(fn, params);
    });
    const res = await picksGet(req());
    expect(res.status).toBe(429);
    expect(mocks.rpc.mock.calls.some((c) => (c as unknown as [string])[0] === "guest_get_picks")).toBe(false);
  });

  it("migration grants do not allow authenticated guests to call guest_get_picks", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/153_v2_owner_picks.sql"), "utf8");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.guest_get_picks(text, uuid) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.guest_get_picks(text, uuid) TO service_role;");
    expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION public.guest_get_picks(text, uuid) TO authenticated");
  });
});
