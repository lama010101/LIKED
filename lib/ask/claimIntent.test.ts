import { describe, expect, it } from "vitest";
import {
  CLAIM_INTENT_TTL_MS,
  claimReturnPathForToken,
  createClaimIntentCookieValue,
  isClaimReturnPath,
  verifyClaimIntentCookieValue,
} from "./claimIntent";

const KEY = "k".repeat(32);
const OTHER_KEY = "x".repeat(32);
const CONTRIBUTOR = "123e4567-e89b-42d3-a456-426614174000";
const TOKEN = "a".repeat(32);

describe("claim return path strict allowlist", () => {
  it("accepts exactly /r/<32-char base64url token>?claim=1", () => {
    expect(claimReturnPathForToken(TOKEN)).toBe(`/r/${TOKEN}?claim=1`);
    expect(isClaimReturnPath(`/r/${TOKEN}?claim=1`)).toBe(true);
  });

  it("rejects open-redirect and token-smuggling attempts", () => {
    for (const bad of [
      "",
      "@evil.example",
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "a".repeat(31),
      "a".repeat(33),
      "a".repeat(32) + "/x",
      "a".repeat(32) + "?next=https://evil.example",
      "a".repeat(32) + "\\@evil.example",
      "a".repeat(31) + "+",
      "a".repeat(31) + "=",
    ]) {
      expect(claimReturnPathForToken(bad)).toBeNull();
    }
    for (const badPath of [
      "//evil.example",
      "/r/" + TOKEN,
      "/r/" + TOKEN + "?claim=1&next=https%3A%2F%2Fevil.example",
      "/r/" + TOKEN + "@evil.example?claim=1",
      "https://evil.example/r/" + TOKEN + "?claim=1",
    ]) {
      expect(isClaimReturnPath(badPath)).toBe(false);
    }
  });
});

describe("claim intent cookie", () => {
  it("round-trips a contributor-bound signed intent", () => {
    const now = 1_764_000_000_000;
    const value = createClaimIntentCookieValue(CONTRIBUTOR, TOKEN, KEY, now);
    expect(value).toBeTruthy();
    const intent = verifyClaimIntentCookieValue(value, [KEY], now + 1_000);
    expect(intent).toEqual({ contributorId: CONTRIBUTOR, askToken: TOKEN, iat: now });
  });

  it("rejects a forged signature, expired intent, bad uuid and bad token without a database", () => {
    const now = 1_764_000_000_000;
    expect(verifyClaimIntentCookieValue(createClaimIntentCookieValue(CONTRIBUTOR, TOKEN, OTHER_KEY, now), [KEY], now)).toBeNull();
    expect(verifyClaimIntentCookieValue(createClaimIntentCookieValue(CONTRIBUTOR, TOKEN, KEY, now), [KEY], now + CLAIM_INTENT_TTL_MS + 1)).toBeNull();
    expect(createClaimIntentCookieValue("not-a-uuid", TOKEN, KEY, now)).toBeNull();
    expect(createClaimIntentCookieValue(CONTRIBUTOR, "https://evil.example", KEY, now)).toBeNull();
    expect(verifyClaimIntentCookieValue("v1.garbage.sig", [KEY], now)).toBeNull();
  });
});
