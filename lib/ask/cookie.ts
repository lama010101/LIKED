// Guest cookie sign/verify (PLAN-V2-002 §4.1, PRD v2.6 §4/D24, task P0-08).
// Pure functions — no DB access here; the route resolves the stored
// secret_hash via guest_verify() (lib/ask/guest.ts) AFTER the signature
// check passes, so forged cookies cost zero database calls.
//
// Format: __Host-liked_guest = "v1.<contributor_id>.<secret>.<sig>"
//   secret = 32 random bytes, base64url (43 chars)
//   sig    = first 16 bytes of HMAC-SHA256(GUEST_COOKIE_SECRET,
//            "v1." + id + "." + secret), base64url (22 chars)
//   contributors.secret_hash = sha256(secret) — the secret itself is
//   never stored server-side.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_COOKIE_NAME = "__Host-liked_guest";
export const GUEST_COOKIE_MAX_AGE_SECONDS = 31_536_000; // 1 year (§4.1)
// Rolling re-issue: the route re-mints when last_seen_at is older (§4.1).
export const GUEST_COOKIE_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// __Host- prefix contract: Secure + Path=/ + no Domain (§4.1).
export const GUEST_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
} as const;

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VALUE_RE = /^v1\.([0-9a-fA-F-]{36})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{22})$/;

export interface GuestSecret {
  /** base64url secret placed in the cookie value. */
  secret: string;
  /** sha256(secret) — the only form stored in contributors.secret_hash. */
  secretHash: Buffer;
}

export interface ParsedGuestCookie {
  contributorId: string;
  secret: string;
  sig: Buffer;
}

/** Mint a fresh guest secret + its storage hash. The contributor id does
 *  not exist yet at this point (guest_create_contributor needs the hash
 *  first), so signing happens separately in signGuestCookieValue. */
export function newGuestSecret(): GuestSecret {
  const secret = randomBytes(32).toString("base64url");
  return { secret, secretHash: guestSecretHash(secret) };
}

export function guestSecretHash(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function cookieSig(contributorId: string, secret: string, key: string): Buffer {
  return createHmac("sha256", key)
    .update(`v1.${contributorId}.${secret}`, "utf8")
    .digest()
    .subarray(0, 16);
}

/** Full cookie value for an existing contributor id. */
export function signGuestCookieValue(
  contributorId: string,
  secret: string,
  key: string
): string {
  const sig = cookieSig(contributorId, secret, key).toString("base64url");
  return `v1.${contributorId}.${secret}.${sig}`;
}

/** Strict parse: format + lengths only. Returns null on any garbage —
 *  callers must NOT touch the database for a null result. */
export function parseGuestCookieValue(
  raw: string | null | undefined
): ParsedGuestCookie | null {
  if (!raw) return null;
  const m = VALUE_RE.exec(raw);
  if (!m) return null;
  const [, contributorId, secret, sigB64] = m;
  if (!UUID_RE.test(contributorId)) return null;
  const sig = Buffer.from(sigB64, "base64url");
  if (sig.length !== 16) return null;
  return { contributorId, secret, sig };
}

/** HMAC check against the current key, then GUEST_COOKIE_SECRET_PREV
 *  (rotation does not log every guest out, §4.1). timingSafeEqual on
 *  equal-length buffers only. */
export function verifyGuestCookieSignature(
  parts: ParsedGuestCookie,
  keys: readonly string[]
): boolean {
  for (const key of keys) {
    const expected = cookieSig(parts.contributorId, parts.secret, key);
    if (expected.length === parts.sig.length && timingSafeEqual(expected, parts.sig)) {
      return true;
    }
  }
  return false;
}

/** Ordered verification keys: current secret first, prev second. */
export function guestCookieKeys(cookieSecret: string, prev?: string | null): string[] {
  return prev ? [cookieSecret, prev] : [cookieSecret];
}

/** Step 4 of §4.1 verification: constant-time compare of
 *  sha256(secret) against the contributors.secret_hash fetched by the
 *  route. Accepts Buffer/Uint8Array (tests) — the DB bytea decoder lives
 *  in lib/ask/guest.ts. */
export function secretHashEquals(
  stored: Buffer | Uint8Array | null | undefined,
  secret: string
): boolean {
  if (!stored) return false;
  const a = Buffer.isBuffer(stored) ? stored : Buffer.from(stored);
  const b = guestSecretHash(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rolling refresh (§4.1): true when last_seen_at is missing or older
 *  than 7 days — the route then re-issues the cookie. */
export function guestCookieNeedsRefresh(
  lastSeenAt: string | number | Date | null | undefined,
  now: number = Date.now()
): boolean {
  if (lastSeenAt == null) return true;
  const t = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > GUEST_COOKIE_REFRESH_AFTER_MS;
}
