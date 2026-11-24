import { describe, expect, it } from "vitest";
import { hashRlKey, rateLimitIpKey } from "./clientIp";

const PEPPER = "test-pepper-0123456789abcdef01234567";

describe("rateLimitIpKey (§4.3/T17 key normalization)", () => {
  it("IPv4 passes through unchanged", () => {
    expect(rateLimitIpKey("1.2.3.4")).toBe("1.2.3.4");
    expect(rateLimitIpKey("203.0.113.9")).toBe("203.0.113.9");
  });

  it("IPv4-mapped IPv6 collapses to the IPv4", () => {
    expect(rateLimitIpKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(rateLimitIpKey("::FFFF:1.2.3.4")).toBe("1.2.3.4");
  });

  it("same /64 -> same hashRlKey; different /64 -> different", () => {
    expect(rateLimitIpKey("2001:db8::1")).toBe(rateLimitIpKey("2001:db8::ffff"));
    expect(rateLimitIpKey("2001:db8:1::1")).not.toBe(rateLimitIpKey("2001:db8::1"));
    expect(hashRlKey("ip", rateLimitIpKey("2001:db8::1"), PEPPER)).toBe(
      hashRlKey("ip", rateLimitIpKey("2001:db8::2"), PEPPER)
    );
    expect(hashRlKey("ip", rateLimitIpKey("2001:db8::1"), PEPPER)).not.toBe(
      hashRlKey("ip", rateLimitIpKey("2001:db8:0:1::1"), PEPPER)
    );
  });

  it("compressed and expanded forms of the same address are equal", () => {
    expect(rateLimitIpKey("2001:db8::1")).toBe(
      rateLimitIpKey("2001:0db8:0000:0000:0000:0000:0000:0001")
    );
    expect(rateLimitIpKey("2001:DB8::1")).toBe(rateLimitIpKey("2001:db8::1"));
  });

  it("null / empty / garbage -> 'unknown'", () => {
    expect(rateLimitIpKey(null)).toBe("unknown");
    expect(rateLimitIpKey("")).toBe("unknown");
    expect(rateLimitIpKey("   ")).toBe("unknown");
    expect(rateLimitIpKey("not-an-ip")).toBe("unknown");
    expect(rateLimitIpKey("999.1.1.1")).toBe("unknown");
    expect(rateLimitIpKey("2001:::db8")).toBe("unknown");
  });

  it("zone ids are stripped before parsing", () => {
    expect(rateLimitIpKey("fe80::1%eth0")).toBe(rateLimitIpKey("fe80::1"));
    expect(rateLimitIpKey("fe80::1%25eth0")).toBe(rateLimitIpKey("fe80::1"));
  });
});
