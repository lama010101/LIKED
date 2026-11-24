import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { guardAskRequest, ASK_MAX_BODY_BYTES, readAskJsonBody } from "./guard";
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

describe("readAskJsonBody — 64KB stream cap, Content-Length never trusted", () => {
  const streamOf = (text: string): ReadableStream<Uint8Array> => {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 8192, bytes.length);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
    });
  };
  const reqWithBody = (
    body: string | ReadableStream<Uint8Array> | null,
    headers: Record<string, string> = {}
  ) =>
    ({
      body: body === null ? null : typeof body === "string" ? streamOf(body) : body,
      headers: new Headers(headers),
    }) as unknown as Request;

  it("(a) stream >64KB with no content-length -> 413", async () => {
    const res = await readAskJsonBody(reqWithBody("x".repeat(ASK_MAX_BODY_BYTES + 1)));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(413);
      expect(await res.response.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
    }
  });

  it("(b) lying content-length (10) but >64KB stream -> 413", async () => {
    const res = await readAskJsonBody(
      reqWithBody("x".repeat(ASK_MAX_BODY_BYTES + 1), { "content-length": "10" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(413);
  });

  it("(c) exactly 64KB valid JSON -> ok", async () => {
    const pad = ASK_MAX_BODY_BYTES - '{"d":"'.length - '"}'.length;
    const text = `{"d":"${"x".repeat(pad)}"}`;
    expect(new TextEncoder().encode(text).byteLength).toBe(ASK_MAX_BODY_BYTES);
    const res = await readAskJsonBody(reqWithBody(text));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.body).toEqual({ d: "x".repeat(pad) });
  });

  it("(d) invalid JSON -> 400", async () => {
    const res = await readAskJsonBody(reqWithBody("{not json"));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(400);
      expect(await res.response.json()).toEqual({ error: "BAD_REQUEST" });
    }
  });

  it("(e) empty body -> 400", async () => {
    for (const res of [
      await readAskJsonBody(reqWithBody("")),
      await readAskJsonBody(reqWithBody(null)),
    ]) {
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.response.status).toBe(400);
    }
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
