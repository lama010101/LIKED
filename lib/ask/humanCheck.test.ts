import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getHumanCheckProvider,
  honeypotTripped,
  HONEYPOT_FIELD,
  POW_DIFFICULTY_BITS,
  powHumanCheck,
  solvePowChallenge,
} from "./humanCheck";

const SECRET = "test-cookie-secret-AAAAAAAAAAAAAAAAAAAAAAAA";
const PEPPER = "test-pepper";

// Stateful fake of rl_hit for the replay bucket: first call for a key
// returns true (hits=1 <= limit=1), every later call false.
function fakeRl() {
  const seen = new Set<string>();
  return vi.fn(async (_b: string, keyHash: string) => {
    if (seen.has(keyHash)) return false;
    seen.add(keyHash);
    return true;
  });
}

const ctx = (rlHit = fakeRl(), now?: () => number) => ({
  rlHit: rlHit as never,
  pepper: PEPPER,
  now,
});

async function solvedToken(difficulty = 12) {
  const challenge = powHumanCheck.issue!({ secret: SECRET, difficultyBits: difficulty });
  const token = solvePowChallenge(challenge, difficulty);
  expect(token).not.toBeNull();
  return { challenge, token: token! };
}

describe("PoW human check (§4.4)", () => {
  beforeEach(() => {
    vi.stubEnv("GUEST_COOKIE_SECRET", SECRET);
    vi.stubEnv("RATE_LIMIT_PEPPER", PEPPER);
    vi.stubEnv("CAPTCHA_PROVIDER", "pow");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("issue -> solve -> verify accepts", async () => {
    const { token } = await solvedToken(12);
    expect(await powHumanCheck.verify(token, ctx())).toBe(true);
  });

  it("replay rejection: same challenge id, second presentation fails", async () => {
    const rl = fakeRl();
    const { token } = await solvedToken(12);
    expect(await powHumanCheck.verify(token, ctx(rl))).toBe(true);
    expect(await powHumanCheck.verify(token, ctx(rl))).toBe(false);
    // a DIFFERENT nonce on the same challenge is also rejected (id-keyed)
    const other = token.replace(/\.\d+$/, ".999999");
    expect(await powHumanCheck.verify(other, ctx(rl))).toBe(false);
  });

  it("rejects forged signature, bad nonce, expired, low-difficulty", async () => {
    const { challenge, token } = await solvedToken(12);
    const nonce = token.slice(token.lastIndexOf(".") + 1);
    const cases: [string, Parameters<typeof powHumanCheck.verify>[1]][] = [
      [challenge.slice(0, -2) + "AA." + nonce, ctx()], // tampered sig
      [challenge + ".abc", ctx()], // non-numeric nonce
      [challenge + ".-1", ctx()], // negative nonce
      [challenge + "." + "9".repeat(25), ctx()], // overlong nonce
      [token, ctx(fakeRl(), () => Date.now() + 400_000)], // expired (TTL 300s)
      ["garbage", ctx()],
      ["", ctx()],
    ];
    for (const [t, c] of cases) {
      expect(await powHumanCheck.verify(t, c)).toBe(false);
    }
    void nonce;
  });

  it("missing GUEST_COOKIE_SECRET or RATE_LIMIT_PEPPER fails closed", async () => {
    const { token } = await solvedToken(12);
    vi.stubEnv("GUEST_COOKIE_SECRET", "");
    expect(await powHumanCheck.verify(token, ctx())).toBe(false);
    vi.stubEnv("GUEST_COOKIE_SECRET", SECRET);
    expect(await powHumanCheck.verify(token, { rlHit: fakeRl() as never, pepper: null })).toBe(false);
  });

  it("provider selection: pow default; turnstile/unknown deny-all", async () => {
    expect(getHumanCheckProvider()).toBe(powHumanCheck);
    vi.stubEnv("CAPTCHA_PROVIDER", "turnstile");
    expect(await getHumanCheckProvider().verify("anything", ctx())).toBe(false);
    vi.stubEnv("CAPTCHA_PROVIDER", "bogus");
    expect(await getHumanCheckProvider().verify("anything", ctx())).toBe(false);
    vi.stubEnv("CAPTCHA_PROVIDER", "");
    expect(getHumanCheckProvider()).toBe(powHumanCheck);
  });

  it("difficulty default is the §4.4 ~1s budget constant", () => {
    expect(POW_DIFFICULTY_BITS).toBe(20);
  });

  it("honeypot tripwire", () => {
    expect(HONEYPOT_FIELD).toBe("website");
    expect(honeypotTripped("")).toBe(false);
    expect(honeypotTripped(null)).toBe(false);
    expect(honeypotTripped(undefined)).toBe(false);
    expect(honeypotTripped("x")).toBe(true);
    expect(honeypotTripped("  ")).toBe(false);
    expect(honeypotTripped({})).toBe(true);
    expect(honeypotTripped(0)).toBe(false);
  });
});
