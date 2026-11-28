// Threat-model route tests (PLAN-V2-002 §4.5, P0-23). One test per T-row
// that is automatable at the route layer with a mocked service client —
// no PROD writes. Rows needing a live DB/RLS probe or a route that is not
// on main yet are mapped NOT AUTOMATABLE in docs/handoff/V2-W7-LEDGER.md.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), kick: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/enrich/kick", () => ({ kickEnrichment: mocks.kick }));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import { powHumanCheck, solvePowChallenge } from "@/lib/ask/humanCheck";
import { safeNext } from "@/lib/auth/safeNext";
import { POST as submitPost } from "../submit/route";
import { GET as receiptGet } from "../receipt/route";
import { GET as searchGet } from "../search/route";
import { POST as sessionPost } from "../session/route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const CONTRIBUTOR_ID = "123e4567-e89b-42d3-a456-426614174000";
const CONTRIBUTOR_B = "923e4567-e89b-42d3-a456-426614174000";
const ASK_ID = "223e4567-e89b-42d3-a456-426614174000";
const ITEM_ID = "323e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "ask-token-0123456789abcdefghijklmnop";
const DEAD_TOKEN = "dead-token-ffffffffffffffffffffffff";
const BATCH_ID = "423e4567-e89b-42d3-a456-426614174000";
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const COOKIE = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, COOKIE_SECRET);

const savedEnv = { ...process.env };

const ASK_ROW = [{ ask_id: ASK_ID, owner_display_name: "Owner", liked_genres: [] }];

function rpcOk() {
  return async (fn: string, params: Record<string, unknown>) => {
    if (fn === "guest_verify") {
      const cid = String(params.p_contributor_id ?? "");
      const sec = cid === CONTRIBUTOR_B ? Buffer.alloc(32, 9) : Buffer.alloc(32, 7);
      return { data: "\\x" + guestSecretHash(sec.toString("base64url")).toString("hex"), error: null };
    }
    if (fn === "guest_get_ask") {
      return params.p_token === ASK_TOKEN ? { data: ASK_ROW, error: null } : { data: null, error: { message: "ASK_NOT_ACTIVE" } };
    }
    if (fn === "rl_hit") return { data: true, error: null };
    if (fn === "submit_recommendations") {
      return { data: { submission_id: "523e4567-e89b-42d3-a456-426614174000", accepted: 1, replayed: false, owner_display_name: "Owner" }, error: null };
    }
    if (fn === "guest_get_receipt") {
      return { data: [{ item_id: ITEM_ID, kind: "movie", name: "Film", year: 2000, poster_path: null, thumb_url: null, rating: 80, platform_text: null, comment: null, updated_at: "2026-11-28T00:00:00Z" }], error: null };
    }
    if (fn === "guest_create_contributor") return { data: "623e4567-e89b-42d3-a456-426614174000", error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  mocks.rpc.mockReset().mockImplementation(rpcOk());
  mocks.from.mockReset();
  mocks.kick.mockReset();
});

afterAll(() => {
  process.env = savedEnv;
});

function postHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    origin: "http://localhost:3001",
    "content-type": "application/json",
    cookie: `${GUEST_COOKIE_NAME}=${COOKIE}`,
    "x-ask-token": ASK_TOKEN,
    ...extra,
  };
}

function jsonPost(url: string, body: unknown, extra: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers: postHeaders(extra), body: JSON.stringify(body) });
}

const VALID_BATCH = {
  client_batch_id: BATCH_ID,
  items: [{ item_id: ITEM_ID, rating: 80, platform: null, comment: "hi" }],
};

