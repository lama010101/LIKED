import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("masks a ?key= query value inside a URL", () => {
    const msg =
      "network: fetch failed for https://www.googleapis.com/youtube/v3/videos?part=snippet&id=abc&key=AIzaSyD-SECRET-1234567890";
    const out = redactSecrets(msg, ["AIzaSyD-SECRET-1234567890"]);
    expect(out).not.toContain("AIzaSyD-SECRET-1234567890");
    expect(out).toContain("key=<redacted>");
    expect(out).toContain("id=abc");
  });

  it("masks Bearer tokens", () => {
    const out = redactSecrets("401 for Bearer abc.def.ghi token rejected", [
      "abc.def.ghi",
    ]);
    expect(out).toBe("401 for Bearer <redacted> token rejected");
  });

  it("masks literal env values wherever they appear", () => {
    const secret = "tmdb-read-access-token-0123456789";
    const out = redactSecrets(`upstream said: ${secret} is invalid`, [secret]);
    expect(out).not.toContain(secret);
    expect(out).toContain("<redacted>");
  });

  it("does not mask short literal values (over-redaction guard)", () => {
    const out = redactSecrets("error en US region", ["en", "US"]);
    expect(out).toBe("error en US region");
  });

  it("ignores null/undefined/empty secrets", () => {
    const out = redactSecrets("plain failure", [null, undefined, ""]);
    expect(out).toBe("plain failure");
  });

  it("returns empty input unchanged", () => {
    expect(redactSecrets("", ["secret-value-1"])).toBe("");
  });
});
