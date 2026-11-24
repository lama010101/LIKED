// Ask-route secrets (PLAN-V2-002 §4.1/§4.3/§10 L5, task P0-08).
// FAIL CLOSED (CTO decision): GUEST_COOKIE_SECRET and RATE_LIMIT_PEPPER
// are mandatory for every /api/ask/* route — when either is missing,
// getAskSecrets() returns null and the route guard answers 503.
// There is deliberately NO default/fallback secret. Tests inject
// test-only values via process.env; real secrets live only in Vercel env.

export interface AskSecrets {
  /** Current HMAC key for the guest cookie signature and PoW challenges. */
  cookieSecret: string;
  /** Previous key still accepted for cookie verification (rotation, §4.1). */
  cookieSecretPrev: string | null;
  /** Pepper for rate_limits.key_hash — raw IPs/contributor ids/tokens are never stored. */
  rateLimitPepper: string;
}

/** Minimum length for every ask-route secret (§4.1/§10 L5). Shorter
 *  values are treated as NOT SET — a weak key is worse than no key. */
const ASK_SECRET_MIN_LENGTH = 32;

function askEnvSecret(name: string): string | null {
  const v = process.env[name];
  return v && v.length >= ASK_SECRET_MIN_LENGTH ? v : null;
}

export function getAskSecrets(): AskSecrets | null {
  const cookieSecret = askEnvSecret("GUEST_COOKIE_SECRET");
  const rateLimitPepper = askEnvSecret("RATE_LIMIT_PEPPER");
  if (!cookieSecret || !rateLimitPepper) return null;
  return {
    cookieSecret,
    cookieSecretPrev: askEnvSecret("GUEST_COOKIE_SECRET_PREV"),
    rateLimitPepper,
  };
}

/** GUEST_COOKIE_SECRET under the same length rule — the single owner of
 *  the secret policy for PoW challenge signing (lib/ask/humanCheck.ts). */
export function getAskCookieSecret(): string | null {
  return askEnvSecret("GUEST_COOKIE_SECRET");
}
