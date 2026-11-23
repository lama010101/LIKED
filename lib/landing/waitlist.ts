// Waitlist gating + validation helpers (V2-LANDING-002-A, UI only; the real
// storage route is a later task). Pure: callers pass the env in.

type Env = Record<string, string | undefined>;

/** A PRODUCTION deployment: Vercel production, or (off Vercel) NODE_ENV=production. */
export function isProductionDeployment(env: Env = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/** The email field renders everywhere except production without WAITLIST_ENABLED=1. */
export function isWaitlistFormEnabled(env: Env = process.env): boolean {
  return !isProductionDeployment(env) || env.WAITLIST_ENABLED === "1";
}

// Pragmatic shape check (not RFC 5322): one "@", no spaces, dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmailShape(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
}
