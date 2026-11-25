import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  jar: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => Array.from(mocks.jar, ([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) mocks.jar.delete(name);
      else mocks.jar.set(name, value);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

import { GET as startGET } from "./start/route";
import { GET as doneGET } from "./done/route";
import {
  REAUTH_PROOF_COOKIE,
  REAUTH_STATE_COOKIE,
  REAUTH_STATE_TTL_MS,
  createReauthState,
} from "@/lib/account/reauth";

const SECRET = "test-reauth-secret-0123456789abcdef";

function req(path: string) {
  return new Request(`https://liked.test${path}`);
}

function mockUser(id: string, lastSignInAt: string | null) {
  mocks.getUser.mockResolvedValue({
    data: { user: { id, email: "u@example.com", last_sign_in_at: lastSignInAt } },
    error: null,
  });
}

function setCookieText(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("account reauth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jar.clear();
    vi.stubEnv("ACCOUNT_REAUTH_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
    vi.stubEnv("VERCEL_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("start uses NEXT_PUBLIC_APP_URL for redirectTo", async () => {
    mockUser("u1", new Date().toISOString());
    const res = await startGET(req("/api/account/reauth/start"));
    expect(res.status).toBe(200);
    const body = await res.json() as { authorizeUrl: string };
    const authorize = new URL(body.authorizeUrl);
    expect(authorize.searchParams.get("redirect_to")).toBe(
      `https://app.example/callback?next=${encodeURIComponent("/api/account/reauth/done")}`
    );
    expect(mocks.jar.has(REAUTH_STATE_COOKIE)).toBe(true);
  });

  it("start falls back to https://VERCEL_URL when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "preview-123.vercel.app");
    mockUser("u1", new Date().toISOString());
    const res = await startGET(req("/api/account/reauth/start"));
    const body = await res.json() as { authorizeUrl: string };
    const authorize = new URL(body.authorizeUrl);
    expect(authorize.searchParams.get("redirect_to")?.startsWith("https://preview-123.vercel.app/callback?next=")).toBe(true);
  });

  it("start -> done without a fresh sign-in mints no proof cookie", async () => {
    const beforeStart = Date.now();
    mockUser("u1", new Date(beforeStart - 60_000).toISOString());

    const startRes = await startGET(req("/api/account/reauth/start"));
    expect(startRes.status).toBe(200);
    expect(mocks.jar.has(REAUTH_STATE_COOKIE)).toBe(true);

    const doneRes = await doneGET(req("/api/account/reauth/done"));
    expect(doneRes.headers.get("location")).toBe("https://liked.test/settings/delete?reauth=failed");
    expect(setCookieText(doneRes)).toContain(`${REAUTH_STATE_COOKIE}=`);
    expect(setCookieText(doneRes)).not.toContain(`${REAUTH_PROOF_COOKIE}=v1.`);
  });

  it("sign-in newer than state mints a proof", async () => {
    const now = Date.now();
    mocks.jar.set(REAUTH_STATE_COOKIE, createReauthState("u1", now)!);
    mockUser("u1", new Date(now + 1_000).toISOString());

    const res = await doneGET(req("/api/account/reauth/done"));
    expect(res.headers.get("location")).toBe("https://liked.test/settings/delete");
    expect(setCookieText(res)).toContain(`${REAUTH_PROOF_COOKIE}=v1.`);
  });

  it("sign-in older than state mints no proof", async () => {
    const now = Date.now();
    mocks.jar.set(REAUTH_STATE_COOKIE, createReauthState("u1", now)!);
    mockUser("u1", new Date(now - 60_000).toISOString());

    const res = await doneGET(req("/api/account/reauth/done"));
    expect(res.headers.get("location")).toBe("https://liked.test/settings/delete?reauth=failed");
    expect(setCookieText(res)).not.toContain(`${REAUTH_PROOF_COOKIE}=v1.`);
  });

  it("wrong uid mints no proof", async () => {
    const now = Date.now();
    mocks.jar.set(REAUTH_STATE_COOKIE, createReauthState("u1", now)!);
    mockUser("u2", new Date(now + 1_000).toISOString());

    const res = await doneGET(req("/api/account/reauth/done"));
    expect(res.headers.get("location")).toBe("https://liked.test/settings/delete?reauth=failed");
    expect(setCookieText(res)).not.toContain(`${REAUTH_PROOF_COOKIE}=v1.`);
  });

  it("expired state mints no proof", async () => {
    const now = Date.now();
    mocks.jar.set(
      REAUTH_STATE_COOKIE,
      createReauthState("u1", now - REAUTH_STATE_TTL_MS - 1_000)!
    );
    mockUser("u1", new Date(now).toISOString());

    const res = await doneGET(req("/api/account/reauth/done"));
    expect(res.headers.get("location")).toBe("https://liked.test/settings/delete?reauth=failed");
    expect(setCookieText(res)).not.toContain(`${REAUTH_PROOF_COOKIE}=v1.`);
  });

  it("no session returns 401", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await doneGET(req("/api/account/reauth/done"));
    expect(res.status).toBe(401);
  });
});
