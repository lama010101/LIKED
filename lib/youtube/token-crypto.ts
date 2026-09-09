/**
 * AES-256-GCM token encryption helpers for YouTube OAuth token storage.
 *
 * Encrypted token format: `v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>`.
 * The key is read from YOUTUBE_TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes)
 * on every call; a missing or malformed key always throws — never degrades.
 * Never logs keys or plaintext tokens, including in error messages.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "YOUTUBE_TOKEN_ENCRYPTION_KEY is missing; expected a 64-character hex string (32 bytes)."
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      `YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters); got ${key.length} bytes.`
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const key = getEncryptionKey();

  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid token format: expected v1:<iv>:<authTag>:<ciphertext>.");
  }
  const [version, ivB64, authTagB64, ciphertextB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported token version "${version}"; expected "${VERSION}".`);
  }

  const iv = Buffer.from(ivB64, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid token: IV must be 12 bytes.");
  }
  const authTag = Buffer.from(authTagB64, "base64");
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid token: auth tag must be 16 bytes.");
  }
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("Token authentication failed: ciphertext or auth tag may be tampered.");
  }
}
