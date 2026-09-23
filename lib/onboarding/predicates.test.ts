import { describe, it, expect } from "vitest";
import {
  shouldRunOnboardingImport,
  shouldShowOnboardingCta,
} from "@/lib/onboarding/predicates";

const base = { imported: false, dismissed: false, youtubeConnected: false, importCount: 0 };

describe("shouldRunOnboardingImport", () => {
  it("runs for a brand-new user with an active YouTube connection", () => {
    expect(shouldRunOnboardingImport({ ...base, youtubeConnected: true })).toBe(true);
  });
  it("skips when no YouTube connection (silent skip)", () => {
    expect(shouldRunOnboardingImport(base)).toBe(false);
  });
  it("skips once imported (backfilled legacy users never onboard)", () => {
    expect(shouldRunOnboardingImport({ ...base, imported: true, youtubeConnected: true })).toBe(false);
  });
  it("skips once dismissed", () => {
    expect(shouldRunOnboardingImport({ ...base, dismissed: true, youtubeConnected: true })).toBe(false);
  });
});

describe("shouldShowOnboardingCta", () => {
  it("shows after import with at least one liked video", () => {
    expect(shouldShowOnboardingCta({ imported: true, dismissed: false, importCount: 3 })).toBe(true);
  });
  it("hidden when nothing was imported", () => {
    expect(shouldShowOnboardingCta({ imported: true, dismissed: false, importCount: 0 })).toBe(false);
  });
  it("hidden after dismiss", () => {
    expect(shouldShowOnboardingCta({ imported: true, dismissed: true, importCount: 3 })).toBe(false);
  });
  it("hidden before import", () => {
    expect(shouldShowOnboardingCta({ imported: false, dismissed: false, importCount: 0 })).toBe(false);
  });
});
