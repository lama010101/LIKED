// Claim-intent cookie (PLAN-V2-002 §2.8/§4.5 T9, task V2-W9-CLAIM-1128-001).
// The cookie is the explicit "Continue with Google" click evidence: without it
// a signed-in person on a shared device must never absorb a guest's history.
// It is signed with the same rotating HMAC key policy as the guest cookie,
// bound to that guest cookie's contributor id AND the strict /r/<token> return
// path token, and valid for five minutes.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CLAIM_INTENT_COOKIE = "liked_claim_intent";
export const CLAIM_INTENT_TTL_MS = 5 * 60 * 1000;
export const CLAIM_INTENT_TTL_SECONDS = CLAIM_INTENT_TTL_MS / 1000;

export const CLAIM_INTENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: CLAIM_INTENT_TTL_SECONDS,
} as const;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ASK_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const FUTURE_SKEW_MS = 60_000;
const MAX_VALUE_LENGTH = 1024;

export interface ClaimIntent {
  contributorId: string;
  askToken: string;
  iat: number;
}

/** Strict post-sign-in return target (T15): same-origin /r/ plus exactly the
 *  32-character base64url Ask token charset. Anything else is rejected before
 *  it can become callback `next`. */
export function claimReturnPathForToken(token: string): string | null {
  if (!ASK_TOKEN_RE.test(token)) return null;
  return `/r/${token}?claim=1`;
}

export function isClaimReturnPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const match = /^\/r\/([A-Za-z0-9_-]{32})\?claim=1$/.exec(path);
  return match !== null;
}

function base64urlJson(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signPayload(payloadB64: string, key: string): Buffer {
  return createHmac("sha256", key).update(payloadB64, "utf8").digest();
}

export function createClaimIntentCookieValue(
  contributorId: string,
  askToken: string,
  key: string,
  now = Date.now()
): string | null {
  if (!UUID_RE.test(contributorId) || !ASK_TOKEN_RE.test(askToken)) return null;
  const payload = {
    contributor_id: contributorId,
    ask_token: askToken,
    iat: now,
    nonce: randomBytes(12).toString("base64url"),
  };
  const payloadB64 = base64urlJson(payload);
  return `v1.${payloadB64}.${signPayload(payloadB64, key).toString("base64url")}`;
}

function parseSignedValue(
  raw: string | null | undefined,
  keys: readonly string[]
): Record<string, unknown> | null {
  if (!raw || raw.length > MAX_VALUE_LENGTH) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payloadB64, sigB64] = parts;
  let sig: Buffer;
  try {
    sig = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  if (sig.length !== 32 || sig.toString("base64url") !== sigB64) return null;
  let signed = false;
  for (const key of keys) {
    const expected = signPayload(payloadB64, key);
    if (expected.length === sig.length && timingSafeEqual(expected, sig)) {
      signed = true;
      break;
    }
  }
  if (!signed) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Pure verification: malformed, forged, expired, future-dated, wrongly bound
 *  or malformed-token intents return null without any database access. */
export function verifyClaimIntentCookieValue(
  raw: string | null | undefined,
  keys: readonly string[],
  now = Date.now()
): ClaimIntent | null {
  const payload = parseSignedValue(raw, keys);
  if (!payload) return null;
  const contributorId = payload.contributor_id;
  const askToken = payload.ask_token;
  const iat = payload.iat;
  if (typeof contributorId !== "string" || !UUID_RE.test(contributorId)) return null;
  if (typeof askToken !== "string" || !ASK_TOKEN_RE.test(askToken)) return null;
  if (typeof iat !== "number" || !Number.isFinite(iat)) return null;
  if (iat > now + FUTURE_SKEW_MS) return null;
  if (now - iat > CLAIM_INTENT_TTL_MS) return null;
  return { contributorId, askToken, iat };
}
