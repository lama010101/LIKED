import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createReauthProof,
  createReauthState,
  verifyReauthProof,
  verifyReauthState,
  REAUTH_PROOF_TTL_MS,
  REAUTH_STATE_TTL_MS,
} from "./reauth";

const OLD = process.env.ACCOUNT_REAUTH_SECRET;
beforeEach(() => {
  process.env.ACCOUNT_REAUTH_SECRET = "test-reauth-secret-0123456789abcdef";
});
afterEach(() => {
  if (OLD === undefined) delete process.env.ACCOUNT_REAUTH_SECRET;
  else process.env.ACCOUNT_REAUTH_SECRET = OLD;
});

describe("reauth cookies", () => {
  it("state round-trips and expires after 10 min", () => {
    const now = 1_000_000;
    const token = createReauthState("uid-1", now)!;
    expect(verifyReauthState(token, now)?.uid).toBe("uid-1");
    expect(verifyReauthState(token, now + REAUTH_STATE_TTL_MS + 1)).toBeNull();
    expect(verifyReauthState(token, now - 120_000)).toBeNull(); // future iat
  });

  it("rejects tampered state", () => {
    const token = createReauthState("uid-1")!;
    const [v, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "uid-2", iat: Date.now() })).toString("base64url");
    expect(verifyReauthState(`${v}.${forged}.${s}`)).toBeNull();
  });

  it("proof is single-uid and 5-minute bounded", () => {
    const now = 2_000_000;
    const proof = createReauthProof("uid-1", now)!;
    expect(verifyReauthProof(proof, "uid-1", now)).toBe(true);
    expect(verifyReauthProof(proof, "uid-2", now)).toBe(false);
    expect(verifyReauthProof(proof, "uid-1", now + REAUTH_PROOF_TTL_MS + 1)).toBe(false);
  });

  it("fails closed when the secret is missing or weak", () => {
    delete process.env.ACCOUNT_REAUTH_SECRET;
    expect(createReauthState("u")).toBeNull();
    expect(verifyReauthProof("x", "u")).toBe(false);
    process.env.ACCOUNT_REAUTH_SECRET = "short";
    expect(createReauthProof("u")).toBeNull();
  });
});
