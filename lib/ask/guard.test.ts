import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { guardAskRequest, ASK_MAX_BODY_BYTES } from "./guard";
import { askErrorResponse, mapAskRpcError, ASK_ERROR_STATUS } from "./errors";
import { hashRlKey } from "./clientIp";

const SECRET = "test-cookie-secret-AAAAAAAAAAAAAAAAAAAAAAAA";
const PEPPER = "test-pepper";

function setEnv() {
  vi.stubEnv("GUEST_COOKIE_SECRET", SECRET);
  vi.stubEnv("RATE_LIMIT_PEPPER", PEPPER);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://liked.example.com");
}

const getReq = (url = "https://liked.example.com/api/ask/receipt", h: Record<string, string> = {}) =>
  new Request(url, { method: "GET", headers: h });

const postReq = (h: Record<string, string> = {}) =>
  new Request("https://liked.example.com/api/ask/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://liked.example.com", ...h },
  });

describe("guardAskRequest — fail closed", () => {
  beforeEach(() => setEnv());
  afterEach(() => vi.unstubAllEnvs());

  it("missing GUEST_COOKIE_SECRET -> 503 ASK_UNAVAILABLE", async () => {
    vi.stubEnv("GUEST_COOKIE_SECRET", "");
    const r = guardAskRequest(getReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(503);
      expect(await r.response.json()).toEqual({ error: "ASK_UNAVAILABLE" });
    }
  });

  it("missing RATE_LIMIT_PEPPER -> 503", () => {
    vi.stubEnv("RATE_LIMIT_PEPPER", "");
    const r = guardAskRequest(getReq());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });
});

describe("guardAskRequest — transport rules (§4.2/T10)", () => {
  beforeEach(() => setEnv());
  afterEach(() => vi.unstubAllEnvs());

  it("GET passes with env present; ctx carries hashed ip only", () => {
    const r = guardAskRequest(getReq("https://liked.example.com/api/ask/x", {
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ctx.clientIp).toBe("1.2.3.4");
      expect(r.ctx.ipKeyHash).toBe(hashRlKey("ip", "1.2.3.4", PEPPER));
      expect(r.ctx.ipKeyHash).not.toContain("1.2.3.4");
      expect(r.ctx.secrets.cookieSecret).toBe(SECRET);
    }
  });

  it("missing client ip hashes the 'unknown' bucket", () => {
    const r = guardAskRequest(getReq());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ctx.ipKeyHash).toBe(hashRlKey("ip", "unknown", PEPPER));
  });

  it("POST without Origin -> 403", () => {
    const req = new Request("https://liked.example.com/api/ask/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const r = guardAskRequest(req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("POST with foreign Origin -> 403", () => {
    const r = guardAskRequest(postReq({ origin: "https://evil.example.com" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("POST with null / non-http Origin -> 403", () => {
    for (const o of ["null", "file://x", "javascript:alert(1)"]) {
      const r = guardAskRequest(postReq({ origin: o }));
      expect(r.ok).toBe(false);
    }
  });

  it("POST with matching Origin (env host or request host) passes", () => {
    expect(guardAskRequest(postReq()).ok).toBe(true);
    // preview deploy: request host differs from NEXT_PUBLIC_APP_URL
    const r = guardAskRequest(new Request("https://preview-123.vercel.app/api/ask/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://preview-123.vercel.app" },
    }));
    expect(r.ok).toBe(true);
  });

  it("POST non-JSON content-type -> 400", () => {
    const r = guardAskRequest(postReq({ "content-type": "text/plain" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("POST declared body > 64KB -> 413", () => {
    const r = guardAskRequest(postReq({ "content-length": String(ASK_MAX_BODY_BYTES + 1) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });
});

describe("error mapping (§2 table)", () => {
  it("every §2 code maps to its status", () => {
    expect(ASK_ERROR_STATUS.ASK_NOT_ACTIVE).toBe(404);
    expect(ASK_ERROR_STATUS.CONTRIBUTOR_INVALID).toBe(401);
    expect(ASK_ERROR_STATUS.CONTRIBUTOR_BLOCKED).toBe(403);
    expect(ASK_ERROR_STATUS.SELF_RECOMMEND).toBe(409);
    expect(ASK_ERROR_STATUS.DAILY_CAP).toBe(429);
    expect(ASK_ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(ASK_ERROR_STATUS.CAPTCHA_FAILED).toBe(403);
    expect(ASK_ERROR_STATUS.ASK_UNAVAILABLE).toBe(503);
  });

  it("askErrorResponse body is {error: code} + Retry-After when given", async () => {
    const res = askErrorResponse("RATE_LIMITED", { retryAfterSeconds: 60 });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
  });

  it("mapAskRpcError: raised code -> identical body; 42501 -> FORBIDDEN; unknown -> 503", async () => {
    const a = mapAskRpcError({ message: "ASK_NOT_ACTIVE", code: "P0001" });
    expect(a.status).toBe(404);
    expect(await a.json()).toEqual({ error: "ASK_NOT_ACTIVE" });
    const b = mapAskRpcError({ message: "not allowed", code: "42501" });
    expect(b.status).toBe(403);
    const c = mapAskRpcError({ message: "syntax error at or near", code: "42601" });
    expect(c.status).toBe(503);
    expect(await c.json()).toEqual({ error: "ASK_UNAVAILABLE" });
    expect(mapAskRpcError(null).status).toBe(503);
  });
});
