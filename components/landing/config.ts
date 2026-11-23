// Landing registry (LINKS-PAUSE switch, V2-LANDING-002-A).
//   "legacy" = the paused link-management pitch (LegacyLanding, verbatim)
//   "v2a"    = Recommendation Inbox landing (V2-LANDING-001-R2, LandingV2)
//   "v2b"    = pre-launch page (V2-LANDING-002-A, components/landing/v2b)
// Resolution for "/" lives in lib/landing/resolve.ts (query > cookie > env
// LANDING_VARIANT > DEFAULT_LANDING_VARIANT). Merging with no env var and no
// override keeps the default, so visitors see exactly what they saw before.
export const LANDING_VARIANTS = ["legacy", "v2a", "v2b"] as const;
export type LandingVariant = (typeof LANDING_VARIANTS)[number];
export const DEFAULT_LANDING_VARIANT: LandingVariant = "v2a";
/** Functional SESSION cookie, written only while an override is active. */
export const LANDING_COOKIE = "liked.landing";
/** Query parameter that applies / stores / clears an override. */
export const LANDING_QUERY = "landing";
