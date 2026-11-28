// Re-auth proof cookies for account deletion (PLAN-V2-002 §3.4, P0-20).
// Two signed httpOnly cookies, HMAC-SHA256 with ACCOUNT_REAUTH_SECRET:
//   liked_reauth_state  = v1.<b64 {uid,nonce,iat}>.<sig>  (10 min, start)
//   liked_reauth_proof  = v1.<b64 {uid,iat}>.<sig>        (5 min, single use)
// The state cookie binds the OAuth round trip to the uid that started it;
// the proof cookie is the fresh-sign-in evidence /api/account/delete
// requires. Wrong Google account -> uid mismatch -> nothing is deleted.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const REAUTH_STATE_COOKIE = "liked_reauth_state";
export const REAUTH_PROOF_COOKIE = "liked_reauth_proof";
export const REAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const REAUTH_PROOF_TTL_MS = 5 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;

export function getReauthSecret(): string | null {
  const v = process.env.ACCOUNT_REAUTH_SECRET;
  return v && v.length >= MIN_SECRET_LENGTH ? v : null;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64, "utf8").digest());
}

function mint(payload: Record<string, unknown>, secret: string): string {
  const p = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `v1.${p}.${sign(p, secret)}`;
}

function parse(
  token: string | undefined | null,
  secret: string
): Record<string, unknown> | null {
  if (!token || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, p, sig] = parts;
  const expected = Buffer.from(sign(p, secret), "utf8");
  const got = Buffer.from(sig, "utf8");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return null;
  }
  try {
    const json = Buffer.from(p, "base64url").toString("utf8");
    const obj = JSON.parse(json) as Record<string, unknown>;
    return typeof obj === "object" && obj !== null ? obj : null;
  } catch {
    return null;
  }
}

export interface ReauthState {
  uid: string;
  nonce: string;
  iat: number;
}

export function createReauthState(uid: string, now = Date.now()): string | null {
  const secret = getReauthSecret();
  if (!secret) return null;
  return mint(
    { uid, nonce: randomBytes(12).toString("base64url"), iat: now },
    secret
  );
}

export function verifyReauthState(
  token: string | undefined | null,
  now = Date.now()
): ReauthState | null {
  const secret = getReauthSecret();
  if (!secret) return null;
  const obj = parse(token, secret);
  if (!obj) return null;
  if (typeof obj.uid !== "string" || typeof obj.iat !== "number") return null;
  if (now - obj.iat > REAUTH_STATE_TTL_MS || obj.iat > now + 60_000) return null;
  return {
    uid: obj.uid,
    nonce: typeof obj.nonce === "string" ? obj.nonce : "",
    iat: obj.iat,
  };
}

export function createReauthProof(uid: string, now = Date.now()): string | null {
  const secret = getReauthSecret();
  if (!secret) return null;
  return mint({ uid, iat: now }, secret);
}

/** Valid only for the same uid and within the 5-minute window. */
export function verifyReauthProof(
  token: string | undefined | null,
  uid: string,
  now = Date.now()
): boolean {
  const secret = getReauthSecret();
  if (!secret) return false;
  const obj = parse(token, secret);
  if (!obj) return false;
  if (obj.uid !== uid || typeof obj.iat !== "number") return false;
  return now - obj.iat <= REAUTH_PROOF_TTL_MS && obj.iat <= now + 60_000;
}
