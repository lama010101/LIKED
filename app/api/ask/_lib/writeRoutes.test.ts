import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), kick: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/enrich/kick", () => ({ kickEnrichment: mocks.kick }));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import { POST as submitPost } from "../submit/route";
import { GET as receiptGet } from "../receipt/route";
import { POST as deletePost } from "../delete-me/route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const CONTRIBUTOR_ID = "123e4567-e89b-42d3-a456-426614174000";
const ASK_ID = "223e4567-e89b-42d3-a456-426614174000";
const ITEM_ID = "323e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "ask-token-0123456789abcdefghijklmnop";
const BATCH_ID = "423e4567-e89b-42d3-a456-426614174000";
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const COOKIE = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, COOKIE_SECRET);

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.kick.mockReset();
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "guest_verify") {
      return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
    }
    if (fn === "guest_get_ask") {
      return {
        data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }],
        error: null,
      };
    }
    if (fn === "rl_hit") return { data: true, error: null };
    if (fn === "submit_recommendations") {
      return {
        data: {
          submission_id: "523e4567-e89b-42d3-a456-426614174000",
          accepted: 1,
          replayed: false,
          owner_display_name: "Owner",
        },
        error: null,
      };
    }
    if (fn === "guest_get_receipt") {
      return {
        data: [
          {
            item_id: ITEM_ID,
            kind: "movie",
            name: "The Matrix",
            year: 1999,
            poster_path: "/m.jpg",
            thumb_url: null,
            rating: 80,
            platform_text: null,
            comment: "zz-e2e comment",
            updated_at: "2026-11-24T00:00:00Z",
          },
        ],
        error: null,
      };
    }
    if (fn === "delete_guest_data") return { data: { deleted: true }, error: null };
    return { data: null, error: null };
  });
});

