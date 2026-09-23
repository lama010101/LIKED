/**
 * ONBOARD-001 — pure predicates for reduced-v1 onboarding (N3 ruling).
 * Kept free of server imports so they are unit-testable in vitest.
 */

export interface OnboardingFlags {
  imported: boolean;
  dismissed: boolean;
  youtubeConnected: boolean;
  importCount: number;
}

/**
 * The background liked-videos import runs iff the user has never been
 * onboarded (pre-migration users are backfilled, so NULL flags can only
 * mean "created after migration 107"), has not dismissed, and currently
 * holds an active YouTube connection.
 */
export function shouldRunOnboardingImport(s: OnboardingFlags): boolean {
  return !s.dismissed && !s.imported && s.youtubeConnected;
}

/**
 * The single-folder CTA shows iff the import completed, the user hasn't
 * dismissed it, and at least one liked video exists to file away.
 */
export function shouldShowOnboardingCta(
  s: Pick<OnboardingFlags, "imported" | "dismissed" | "importCount">
): boolean {
  return s.imported && !s.dismissed && s.importCount > 0;
}
