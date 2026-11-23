import { describe, expect, it } from "vitest";
import { isProductionDeployment, isValidEmailShape, isWaitlistFormEnabled } from "./waitlist";

describe("waitlist gating", () => {
  it("is enabled in dev and Vercel preview", () => {
    expect(isWaitlistFormEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isWaitlistFormEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(true);
  });
  it("is disabled in production unless WAITLIST_ENABLED=1", () => {
    expect(isWaitlistFormEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false);
    expect(isWaitlistFormEnabled({ NODE_ENV: "production" })).toBe(false); // self-hosted: fail closed
    expect(isWaitlistFormEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", WAITLIST_ENABLED: "true" })).toBe(false);
    expect(isWaitlistFormEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", WAITLIST_ENABLED: "1" })).toBe(true);
  });
  it("VERCEL_ENV wins over NODE_ENV", () => {
    expect(isProductionDeployment({ NODE_ENV: "production", VERCEL_ENV: "development" })).toBe(false);
  });
});

describe("isValidEmailShape", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmailShape("you@example.com")).toBe(true);
    expect(isValidEmailShape("  a.b+c@sub.example.org ")).toBe(true);
  });
  it("rejects malformed input", () => {
    for (const bad of ["", "you", "you@", "@example.com", "you@example", "a b@example.com", "a@@b.com", null, 5, "x".repeat(250) + "@a.com"]) {
      expect(isValidEmailShape(bad)).toBe(false);
    }
  });
});