// ---------- T1 token enumeration ----------
describe("T1 token enumeration", () => {
  it("T1 dead tokens return byte-identical 404 bodies", async () => {
    const mk = (token: string) =>
      receiptGet(new Request(`http://localhost:3001/api/ask/receipt?token=${token}`, {
        headers: { cookie: `${GUEST_COOKIE_NAME}=${COOKIE}` },
      }));
    const r1 = await mk(DEAD_TOKEN);
    const r2 = await mk("dead-token-eeeeeeeeeeeeeeeeeeeeeeee");
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
    const t1 = await r1.text();
    const t2 = await r2.text();
    expect(t1).toBe(t2);
    expect(t1).toContain("ASK_NOT_ACTIVE");
  });

  it("T1 the 21st miss in the hour is 429 (ask_token_miss bucket)", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: null, error: { message: "ASK_NOT_ACTIVE" } };
      if (fn === "rl_hit") return { data: params.p_bucket !== "ask_token_miss", error: null };
      return { data: null, error: null };
    });
    const res = await receiptGet(new Request(`http://localhost:3001/api/ask/receipt?token=${DEAD_TOKEN}`, {
      headers: { cookie: `${GUEST_COOKIE_NAME}=${COOKIE}` },
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });
});

// ---------- T2 cookie replay / forgery ----------
describe("T2 guest cookie", () => {
  it("T2 a tampered-signature cookie is rejected with ZERO database calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, "wrong-key-wrong-key-wrong-key");
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH, { cookie: `${GUEST_COOKIE_NAME}=${forged}` }));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("T2 a signature-valid cookie with the wrong secret costs only guest_verify then 401", async () => {
    const wrongSecret = Buffer.alloc(32, 3).toString("base64url");
    const cookie = signGuestCookieValue(CONTRIBUTOR_ID, wrongSecret, COOKIE_SECRET);
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH, { cookie: `${GUEST_COOKIE_NAME}=${cookie}` }));
    expect(res.status).toBe(401);
    const fns = mocks.rpc.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(fns).toEqual(["guest_verify"]);
  });

  it("T2 guest A's cookie can only ever query contributor A's receipt", async () => {
    const res = await receiptGet(new Request(
      `http://localhost:3001/api/ask/receipt?token=${ASK_TOKEN}&contributor_id=${CONTRIBUTOR_B}`,
      { headers: { cookie: `${GUEST_COOKIE_NAME}=${COOKIE}` } }
    ));
    expect(res.status).toBe(200);
    const call = mocks.rpc.mock.calls.find((c) => (c as unknown as [string])[0] === "guest_get_receipt") as unknown as [string, Record<string, unknown>];
    expect(call[1].p_contributor_id).toBe(CONTRIBUTOR_ID);
    expect(call[1].p_contributor_id).not.toBe(CONTRIBUTOR_B);
  });
});

// ---------- T3 cross-owner confusion ----------
describe("T3 cross-owner confusion", () => {
  it("T3 a foreign owner_id in the body is ignored; the ask token selects the owner", async () => {
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", {
      ...VALID_BATCH,
      owner_id: "999e4567-e89b-42d3-a456-426614174999",
    }));
    expect(res.status).toBe(200);
    const call = mocks.rpc.mock.calls.find((c) => (c as unknown as [string])[0] === "submit_recommendations") as unknown as [string, Record<string, unknown>];
    expect(call[1]).not.toHaveProperty("p_owner_id");
    expect(call[1].p_ask_token).toBe(ASK_TOKEN);
    expect(call[1].p_contributor_id).toBe(CONTRIBUTOR_ID);
  });
});

