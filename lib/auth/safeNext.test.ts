import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

// PLAN-V2-002 §5.4 table: only `/inbox?x=1` passes through.
describe("safeNext", () => {
  it.each([
    ["@evil.example", "/feed"],
    ["//evil.example", "/feed"],
    ["https://evil.example", "/feed"],
    ["/\\evil", "/feed"],
    ["/inbox?x=1", "/inbox?x=1"],
  ])("safeNext(%j) -> %j", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it("null/undefined/empty -> fallback", () => {
    expect(safeNext(null)).toBe("/feed");
    expect(safeNext(undefined)).toBe("/feed");
    expect(safeNext("")).toBe("/feed");
  });

  it("honours a custom fallback", () => {
    expect(safeNext("https://evil.example", "/inbox")).toBe("/inbox");
  });
});
