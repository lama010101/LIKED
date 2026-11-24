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

export function getAskSecrets(): AskSecrets | null {
  const cookieSecret = process.env.GUEST_COOKIE_SECRET;
  const rateLimitPepper = process.env.RATE_LIMIT_PEPPER;
  if (!cookieSecret || !rateLimitPepper) return null;
  const prev = process.env.GUEST_COOKIE_SECRET_PREV;
  return {
    cookieSecret,
    cookieSecretPrev: prev ? prev : null,
    rateLimitPepper,
  };
}