// ---------- T4 oversized / malformed ----------
describe("T4 oversized and malformed submissions", () => {
  it("T4 21 items -> 400 TOO_MANY_ITEMS before any submit RPC", async () => {
    const items = Array.from({ length: 21 }, () => ({ item_id: ITEM_ID, rating: null }));
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", { client_batch_id: BATCH_ID, items }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("TOO_MANY_ITEMS");
    expect(mocks.rpc.mock.calls.some((c) => (c as unknown as [string])[0] === "submit_recommendations")).toBe(false);
  });

  it("T4 rating 101 / -1 / 1.5 -> 400 INVALID_RATING (SQL-raised, route-mapped)", async () => {
    for (const rating of [101, -1, 1.5]) {
      mocks.rpc.mockImplementation(async (fn: string) => {
        if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
        if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
        if (fn === "rl_hit") return { data: true, error: null };
        if (fn === "submit_recommendations") return { data: null, error: { message: "INVALID_RATING" } };
        return { data: null, error: null };
      });
      const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", {
        client_batch_id: BATCH_ID,
        items: [{ item_id: ITEM_ID, rating }],
      }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("INVALID_RATING");
    }
  });

  it("T4 a 281-char comment -> 400 FIELD_TOO_LONG", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") return { data: null, error: { message: "FIELD_TOO_LONG" } };
      return { data: null, error: null };
    });
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", {
      client_batch_id: BATCH_ID,
      items: [{ item_id: ITEM_ID, rating: 50, comment: "x".repeat(281) }],
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("FIELD_TOO_LONG");
  });

  it("T4 a body over 64 KB -> 413 PAYLOAD_TOO_LARGE", async () => {
    const big = { client_batch_id: BATCH_ID, items: VALID_BATCH.items, pad: "x".repeat(70 * 1024) };
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", big));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("PAYLOAD_TOO_LARGE");
    expect(mocks.rpc.mock.calls.some((c) => (c as unknown as [string])[0] === "submit_recommendations")).toBe(false);
  });
});

// ---------- T5 daily flood / spam ----------
describe("T5 flood and spam", () => {
  it("T5 the 101st title -> 429 DAILY_CAP", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") return { data: null, error: { message: "DAILY_CAP" } };
      return { data: null, error: null };
    });
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe("DAILY_CAP");
  });

  it("T5 the 11th submit in the hour -> 429 ask_submit_c", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
      if (fn === "rl_hit" && params.p_bucket === "ask_submit_c") return { data: false, error: null };
      return { data: true, error: null };
    });
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });
});

// ---------- T6 cookie-mint flood / PoW ----------
describe("T6 cookie-mint flood", () => {
  const mintBody = { token: ASK_TOKEN, name: "Bo" };

  it("T6 a failed PoW/human check -> 403 CAPTCHA_FAILED before any guest RPC", async () => {
    const res = await sessionPost(jsonPost("http://localhost:3001/api/ask/session", { ...mintBody, captchaToken: "forged.token.value" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("CAPTCHA_FAILED");
    expect(mocks.rpc.mock.calls.some((c) => (c as unknown as [string])[0] === "guest_create_contributor")).toBe(false);
  });

  it("T6 a tripped honeypot -> 403 CAPTCHA_FAILED", async () => {
    const res = await sessionPost(jsonPost("http://localhost:3001/api/ask/session", { ...mintBody, captchaToken: "x", website: "https://spam.example" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("CAPTCHA_FAILED");
  });

  it("T6 the 11th mint in the hour/IP -> 429 ask_session_ip", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "rl_hit" && params.p_bucket === "ask_session_ip") return { data: false, error: null };
      return { data: true, error: null };
    });
    const res = await sessionPost(jsonPost("http://localhost:3001/api/ask/session", { ...mintBody, captchaToken: "x" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("T6 a PoW solution replays only once (ask_pow_replay bucket)", async () => {
    const challenge = powHumanCheck.issue!({ secret: COOKIE_SECRET, difficultyBits: 4 });
    const solution = solvePowChallenge(challenge, 4);
    expect(solution).toBeTruthy();
    let replayHits = 0;
    const rl = vi.fn(async () => { replayHits += 1; return replayHits === 1; });
    const ctx = { rlHit: rl as never, pepper: PEPPER };
    expect(await powHumanCheck.verify(solution!, ctx)).toBe(true);
    expect(await powHumanCheck.verify(solution!, ctx)).toBe(false);
  });
});

// ---------- T7 submission replay ----------
describe("T7 submission replay", () => {
  it("T7 the same client_batch_id replays: one RPC shape, replayed:true, no second write path", async () => {
    let calls = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") {
        calls += 1;
        return { data: { submission_id: "523e4567-e89b-42d3-a456-426614174000", accepted: 1, replayed: calls > 1, owner_display_name: "Owner" }, error: null };
      }
      return { data: null, error: null };
    });
    const r1 = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH));
    const r2 = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { replayed: boolean }).replayed).toBe(true);
    const submits = mocks.rpc.mock.calls.filter((c) => (c as unknown as [string])[0] === "submit_recommendations");
    expect(submits).toHaveLength(2);
    for (const c of submits) {
      expect((c as unknown as [string, Record<string, unknown>])[1].p_client_batch_id).toBe(BATCH_ID);
    }
  });
});

