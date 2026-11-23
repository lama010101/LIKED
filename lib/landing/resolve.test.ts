import { describe, expect, it } from "vitest";
import { resolveLandingVariant } from "./resolve";

describe("resolveLandingVariant", () => {
  it("defaults to v2a with no input (merge changes nothing)", () => {
    expect(resolveLandingVariant({})).toEqual({
      variant: "v2a", source: "default", override: false, cookie: "none",
    });
  });

  it("query override wins and asks to store the cookie", () => {
    for (const v of ["legacy", "v2a", "v2b"] as const) {
      expect(resolveLandingVariant({ query: v, cookie: "legacy", env: "v2a" })).toEqual({
        variant: v, source: "query", override: true, cookie: "set",
      });
    }
  });

  it("uses the first value when the query repeats", () => {
    expect(resolveLandingVariant({ query: ["v2b", "legacy"] }).variant).toBe("v2b");
    expect(resolveLandingVariant({ query: ["nope", "v2b"] }).source).toBe("default");
  });

  it("cookie applies when there is no valid query", () => {
    expect(resolveLandingVariant({ cookie: "v2b", env: "legacy" })).toEqual({
      variant: "v2b", source: "cookie", override: true, cookie: "none",
    });
    expect(resolveLandingVariant({ query: "garbage", cookie: "legacy" }).variant).toBe("legacy");
  });

  it("env LANDING_VARIANT applies without an override", () => {
    expect(resolveLandingVariant({ env: "v2b" })).toEqual({
      variant: "v2b", source: "env", override: false, cookie: "none",
    });
    expect(resolveLandingVariant({ env: " legacy " }).variant).toBe("legacy");
  });

  it("invalid / unknown values are ignored silently", () => {
    for (const bad of ["", "V2B", "v3", "v2b ", "default2", "<script>", "__proto__"]) {
      // env is trimmed by design (ops-friendly), so check it separately below
      expect(resolveLandingVariant({ query: bad, cookie: bad })).toEqual({
        variant: "v2a", source: "default", override: false, cookie: "none",
      });
    }
    for (const bad of ["", "V2B", "v3", "default", "true"]) {
      expect(resolveLandingVariant({ env: bad }).source).toBe("default");
    }
    expect(resolveLandingVariant({ query: null, cookie: null, env: null }).variant).toBe("v2a");
  });

  it("?landing=default clears the cookie and ignores it for this response", () => {
    expect(resolveLandingVariant({ query: "default", cookie: "v2b" })).toEqual({
      variant: "v2a", source: "default", override: false, cookie: "clear",
    });
    // ...but env still applies underneath
    expect(resolveLandingVariant({ query: "default", cookie: "legacy", env: "v2b" })).toEqual({
      variant: "v2b", source: "env", override: false, cookie: "clear",
    });
  });

  it("an invalid cookie does not mask env", () => {
    expect(resolveLandingVariant({ cookie: "nope", env: "legacy" }).source).toBe("env");
  });
});
