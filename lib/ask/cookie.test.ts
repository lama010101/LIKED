import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const guestVerifySpy = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseServiceClient: () => ({ rpc: guestVerifySpy }),
}));

import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_MAX_AGE_SECONDS,
  GUEST_COOKIE_OPTIONS,
  GUEST_COOKIE_REFRESH_AFTER_MS,
  guestCookieKeys,
  guestCookieNeedsRefresh,
  guestSecretHash,
  newGuestSecret,
  parseGuestCookieValue,
  secretHashEquals,
  signGuestCookieValue,
  verifyGuestCookieSignature,
} from "./cookie";
import { resolveGuestIdentity } from "./guest";
import type { AskSecrets } from "./env";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const KEY = "test-cookie-secret-AAAAAAAAAAAAAAAAAAAAAAAA";
const KEY_PREV = "test-cookie-secret-PREV-PREV-PREV-PREV-PREV";

const secrets = (prev: string | null = null): AskSecrets => ({
  cookieSecret: KEY,
  cookieSecretPrev: prev,
  rateLimitPepper: "test-pepper-0123456789abcdef01234567",
});

function reqWithCookie(value: string): Request {
  return new Request("http://localhost:3001/api/ask/receipt", {
    headers: { cookie: `${GUEST_COOKIE_NAME}=${value}` },
  });
}

describe("guest cookie sign/verify (§4.1)", () => {
  it("roundtrip: sign -> parse -> sig verify -> hash compare", () => {
    const { secret, secretHash } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY);
    const parts = parseGuestCookieValue(value);
    expect(parts).not.toBeNull();
    expect(parts!.contributorId).toBe(ID);
    expect(parts!.secret).toBe(secret);
    expect(verifyGuestCookieSignature(parts!, [KEY])).toBe(true);
    expect(secretHashEquals(secretHash, secret)).toBe(true);
  });

  it("cookie format is v1.<uuid>.<43-char secret>.<22-char sig>", () => {
    const { secret } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY);
    const [v, id, sec, sig] = value.split(".");
    expect(v).toBe("v1");
    expect(id).toBe(ID);
    expect(sec).toBe(secret);
    expect(secret).toHaveLength(43);
    expect(sig).toHaveLength(22);
  });

  it("rejects tampered id / secret / sig", () => {
    const { secret } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY);
    const parts = value.split(".");
    const otherId = "223e4567-e89b-42d3-a456-426614174000";
    const swapChar = (s: string, i: number) =>
      s.slice(0, i) + (s[i] === "A" ? "Q" : "A") + s.slice(i + 1);
    // Canonical base64url of 16 bytes ends in A/Q/g/w; picking a different
    // one keeps the encoding canonical but changes the decoded sig bytes.
    const sigLastAlt = ["Q", "g", "w", "A"].find((c) => c !== parts[3][21])!;
    const vectors: { bad: string; parses: boolean }[] = [
      { bad: `v1.${otherId}.${parts[2]}.${parts[3]}`, parses: true },
      { bad: `v1.${ID}.${swapChar(parts[2], 42)}.${parts[3]}`, parses: true },
      { bad: `v1.${ID}.${swapChar(parts[2], 21)}.${parts[3]}`, parses: true },
      { bad: `v1.${ID}.${parts[2]}.${parts[3].slice(0, -1)}${sigLastAlt}`, parses: true },
      { bad: `v1.${ID}.${parts[2]}.${swapChar(parts[3], 10)}`, parses: true },
      { bad: `v1.${ID}.${parts[2]}.AAAA`, parses: false },
    ];
    for (const { bad, parses } of vectors) {
      expect(bad).not.toBe(value);
      const p = parseGuestCookieValue(bad);
      if (parses) {
        expect(p).not.toBeNull();
        expect(verifyGuestCookieSignature(p!, [KEY])).toBe(false);
      } else {
        expect(p).toBeNull();
      }
    }
  });

  it("rejects non-canonical base64url sig (same bytes, different last char)", () => {
    const { secret } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY);
    const parts = value.split(".");
    const sigBytes = Buffer.from(parts[3], "base64url");
    expect(sigBytes).toHaveLength(16);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const alt = alphabet
      .split("")
      .find(
        (c) =>
          c !== parts[3][21] &&
          Buffer.from(parts[3].slice(0, -1) + c, "base64url").equals(sigBytes)
      );
    expect(alt).toBeDefined();
    const badSig = parts[3].slice(0, -1) + alt!;
    // Same decoded bytes, but not the canonical re-encoding.
    expect(Buffer.from(badSig, "base64url").toString("base64url")).not.toBe(badSig);
    expect(parseGuestCookieValue(`v1.${ID}.${parts[2]}.${badSig}`)).toBeNull();
  });

  it("rejects wrong key and accepts PREV key (rotation)", () => {
    const { secret } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY_PREV);
    const parts = parseGuestCookieValue(value)!;
    expect(verifyGuestCookieSignature(parts, [KEY])).toBe(false);
    expect(verifyGuestCookieSignature(parts, guestCookieKeys(KEY, KEY_PREV))).toBe(true);
  });

  it("parse rejects malformed values", () => {
    for (const bad of [
      null, undefined, "", "v1", "v2.x.y.z", "v1.not-a-uuid." + "a".repeat(43) + "." + "b".repeat(22),
      "v1." + ID + ".short.sig",
    ]) {
      expect(parseGuestCookieValue(bad)).toBeNull();
    }
  });

  it("cookie attributes satisfy the __Host- contract", () => {
    expect(GUEST_COOKIE_NAME).toBe("__Host-liked_guest");
    expect(GUEST_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(GUEST_COOKIE_OPTIONS.secure).toBe(true);
    expect(GUEST_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(GUEST_COOKIE_OPTIONS.path).toBe("/");
    expect(GUEST_COOKIE_OPTIONS.maxAge).toBe(GUEST_COOKIE_MAX_AGE_SECONDS);
  });

  it("refresh helper: >7d or missing -> refresh; recent -> keep", () => {
    const now = Date.now();
    expect(guestCookieNeedsRefresh(null, now)).toBe(true);
    expect(guestCookieNeedsRefresh(now - GUEST_COOKIE_REFRESH_AFTER_MS - 1, now)).toBe(true);
    expect(guestCookieNeedsRefresh(now - 86_400_000, now)).toBe(false);
    expect(guestCookieNeedsRefresh("not-a-date", now)).toBe(true);
  });
});

