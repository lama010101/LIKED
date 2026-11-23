// Pure landing-variant resolver (V2-LANDING-002-A). No I/O, no Next imports.
// First match wins:
//   1. ?landing=legacy|v2a|v2b  -> applies and is stored (cookie "set").
//      ?landing=default         -> clears the cookie and ignores it for this
//                                  response (falls through to env/default).
//   2. cookie "liked.landing"
//   3. server env LANDING_VARIANT
//   4. DEFAULT_LANDING_VARIANT
// Unknown values are ignored silently and never echoed anywhere.
import {
  DEFAULT_LANDING_VARIANT,
  LANDING_VARIANTS,
  type LandingVariant,
} from "@/components/landing/config";

export type LandingSource = "query" | "cookie" | "env" | "default";

export interface LandingResolution {
  variant: LandingVariant;
  source: LandingSource;
  /** True when served through an override (query or cookie). */
  override: boolean;
  /** What the client should do with the "liked.landing" cookie. */
  cookie: "set" | "clear" | "none";
}

export interface LandingInput {
  /** Raw `landing` query value (Next gives string | string[] | undefined). */
  query?: string | string[] | null;
  /** Raw "liked.landing" cookie value. */
  cookie?: string | null;
  /** Raw LANDING_VARIANT env value. */
  env?: string | null;
}

export function isLandingVariant(v: unknown): v is LandingVariant {
  return typeof v === "string" && (LANDING_VARIANTS as readonly string[]).includes(v);
}

export function resolveLandingVariant(input: LandingInput): LandingResolution {
  const q = Array.isArray(input.query) ? input.query[0] : input.query;

  if (isLandingVariant(q)) {
    return { variant: q, source: "query", override: true, cookie: "set" };
  }

  const clearing = q === "default";
  if (!clearing && isLandingVariant(input.cookie)) {
    return { variant: input.cookie, source: "cookie", override: true, cookie: "none" };
  }

  const cookie = clearing ? "clear" : "none";
  const env = typeof input.env === "string" ? input.env.trim() : input.env;
  if (isLandingVariant(env)) {
    return { variant: env, source: "env", override: false, cookie };
  }
  return { variant: DEFAULT_LANDING_VARIANT, source: "default", override: false, cookie };
}