// ---------- T8 catalog poisoning ----------
describe("T8 catalog poisoning", () => {
  it("T8 a fabricated item_id is rejected by the RPC -> 400 INVALID_ITEM; route never mints ids", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") return { data: null, error: { message: "INVALID_ITEM" } };
      return { data: null, error: null };
    });
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", {
      client_batch_id: BATCH_ID,
      items: [{ item_id: "00000000-0000-0000-0000-000000000000", rating: 90, title: "Fake Movie" }],
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("INVALID_ITEM");
    const call = mocks.rpc.mock.calls.find((c) => (c as unknown as [string])[0] === "submit_recommendations") as unknown as [string, Record<string, unknown>];
    expect(JSON.stringify(call[1].p_items)).toContain("00000000-0000-0000-0000-000000000000");
  });
});

// ---------- T10 CSRF ----------
describe("T10 CSRF", () => {
  it("T10 a cross-site Origin -> 403 with zero database calls", async () => {
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("T10 a missing Origin on a mutating route -> 403", async () => {
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH, { origin: "" }));
    expect(res.status).toBe(403);
  });

  it("T10 a non-JSON Content-Type -> 400 BAD_REQUEST", async () => {
    const res = await submitPost(new Request("http://localhost:3001/api/ask/submit", {
      method: "POST",
      headers: postHeaders({ "content-type": "text/plain" }),
      body: JSON.stringify(VALID_BATCH),
    }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("BAD_REQUEST");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

// ---------- T12 proxy secondary use ----------
describe("T12 proxy secondary use", () => {
  it("T12 search without a guest cookie -> 401, zero database calls", async () => {
    const res = await searchGet(new Request("http://localhost:3001/api/ask/search?q=matrix"));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

// ---------- T13 owner harassment ----------
describe("T13 owner harassment", () => {
  it("T13 a blocked contributor -> 403 CONTRIBUTOR_BLOCKED", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_verify") return { data: "\\x" + guestSecretHash(Buffer.alloc(32, 7).toString("base64url")).toString("hex"), error: null };
      if (fn === "guest_get_ask") return { data: ASK_ROW, error: null };
      if (fn === "rl_hit") return { data: true, error: null };
      if (fn === "submit_recommendations") return { data: null, error: { message: "CONTRIBUTOR_BLOCKED" } };
      return { data: null, error: null };
    });
    const res = await submitPost(jsonPost("http://localhost:3001/api/ask/submit", VALID_BATCH));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("CONTRIBUTOR_BLOCKED");
  });

  it("T13 a markup name is stored as an opaque string (React escapes at render)", async () => {
    const challenge = powHumanCheck.issue!({ secret: COOKIE_SECRET, difficultyBits: 4 });
    const solution = solvePowChallenge(challenge, 4);
    expect(solution).toBeTruthy();
    const res = await sessionPost(new Request("http://localhost:3001/api/ask/session", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: ASK_TOKEN,
        name: "<script>alert(1)</script>",
        captchaToken: solution,
      }),
    }));
    expect(res.status).toBe(200);
    const call = mocks.rpc.mock.calls.find((c) => (c as unknown as [string])[0] === "guest_create_contributor") as unknown as [string, Record<string, unknown>];
    expect(call[1].p_name).toBe("<script>alert(1)</script>");
  });
});

// ---------- T15 open redirect (unit-level, route not in /api/ask) ----------
describe("T15 open redirect", () => {
  it("T15 evil next values fall back to a local path", () => {
    for (const evil of ["@evil.example", "//evil.example", "https://evil.example", "/\\evil", "javascript:alert(1)"]) {
      expect(safeNext(evil)).toBe("/feed");
    }
    expect(safeNext("/inbox?x=1")).toBe("/inbox?x=1");
  });
});