describe("resolveGuestIdentity — forged cookie = zero DB calls", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("garbage / tampered / wrong-key cookies never reach guest_verify", async () => {
    const { secret } = newGuestSecret();
    const good = signGuestCookieValue(ID, secret, KEY);
    const forged = [
      "v1." + ID + "." + "A".repeat(43) + "." + "B".repeat(22), // random sig
      good.slice(0, -2) + "AA", // truncated sig
      "not-a-cookie",
    ];
    for (const f of forged) {
      const res = await resolveGuestIdentity(reqWithCookie(f), secrets());
      expect(res).toBeNull();
    }
    // signature-valid shape but secret unknown to DB:
    guestVerifySpy.mockResolvedValue({ data: "\\x" + "00".repeat(32), error: null });
    const res = await resolveGuestIdentity(reqWithCookie(good), secrets());
    expect(res).toBeNull(); // hash mismatch
    expect(guestVerifySpy).toHaveBeenCalledTimes(1); // only the sig-valid one hit DB
  });

  it("valid cookie resolves contributor id", async () => {
    const { secret, secretHash } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY);
    const hex = "\\x" + Buffer.from(secretHash).toString("hex");
    guestVerifySpy.mockResolvedValue({ data: hex, error: null });
    const res = await resolveGuestIdentity(reqWithCookie(value), secrets());
    expect(res).toEqual({ contributorId: ID, secret });
    expect(guestVerifySpy).toHaveBeenCalledWith(
      "guest_verify",
      expect.objectContaining({ p_contributor_id: ID })
    );
  });

  it("CONTRIBUTOR_INVALID propagates as AskError 401", async () => {
    const { secret } = newGuestSecret();
    const value = signGuestCookieValue(ID, secret, KEY);
    guestVerifySpy.mockResolvedValue({ data: null, error: { message: "CONTRIBUTOR_INVALID" } });
    await expect(resolveGuestIdentity(reqWithCookie(value), secrets())).rejects.toMatchObject({
      code: "CONTRIBUTOR_INVALID",
      status: 401,
    });
  });

  it("guestSecretHash is sha256 of the secret string (32 bytes)", () => {
    const h = guestSecretHash("abc");
    expect(h).toHaveLength(32);
    expect(guestSecretHash("abc").equals(h)).toBe(true);
    expect(guestSecretHash("abd").equals(h)).toBe(false);
  });
});
