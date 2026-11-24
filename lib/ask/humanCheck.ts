// Human check — proof-of-work provider (PLAN-V2-002 §4.4 fallback,
// CTO decision V2-W3-P0-08: PoW behind a HumanCheck interface;
// Turnstile becomes a second provider later; provider chosen by env;
// NO Cloudflare dependency in this task).
//
// Interface: verify(token, ctx) -> boolean. issue() mints the
// server-signed challenge the client must solve (PoW only; Turnstile
// renders its own widget and has no issue step).
//
// PoW design (hashcash-style, §4.4 "~1 s on mobile"):
//   challenge = "p1.<id>.<exp>.<diff>.<sig>"
//     id    = 12 random bytes, base64url
//     exp   = unix seconds expiry (TTL 300 s)
//     diff  = required leading zero bits in sha256(challenge.nonce)
//     sig   = first 16 bytes of HMAC-SHA256(GUEST_COOKIE_SECRET, payload)
//   solution token = "<challenge>.<nonce>" (nonce = decimal counter)
//   verify order: parse -> HMAC sig (timingSafeEqual) -> expiry ->
//   leading-zero-bits -> replay guard. The replay guard reuses rl_hit
//   (bucket "ask_pow_replay", limit 1): one challenge id can produce at
//   most one accepted token, DB-backed so it survives serverless
//   instances. No new table (binding decision: migrations unchanged).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { rlHit } from "./rateLimit";
import { hashRlKey } from "./clientIp";

export interface HumanCheckContext {
  /** Injectable for tests; defaults to the real rlHit (service client). */
  rlHit?: typeof rlHit;
  /** Defaults to process.env.RATE_LIMIT_PEPPER. */
  pepper?: string | null;
  /** Injectable clock (ms) for expiry tests. */
  now?: () => number;
}

export interface HumanCheckIssueContext {
  /** HMAC key; defaults to GUEST_COOKIE_SECRET. */
  secret?: string;
  /** Leading-zero bits; defaults to POW_DIFFICULTY_BITS. */
  difficultyBits?: number;
  /** Challenge TTL seconds; defaults to POW_CHALLENGE_TTL_SECONDS. */
  ttlSeconds?: number;
  /** Injectable clock (ms). */
  now?: () => number;
}

export interface HumanCheck {
  issue?(ctx?: HumanCheckIssueContext): string;
  verify(token: string, ctx?: HumanCheckContext): Promise<boolean>;
}

export const POW_CHALLENGE_TTL_SECONDS = 300;
export const POW_DIFFICULTY_BITS = 20;
export const POW_MAX_DIFFICULTY_BITS = 30;
const POW_REPLAY_BUCKET = "ask_pow_replay";
// >> token TTL so a used challenge cannot be replayed in a later window.
const POW_REPLAY_WINDOW_SECONDS = 86_400;
const NONCE_RE = /^[0-9]{1,20}$/;
const CHALLENGE_ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

function powSig(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload, "utf8").digest().subarray(0, 16);
}

