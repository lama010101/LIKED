import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import {
  CLAIM_INTENT_COOKIE,
  CLAIM_INTENT_TTL_MS,
  createClaimIntentCookieValue,
} from "@/lib/ask/claimIntent";
import { POST as claimPost } from "./route";
import { POST as intentPost } from "./intent/route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const CONTRIBUTOR = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_CONTRIBUTOR = "923e4567-e89b-42d3-a456-426614174000";
const USER = "823e4567-e89b-42d3-a456-426614174000";
const OWNER = "723e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "a".repeat(32);
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const GUEST = signGuestCookieValue(CONTRIBUTOR, SECRET, COOKIE_SECRET);
const savedEnv = { ...process.env };

function intentFor(contributor = CONTRIBUTOR, now = Date.now()): string {
  return createClaimIntentCookieValue(contributor, ASK_TOKEN, COOKIE_SECRET, now)!;
}

function request(cookie: string, body: unknown = { token: ASK_TOKEN }): Request {
  return new Request("http://localhost:3001/api/ask/claim", {
    method: "POST",
    headers: {
      origin: "http://localhost:3001",
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}

function validCookie(withIntent = true): string {
  const parts = [`${GUEST_COOKIE_NAME}=${GUEST}`];
  if (withIntent) parts.push(`${CLAIM_INTENT_COOKIE}=${intentFor()}`);
  return parts.join("; ");
}

function mockValidBackend(ownerId = "523e4567-e89b-42d3-a456-426614174000") {
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "guest_verify") {
      return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
    }
    if (fn === "rl_hit") return { data: true, error: null };
    if (fn === "claim_guest") {
      return {
        data: { merged_into: CONTRIBUTOR, moved_recommendations: 0, merged_conflicts: 0, dropped_self: 0 },
        error: null,
      };
    }
    if (fn === "guest_get_ask") {
      return { data: [{ ask_id: "223e4567-e89b-42d3-a456-426614174000", owner_display_name: "Owner" }], error: null };
    }
    return { data: null, error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === "asks") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { owner_id: ownerId, is_active: true }, error: null }) }),
          }),
        }),
      };
    }
    if (table === "contributors") {
      return { update: () => ({ eq: async () => ({ error: null }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockValidBackend();
});

afterAll(() => {
  process.env = savedEnv;
});

describe("POST /api/ask/claim authentication factors", () => {
  it("missing intent cookie -> identical 401 and zero service DB calls", async () => {
    const res = await claimPost(request(`${GUEST_COOKIE_NAME}=${GUEST}`));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("NOT_AUTHENTICATED");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("intent bound to another contributor -> 401 and zero service DB calls", async () => {
    const cookie = `${GUEST_COOKIE_NAME}=${GUEST}; ${CLAIM_INTENT_COOKIE}=${intentFor(OTHER_CONTRIBUTOR)}`;
    const res = await claimPost(request(cookie));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("expired intent -> 401 and zero service DB calls", async () => {
    const expired = intentFor(CONTRIBUTOR, Date.now() - CLAIM_INTENT_TTL_MS - 1_000);
    const cookie = `${GUEST_COOKIE_NAME}=${GUEST}; ${CLAIM_INTENT_COOKIE}=${expired}`;
    const res = await claimPost(request(cookie));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("no Supabase session -> 401 and zero service DB calls", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await claimPost(request(validCookie()));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("forged guest cookie -> 401 and zero service DB calls", async () => {
    const forged = signGuestCookieValue(CONTRIBUTOR, SECRET, "wrong".repeat(10));
    const cookie = `${GUEST_COOKIE_NAME}=${forged}; ${CLAIM_INTENT_COOKIE}=${intentFor()}`;
    const res = await claimPost(request(cookie));
    expect(res.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("POST /api/ask/claim behavior", () => {
  it("owner claiming the owner Ask link -> own_link state and no claim RPC", async () => {
    mockValidBackend(OWNER);
    mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
    const res = await claimPost(request(validCookie()));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { state: string }).state).toBe("own_link");
    expect(mocks.rpc.mock.calls.some((c) => c[0] === "claim_guest")).toBe(false);
    expect(res.headers.get("set-cookie")).toContain(`${CLAIM_INTENT_COOKIE}=`);
  });

  it("successful claim calls claim_guest, rotates the guest cookie and clears intent", async () => {
    const res = await claimPost(request(validCookie()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string; merged_into: string };
    expect(body).toMatchObject({ state: "claimed", merged_into: CONTRIBUTOR });
    const rpcNames = mocks.rpc.mock.calls.map((c) => c[0]);
    expect(rpcNames).toContain("claim_guest");
    expect(rpcNames).toContain("guest_rotate_secret");
    expect(res.headers.get("set-cookie")).toContain(`${GUEST_COOKIE_NAME}=v1.${CONTRIBUTOR}.`);
    expect(res.headers.get("set-cookie")).toContain(`${CLAIM_INTENT_COOKIE}=`);
  });

  it("double claim remains a successful idempotent route outcome", async () => {
    const first = await claimPost(request(validCookie()));
    const second = await claimPost(request(validCookie()));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.rpc.mock.calls.filter((c) => c[0] === "claim_guest")).toHaveLength(2);
  });
});

describe("POST /api/ask/claim/intent", () => {
  it("mints a bound five-minute cookie and exact return path", async () => {
    const res = await intentPost(new Request("http://localhost:3001/api/ask/claim/intent", {
      method: "POST",
      headers: {
        origin: "http://localhost:3001",
        "content-type": "application/json",
        cookie: `${GUEST_COOKIE_NAME}=${GUEST}`,
      },
      body: JSON.stringify({ token: ASK_TOKEN }),
    }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { returnPath: string }).returnPath).toBe(`/r/${ASK_TOKEN}?claim=1`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(CLAIM_INTENT_COOKIE);
    expect(setCookie).toContain("Max-Age=300");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });
});