afterAll(() => {
  process.env = savedEnv;
});

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    origin: "http://localhost:3001",
    "content-type": "application/json",
    cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`,
    "x-ask-token": ASK_TOKEN,
    ...extra,
  };
}

function submitRequest(body: unknown, extra: Record<string, string> = {}): Request {
  return new Request("http://localhost:3001/api/ask/submit", {
    method: "POST",
    headers: headers(extra),
    body: JSON.stringify(body),
  });
}

const VALID_BATCH = {
  client_batch_id: BATCH_ID,
  items: [{ item_id: ITEM_ID, rating: 80, platform: null, comment: "zz-e2e" }],
};

describe("POST /api/ask/submit", () => {
  it("rejects a forged cookie with 401 and ZERO database calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, "wrong-key-wrong-key-wrong-key");
    const res = await submitPost(submitRequest(VALID_BATCH, { cookie: `${GUEST_COOKIE_NAME}=${forged}` }));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.kick).not.toHaveBeenCalled();
  });

  it("submits the batch through the single RPC and kicks enrichment", async () => {
    const res = await submitPost(submitRequest(VALID_BATCH));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; replayed: boolean };
    expect(body.accepted).toBe(1);
    expect(body.replayed).toBe(false);
    const call = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "submit_recommendations"
    ) as unknown as [string, Record<string, unknown>];
    expect(call[1]).toMatchObject({
      p_ask_token: ASK_TOKEN,
      p_contributor_id: CONTRIBUTOR_ID,
      p_client_batch_id: BATCH_ID,
    });
    expect(mocks.kick).toHaveBeenCalledTimes(1);
  });

  it("returns replayed=true for the same batch id without a second notification (RPC contract)", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") {
        return {
          data: { submission_id: "523e4567-e89b-42d3-a456-426614174000", accepted: 1, replayed: true },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const res = await submitPost(submitRequest(VALID_BATCH));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { replayed: boolean }).replayed).toBe(true);
  });

  it("maps the SQL error codes (DAILY_CAP 429, TOO_MANY_ITEMS 400, INVALID_RATING 400)", async () => {
    for (const [message, status] of [
      ["DAILY_CAP", 429],
      ["TOO_MANY_ITEMS", 400],
      ["INVALID_RATING", 400],
      ["CONTRIBUTOR_BLOCKED", 403],
      ["SELF_RECOMMEND", 409],
    ] as const) {
      mocks.rpc.mockImplementation(async (fn: string) => {
        if (fn === "guest_verify") {
          return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
        }
        if (fn === "guest_get_ask") {
          return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
        }
        if (fn === "rl_hit") return { data: true, error: null };
        if (fn === "submit_recommendations") return { data: null, error: { message } };
        return { data: null, error: null };
      });
      const res = await submitPost(submitRequest(VALID_BATCH));
      expect(res.status).toBe(status);
      expect(((await res.json()) as { error: string }).error).toBe(message);
      expect(mocks.kick).not.toHaveBeenCalled();
    }
  });

  it("retries once on a 23505 unique-violation race and returns replayed:true", async () => {
    let submitCalls = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") {
        submitCalls += 1;
        if (submitCalls === 1) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        return {
          data: { submission_id: "523e4567-e89b-42d3-a456-426614174000", accepted: 1, replayed: true },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const res = await submitPost(submitRequest(VALID_BATCH));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { replayed: boolean }).replayed).toBe(true);
    expect(submitCalls).toBe(2);
  });

  it("maps a second 23505 to ASK_UNAVAILABLE without a third RPC call", async () => {
    let submitCalls = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") {
        submitCalls += 1;
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
      return { data: null, error: null };
    });
    const res = await submitPost(submitRequest(VALID_BATCH));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("ASK_UNAVAILABLE");
    expect(submitCalls).toBe(2);
  });

  it("does not retry a non-23505 RPC error", async () => {
    let submitCalls = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") {
        submitCalls += 1;
        return { data: null, error: { code: "XX000", message: "SOME_OTHER" } };
      }
      return { data: null, error: null };
    });
    const res = await submitPost(submitRequest(VALID_BATCH));
    expect(res.status).toBe(503);
    expect(submitCalls).toBe(1);
  });

  it("rejects a batch over 20 items with 400 before the RPC", async () => {
    const items = Array.from({ length: 21 }, () => ({ item_id: ITEM_ID, rating: null }));
    const res = await submitPost(submitRequest({ client_batch_id: BATCH_ID, items }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("TOO_MANY_ITEMS");
  });

  it("rejects a missing batch id with 400", async () => {
    const res = await submitPost(submitRequest({ items: VALID_BATCH.items }));
    expect(res.status).toBe(400);
  });

  it("answers 429 on the 11th submit in the hour (ask_submit_c)", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "guest_get_ask") {
        return { data: [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }], error: null };
      }
      if (fn === "rl_hit" && params.p_bucket === "ask_submit_c") return { data: false, error: null };
      return { data: true, error: null };
    });
    const res = await submitPost(submitRequest(VALID_BATCH));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("rejects a cross-site Origin with 403", async () => {
    const res = await submitPost(submitRequest(VALID_BATCH, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/ask/receipt", () => {
  it("rejects a forged cookie with 401 and ZERO database calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, "wrong-key-wrong-key-wrong-key");
    const res = await receiptGet(
      new Request("http://localhost:3001/api/ask/receipt", {
        headers: { cookie: `${GUEST_COOKIE_NAME}=${forged}`, "x-ask-token": ASK_TOKEN },
      })
    );
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns the RPC rows for this contributor only", async () => {
    const res = await receiptGet(
      new Request("http://localhost:3001/api/ask/receipt", { headers: headers() })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { item_id: string; rating: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ item_id: ITEM_ID, rating: 80 });
    const call = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "guest_get_receipt"
    ) as unknown as [string, Record<string, unknown>];
    expect(call[1]).toMatchObject({
      p_ask_token: ASK_TOKEN,
      p_contributor_id: CONTRIBUTOR_ID,
      p_lang: "en-US",
    });
  });
});

describe("POST /api/ask/delete-me", () => {
  it("rejects a forged cookie with 401 and ZERO database calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, "wrong-key-wrong-key-wrong-key");
    const res = await deletePost(
      new Request("http://localhost:3001/api/ask/delete-me", {
        method: "POST",
        headers: { ...headers(), cookie: `${GUEST_COOKIE_NAME}=${forged}` },
        body: "{}",
      })
    );
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("deletes by cookie alone (no ask token) and clears the cookie", async () => {
    const req = new Request("http://localhost:3001/api/ask/delete-me", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        "content-type": "application/json",
        cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`,
      },
      body: "{}",
    });
    const res = await deletePost(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    const call = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "delete_guest_data"
    ) as unknown as [string, Record<string, unknown>];
    expect(call[1]).toMatchObject({ p_contributor_id: CONTRIBUTOR_ID });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${GUEST_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("is idempotent: a second call returns deleted=false", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") {
        return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
      }
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "delete_guest_data") return { data: { deleted: false }, error: null };
      return { data: null, error: null };
    });
    const res = await deletePost(
      new Request("http://localhost:3001/api/ask/delete-me", {
        method: "POST",
        headers: {
          origin: "http://localhost:3001",
          "content-type": "application/json",
          cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`,
        },
        body: "{}",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: false });
  });
});