/** Count leading zero bits of a sha256 digest. */
function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export const powHumanCheck: HumanCheck = {
  issue(ctx?: HumanCheckIssueContext): string {
    const secret = ctx?.secret ?? process.env.GUEST_COOKIE_SECRET;
    if (!secret) throw new Error("GUEST_COOKIE_SECRET is not set");
    const nowSec = Math.floor((ctx?.now?.() ?? Date.now()) / 1000);
    const exp = nowSec + (ctx?.ttlSeconds ?? POW_CHALLENGE_TTL_SECONDS);
    const diff = Math.min(
      Math.max(1, Math.floor(ctx?.difficultyBits ?? POW_DIFFICULTY_BITS)),
      POW_MAX_DIFFICULTY_BITS
    );
    const id = randomBytes(12).toString("base64url");
    const payload = `p1.${id}.${exp}.${diff}`;
    const sig = powSig(payload, secret).toString("base64url");
    return `${payload}.${sig}`;
  },

  async verify(token: string, ctx?: HumanCheckContext): Promise<boolean> {
    if (typeof token !== "string" || token.length > 512) return false;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return false;
    const challenge = token.slice(0, dot);
    const nonce = token.slice(dot + 1);
    if (!NONCE_RE.test(nonce)) return false;

    const parts = challenge.split(".");
    if (parts.length !== 5 || parts[0] !== "p1") return false;
    const [, id, expS, diffS, sigS] = parts;
    if (!CHALLENGE_ID_RE.test(id) || sigS.length !== 22) return false;
    const exp = Number(expS);
    const diff = Number(diffS);
    if (!Number.isInteger(exp) || !Number.isInteger(diff)) return false;
    if (diff < 1 || diff > POW_MAX_DIFFICULTY_BITS) return false;
    const sig = Buffer.from(sigS, "base64url");
    if (sig.length !== 16) return false;

    // HMAC check first: forged challenges die here, before any work.
    const secret = process.env.GUEST_COOKIE_SECRET;
    if (!secret) return false;
    const payload = `p1.${id}.${exp}.${diff}`;
    const expected = powSig(payload, secret);
    if (!timingSafeEqual(expected, sig)) return false;

    const nowSec = Math.floor((ctx?.now?.() ?? Date.now()) / 1000);
    if (exp <= nowSec) return false;

    const digest = createHash("sha256").update(`${challenge}.${nonce}`, "utf8").digest();
    if (leadingZeroBits(digest) < diff) return false;

    // Replay guard: first valid use of a challenge id passes, every
    // later presentation of ANY solution to it is rejected (§4.4/T6).
    // An explicit ctx.pepper (incl. null) overrides the env — tests use
    // this to simulate a missing pepper without touching process.env.
    const pepper = ctx && "pepper" in ctx ? ctx.pepper : process.env.RATE_LIMIT_PEPPER;
    if (!pepper) return false;
    const rl = ctx?.rlHit ?? rlHit;
    const keyHash = hashRlKey("pow", id, pepper);
    return (await rl(POW_REPLAY_BUCKET, keyHash, POW_REPLAY_WINDOW_SECONDS, 1)) === true;
  },
};

/** Turnstile is a later task (plan §4.4). Selecting it now — or any
 *  unknown provider — fails CLOSED: verify always rejects. */
const denyAllHumanCheck: HumanCheck = {
  verify(): Promise<boolean> {
    return Promise.resolve(false);
  },
};

/** Provider chosen by CAPTCHA_PROVIDER env (plan §4.4); default "pow".
 *  Empty/unset -> pow; anything else -> deny-all (fail closed). */
export function getHumanCheckProvider(): HumanCheck {
  const name = (process.env.CAPTCHA_PROVIDER || "pow").trim().toLowerCase() || "pow";
  return name === "pow" ? powHumanCheck : denyAllHumanCheck;
}

/** §4.4 honeypot: bots fill the hidden field, humans never see it.
 *  A trip is a reject signal for the session route — cheap tripwire,
 *  the PoW remains the actual gate. */
export const HONEYPOT_FIELD = "website";
export function honeypotTripped(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/** Client-side solver (also used by tests): find nonce such that
 *  sha256("<challenge>.<nonce>") has `difficultyBits` leading zeros.
 *  Returns the full solution token, or null after maxIterations. */
export function solvePowChallenge(
  challenge: string,
  difficultyBits: number,
  maxIterations = 50_000_000
): string | null {
  for (let nonce = 0; nonce < maxIterations; nonce++) {
    const digest = createHash("sha256")
      .update(`${challenge}.${nonce}`, "utf8")
      .digest();
    if (leadingZeroBits(digest) >= difficultyBits) {
      return `${challenge}.${nonce}`;
    }
  }
  return null;
}
