import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptToken, decryptToken } from "@/lib/youtube/token-crypto";

const VALID_KEY = "abcdef0123456789".repeat(4); // 64 hex chars -> 32 bytes
const ORIGINAL_KEY = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;

function flipFirstChar(s: string): string {
  return s[0] === "A" ? "B" + s.slice(1) : "A" + s.slice(1);
}

beforeEach(() => {
  process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = VALID_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe("encryptToken / decryptToken", () => {
  it("round-trips plaintext exactly", () => {
    const plaintext = "ya29.abc-123_secret-token! 日本語 🚀";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces the v1:<iv>:<authTag>:<ciphertext> format", () => {
    const encrypted = encryptToken("some-token");
    expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  });

  it("produces different ciphertext for the same plaintext (random IV per call)", () => {
    const a = encryptToken("same-plaintext");
    const b = encryptToken("same-plaintext");
    expect(a).not.toBe(b);
  });

  it("throws when the ciphertext portion is tampered with", () => {
    const encrypted = encryptToken("tamper-me");
    const parts = encrypted.split(":");
    parts[3] = flipFirstChar(parts[3]);
    expect(() => decryptToken(parts.join(":"))).toThrow(/tampered|authentication failed/i);
  });

  it("throws when the auth tag portion is tampered with", () => {
    const encrypted = encryptToken("tamper-me");
    const parts = encrypted.split(":");
    parts[2] = flipFirstChar(parts[2]);
    expect(() => decryptToken(parts.join(":"))).toThrow(/tampered|authentication failed/i);
  });

  it("throws on an unsupported version prefix", () => {
    const encrypted = encryptToken("version-test");
    expect(() => decryptToken(encrypted.replace(/^v1:/, "v2:"))).toThrow(/version/i);
  });

  it("throws on malformed input (wrong number of colon-delimited parts)", () => {
    expect(() => decryptToken("v1:abc")).toThrow(/format/i);
    expect(() => decryptToken("v1:a:b:c:d")).toThrow(/format/i);
    expect(() => decryptToken("")).toThrow(/format/i);
  });

  it("throws when YOUTUBE_TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow(/YOUTUBE_TOKEN_ENCRYPTION_KEY is missing/i);
    expect(() => decryptToken("v1:a:b:c")).toThrow(/YOUTUBE_TOKEN_ENCRYPTION_KEY is missing/i);
  });

  it("throws when YOUTUBE_TOKEN_ENCRYPTION_KEY is not 32 bytes after hex decoding", () => {
    process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = "a".repeat(32); // 16 bytes
    expect(() => encryptToken("x")).toThrow(/32 bytes/i);
    expect(() => decryptToken("v1:a:b:c")).toThrow(/32 bytes/i);
  });
});
