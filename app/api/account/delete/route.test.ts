import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  runDeletionPipeline: vi.fn(),
  rlHit: vi.fn(),
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
    auth: { getUser: mocks.getUser, signOut: mocks.signOut },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({}),
}));

vi.mock("@/lib/account/deletionPipeline", () => ({
  runDeletionPipeline: mocks.runDeletionPipeline,
}));

vi.mock("@/lib/ask/rateLimit", () => ({
  rlHit: mocks.rlHit,
}));

import { POST } from "./route";
import { REAUTH_PROOF_COOKIE, createReauthProof } from "@/lib/account/reauth";

const APP_ORIGIN = "https://liked.test";

function req(origin: string | null = APP_ORIGIN) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return new Request(`${APP_ORIGIN}/api/account/delete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ confirmed: true }),
  });
}

function mockUser() {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "u1", email: "u@example.com" } },
    error: null,
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jar.clear();
    vi.stubEnv("ACCOUNT_REAUTH_SECRET", "test-reauth-secret-0123456789abcdef");
    vi.stubEnv("RATE_LIMIT_PEPPER", "test-rate-limit-pepper-0123456789");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_ORIGIN);
    mocks.rlHit.mockResolvedValue(true);
    mocks.runDeletionPipeline.mockResolvedValue({ ok: true, stage: "done" });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no session returns 401", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mocks.runDeletionPipeline).not.toHaveBeenCalled();
  });

  it("missing proof returns 401 REAUTH_REQUIRED", async () => {
    mockUser();
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "REAUTH_REQUIRED" });
    expect(mocks.runDeletionPipeline).not.toHaveBeenCalled();
  });

  it("foreign Origin returns 403 before the proof is burned", async () => {
    mockUser();
    const proof = createReauthProof("u1")!;
    mocks.jar.set(REAUTH_PROOF_COOKIE, proof);
    const res = await POST(req("https://evil.example.com"));
    expect(res.status).toBe(403);
    expect(mocks.jar.get(REAUTH_PROOF_COOKIE)).toBe(proof);
    expect(mocks.runDeletionPipeline).not.toHaveBeenCalled();
  });

  it("missing Origin returns 403 before the proof is burned", async () => {
    mockUser();
    const proof = createReauthProof("u1")!;
    mocks.jar.set(REAUTH_PROOF_COOKIE, proof);
    const res = await POST(req(null));
    expect(res.status).toBe(403);
    expect(mocks.jar.get(REAUTH_PROOF_COOKIE)).toBe(proof);
    expect(mocks.runDeletionPipeline).not.toHaveBeenCalled();
  });

  it("correct Origin passes the Origin gate", async () => {
    mockUser();
    mocks.jar.set(REAUTH_PROOF_COOKIE, createReauthProof("u1")!);
    const res = await POST(req(APP_ORIGIN));
    expect(res.status).toBe(303);
    expect(mocks.runDeletionPipeline).toHaveBeenCalledTimes(1);
  });

  it("success redirects to /account-deleted with status 303", async () => {
    mockUser();
    mocks.jar.set(REAUTH_PROOF_COOKIE, createReauthProof("u1")!);

    const res = await POST(req());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://liked.test/account-deleted");
    expect(mocks.runDeletionPipeline).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("pipeline failure returns non-2xx without signing out", async () => {
    mockUser();
    mocks.jar.set(REAUTH_PROOF_COOKIE, createReauthProof("u1")!);
    mocks.runDeletionPipeline.mockResolvedValue({ ok: false, stage: "auth" });

    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "DELETION_FAILED", stage: "auth" });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
