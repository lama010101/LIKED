import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getAskCookieSecret, getAskSecrets } from "./env";

const S32 = "a".repeat(32);
const S31 = "a".repeat(31);
const S33 = "b".repeat(33);

function setValid() {
  vi.stubEnv("GUEST_COOKIE_SECRET", S32);
  vi.stubEnv("RATE_LIMIT_PEPPER", S32);
}

describe("getAskSecrets — 32-char minimum (fail closed)", () => {
  beforeEach(() => setValid());
  afterEach(() => vi.unstubAllEnvs());

  it("31-char GUEST_COOKIE_SECRET -> null", () => {
    vi.stubEnv("GUEST_COOKIE_SECRET", S31);
    expect(getAskSecrets()).toBeNull();
  });

  it("31-char RATE_LIMIT_PEPPER -> null", () => {
    vi.stubEnv("RATE_LIMIT_PEPPER", S31);
    expect(getAskSecrets()).toBeNull();
  });

  it("32-char secrets -> ok", () => {
    const s = getAskSecrets();
    expect(s).not.toBeNull();
    expect(s!.cookieSecret).toBe(S32);
    expect(s!.rateLimitPepper).toBe(S32);
    expect(s!.cookieSecretPrev).toBeNull();
  });

  it("weak GUEST_COOKIE_SECRET_PREV (<32) treated as not set", () => {
    vi.stubEnv("GUEST_COOKIE_SECRET_PREV", S31);
    const s = getAskSecrets();
    expect(s).not.toBeNull();
    expect(s!.cookieSecretPrev).toBeNull();
  });

  it(">=32-char PREV is accepted", () => {
    vi.stubEnv("GUEST_COOKIE_SECRET_PREV", S33);
    expect(getAskSecrets()!.cookieSecretPrev).toBe(S33);
  });

  it("missing either secret -> null", () => {
    vi.stubEnv("GUEST_COOKIE_SECRET", "");
    expect(getAskSecrets()).toBeNull();
    vi.stubEnv("GUEST_COOKIE_SECRET", S32);
    vi.stubEnv("RATE_LIMIT_PEPPER", "");
    expect(getAskSecrets()).toBeNull();
  });
});

describe("getAskCookieSecret — shared length rule for PoW signing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it(">=32 -> value; <32 or missing -> null", () => {
    vi.stubEnv("GUEST_COOKIE_SECRET", S31);
    expect(getAskCookieSecret()).toBeNull();
    vi.stubEnv("GUEST_COOKIE_SECRET", S32);
    expect(getAskCookieSecret()).toBe(S32);
    vi.stubEnv("GUEST_COOKIE_SECRET", "");
    expect(getAskCookieSecret()).toBeNull();
  });
});
