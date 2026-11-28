import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { GUEST_COOKIE_NAME, guestSecretHash, signGuestCookieValue } from "@/lib/ask/cookie";
import { powHumanCheck, solvePowChallenge } from "@/lib/ask/humanCheck";
import { GET, POST } from "./route";

const COOKIE_SECRET = "c".repeat(40);
const PEPPER = "p".repeat(40);
const CONTRIBUTOR_ID = "123e4567-e89b-42d3-a456-426614174000";
const ASK_ID = "223e4567-e89b-42d3-a456-426614174000";
const ASK_TOKEN = "ask-token-0123456789abcdefghijklmnop";
const SECRET = Buffer.alloc(32, 7).toString("base64url");
const COOKIE = signGuestCookieValue(CONTRIBUTOR_ID, SECRET, COOKIE_SECRET);

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.GUEST_COOKIE_SECRET = COOKIE_SECRET;
  process.env.RATE_LIMIT_PEPPER = PEPPER;
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "guest_verify") {
      return { data: "\\x" + guestSecretHash(SECRET).toString("hex"), error: null };
    }
    if (fn === "guest_get_ask") {
      return {
        data: [
          {
            ask_id: ASK_ID,
            owner_display_name: "Owner",
            owner_avatar_key: null,
            prompt: null,
            note: null,
            liked_genres: [],
            owner_has_visible_picks: false,
          },
        ],
        error: null,
      };
    }
    if (fn === "guest_create_contributor") return { data: CONTRIBUTOR_ID, error: null };
    if (fn === "rl_hit") return { data: true, error: null };
    return { data: null, error: null };
  });
});

afterAll(() => {
  process.env = savedEnv;
});

function challengeFor(): string {
  const issue = powHumanCheck.issue;
  if (!issue) throw new Error("pow provider has no issue()");
  return issue({ secret: COOKIE_SECRET, difficultyBits: 8 });
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3001/api/ask/session", {
    method: "POST",
    headers: {
      origin: "http://localhost:3001",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function solvedToken(): string {
  const challenge = challengeFor();
  const solution = solvePowChallenge(challenge, 8);
  if (!solution) throw new Error("solver failed");
  return solution;
}

describe("GET /api/ask/session (PoW issue)", () => {
  it("issues a solvable challenge and the server accepts the solution", async () => {
    const res = await GET(new Request("http://localhost:3001/api/ask/session"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; challenge: string; difficulty: number };
    expect(body.provider).toBe("pow");
    expect(body.difficulty).toBeGreaterThanOrEqual(1);
    const solution = solvePowChallenge(body.challenge, body.difficulty);
    expect(solution).not.toBeNull();
    await expect(powHumanCheck.verify(solution as string, { pepper: PEPPER })).resolves.toBe(true);
  });

  it("fails closed with 503 when the ask secrets are missing", async () => {
    delete process.env.GUEST_COOKIE_SECRET;
    const res = await GET(new Request("http://localhost:3001/api/ask/session"));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/ask/session (mint)", () => {
  it("mints a __Host- guest cookie for a new guest and sets no sb-* cookie", async () => {
    const res = await POST(post({ token: ASK_TOKEN, name: "zz-e2e Guest", captchaToken: solvedToken() }));
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(GUEST_COOKIE_NAME);
    expect(cookie?.value.startsWith(`v1.${CONTRIBUTOR_ID}.`)).toBe(true);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Domain=");
    expect(res.cookies.getAll().every((c) => !c.name.startsWith("sb-"))).toBe(true);
    const create = mocks.rpc.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "guest_create_contributor"
    ) as unknown as [string, Record<string, unknown>];
    expect(create[1].p_name).toBe("zz-e2e Guest");
    expect(String(create[1].p_secret_hash).startsWith("\\x")).toBe(true);
  });

  it("renames an existing contributor instead of creating a second one", async () => {
    const res = await POST(
      post(
        { token: ASK_TOKEN, name: "zz-e2e Renamed", captchaToken: solvedToken() },
        { cookie: `${GUEST_COOKIE_NAME}=${COOKIE}` }
      )
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get(GUEST_COOKIE_NAME)?.value).toBe(COOKIE);
    const names = mocks.rpc.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(names).toContain("guest_rename");
    expect(names).toContain("guest_touch");
    expect(names).not.toContain("guest_create_contributor");
  });

  it("answers 429 on the 11th mint in the hour (ask_session_ip)", async () => {
    mocks.rpc.mockImplementation(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "rl_hit" && params.p_bucket === "ask_session_ip") return { data: false, error: null };
      return { data: true, error: null };
    });
    const res = await POST(post({ token: ASK_TOKEN, name: "zz-e2e Guest", captchaToken: solvedToken() }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(mocks.rpc.mock.calls.every((c) => (c as unknown as [string])[0] === "rl_hit")).toBe(true);
  });

  it("rejects a missing or forged PoW with 403 CAPTCHA_FAILED", async () => {
    const missing = await POST(post({ token: ASK_TOKEN, name: "zz-e2e Guest" }));
    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({ error: "CAPTCHA_FAILED" });
    const forged = await POST(post({ token: ASK_TOKEN, name: "zz-e2e Guest", captchaToken: "p1.a.b.c.d.0" }));
    expect(forged.status).toBe(403);
  });

  it("rejects a filled honeypot with 403", async () => {
    const res = await POST(
      post({ token: ASK_TOKEN, name: "zz-e2e Guest", captchaToken: solvedToken(), website: "http://spam" })
    );
    expect(res.status).toBe(403);
  });

  it("rejects a name outside 2-50 characters with 400", async () => {
    const res = await POST(post({ token: ASK_TOKEN, name: "a", captchaToken: solvedToken() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "FIELD_TOO_LONG" });
  });

  it("answers the identical 404 for a dead token and counts the miss", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "guest_get_ask") return { data: null, error: { message: "ASK_NOT_ACTIVE" } };
      return { data: true, error: null };
    });
    const res = await POST(post({ token: "dead-token", name: "zz-e2e Guest", captchaToken: solvedToken() }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "ASK_NOT_ACTIVE" });
    const buckets = mocks.rpc.mock.calls
      .filter((c) => (c as unknown as [string])[0] === "rl_hit")
      .map((c) => (c as unknown as [string, { p_bucket: string }])[1].p_bucket);
    expect(buckets).toContain("ask_token_miss");
    expect(res.cookies.getAll().length).toBe(0);
  });

  it("rejects a cross-site Origin with 403 and no DB call", async () => {
    const res = await POST(
      post({ token: ASK_TOKEN, name: "zz-e2e Guest", captchaToken: solvedToken() }, { origin: "https://evil.example" })
    );
    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
