// LIKED Chrome extension — session helpers backed by chrome.storage.local.
//
// The session is written by the background service worker when the LIKED
// web app relays it via chrome.runtime.sendMessageExternal. These helpers
// read/clear it for use by the popup.
//
// Token refresh: Supabase access tokens expire (~1 hour). When the access
// token is expired but a refresh token is available, getAccessToken()
// automatically calls Supabase's token endpoint to refresh it and updates
// the stored session. This avoids forcing the user to re-authenticate
// every hour.

const LIKED_SESSION_KEY = "liked_session";

export interface LikedUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface LikedSession {
  accessToken: string;
  refreshToken: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  user: LikedUser;
  expiresAt: number | null;
  storedAt: number;
}

function isLikedSession(value: unknown): value is LikedSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<LikedSession>;
  return (
    typeof s.accessToken === "string" &&
    !!s.user &&
    typeof s.user === "object" &&
    typeof (s.user as Partial<LikedUser>).id === "string"
  );
}

// ── Encryption helpers (P2-19: encrypt tokens at rest; P2-1: hardened) ──
// The session is encrypted with AES-GCM. The key is a per-install random,
// NON-EXTRACTABLE CryptoKey persisted in IndexedDB:
//   - non-extractable → the raw key bytes can never be exported, even by
//     code running in this extension
//   - IndexedDB is per-extension-origin → other extensions cannot read it
// Pre-hardening installs used a key derived from a salt stored next to the
// ciphertext; that legacy path is kept ONLY to decrypt-and-migrate existing
// sessions, then the salt is removed.
const ENC_KEY_SALT_KEY = "liked_enc_salt"; // legacy (pre-hardening) salt
const ENC_KEY_ALG = "AES-GCM";
const ENC_KEY_LEN = 256;
const IDB_NAME = "liked-extension";
const IDB_STORE = "keys";
const IDB_KEY_ID = "session-key";

/** Normalize a stored value into a fresh ArrayBuffer-backed Uint8Array. */
function toArrayBufferU8(value: unknown): Uint8Array<ArrayBuffer> | null {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.slice()); // .slice() returns ArrayBuffer-backed
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView<ArrayBuffer>;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return null;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredKey(): Promise<CryptoKey | null> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY_ID);
    req.onsuccess = () => {
      const record = req.result;
      resolve(record && record.key instanceof CryptoKey ? record.key : null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function putStoredKey(key: CryptoKey): Promise<void> {
  const db = await openKeyDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ id: IDB_KEY_ID, key });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function createAndStoreKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(
    { name: ENC_KEY_ALG, length: ENC_KEY_LEN },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
  await putStoredKey(key);
  // Re-read so concurrent creators all converge on the canonical stored key.
  const stored = await getStoredKey();
  return stored ?? key;
}

/** Current encryption key (IndexedDB). Falls back to legacy on IDB failure. */
async function getEncKey(): Promise<CryptoKey> {
  try {
    const stored = await getStoredKey();
    if (stored) return stored;
    return await createAndStoreKey();
  } catch {
    return getLegacyKey();
  }
}

/** Legacy pre-hardening key: PBKDF2 derived from the stored salt. */
async function getLegacyKey(): Promise<CryptoKey> {
  const { [ENC_KEY_SALT_KEY]: saltValue } = await chrome.storage.local.get(ENC_KEY_SALT_KEY);
  let salt = toArrayBufferU8(saltValue);
  if (!salt) {
    salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
    await chrome.storage.local.set({ [ENC_KEY_SALT_KEY]: salt });
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    salt,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: ENC_KEY_ALG, length: ENC_KEY_LEN },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptWith(key: CryptoKey, session: LikedSession): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ENC_KEY_ALG, iv }, key, plaintext)
  );
  return { iv, ciphertext };
}

async function encryptSession(session: LikedSession): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  return encryptWith(await getEncKey(), session);
}

/** Try decrypting with a specific key; null on failure (wrong key / bad data). */
async function tryDecrypt(
  key: CryptoKey,
  ivBytes: Uint8Array<ArrayBuffer>,
  cipherBytes: Uint8Array<ArrayBuffer>
): Promise<LikedSession | null> {
  try {
    const plaintext = await crypto.subtle.decrypt({ name: ENC_KEY_ALG, iv: ivBytes }, key, cipherBytes);
    const session = JSON.parse(new TextDecoder().decode(plaintext));
    return isLikedSession(session) ? session : null;
  } catch {
    return null;
  }
}

async function decryptSession(iv: Uint8Array, ciphertext: Uint8Array): Promise<LikedSession | null> {
  const ivBytes = toArrayBufferU8(iv);
  const cipherBytes = toArrayBufferU8(ciphertext);
  if (!ivBytes || !cipherBytes) return null;

  // 1. Current key (IndexedDB).
  try {
    const current = await getStoredKey();
    if (current) {
      const session = await tryDecrypt(current, ivBytes, cipherBytes);
      if (session) return session;
    }
  } catch {
    // IndexedDB unavailable — fall through to legacy.
  }

  // 2. Legacy salt-derived key: decrypt, then migrate to the hardened key.
  try {
    const legacy = await getLegacyKey();
    const session = await tryDecrypt(legacy, ivBytes, cipherBytes);
    if (session) {
      const key = await getEncKey();
      await chrome.storage.local.set({ [LIKED_SESSION_KEY]: await encryptWith(key, session) });
      await chrome.storage.local.remove(ENC_KEY_SALT_KEY);
      return session;
    }
  } catch {
    // ignore
  }
  return null;
}

async function getSessionRaw(): Promise<LikedSession | null> {
  const result = await chrome.storage.local.get(LIKED_SESSION_KEY);
  const stored = result[LIKED_SESSION_KEY];
  if (!stored || typeof stored !== "object") return null;
  // Try encrypted format first
  if (stored.iv instanceof Uint8Array && stored.ciphertext instanceof Uint8Array) {
    return decryptSession(stored.iv, stored.ciphertext);
  }
  // Fallback: plaintext (for backward compat with existing stored sessions)
  if (isLikedSession(stored)) return stored;
  return null;
}

async function setSession(session: LikedSession): Promise<void> {
  const encrypted = await encryptSession(session);
  await chrome.storage.local.set({
    [LIKED_SESSION_KEY]: { iv: encrypted.iv, ciphertext: encrypted.ciphertext },
  });
  // Session is now stored under the hardened key — drop the legacy salt.
  await chrome.storage.local.remove(ENC_KEY_SALT_KEY);
}

function isExpired(session: LikedSession): boolean {
  // expiresAt is a Unix timestamp in seconds (Supabase JWT exp).
  // Refresh 60s before actual expiry to avoid edge-case failures.
  if (!session.expiresAt) return false;
  return session.expiresAt * 1000 - 60_000 < Date.now();
}

/**
 * Refresh the access token using the refresh token via Supabase's auth
 * endpoint. Returns the new access token or null if refresh failed.
 * Updates the stored session in-place.
 */
async function refreshAccessToken(session: LikedSession): Promise<string | null> {
  if (!session.refreshToken) return null;
  if (!session.supabaseUrl || !session.supabaseAnonKey) return null;

  try {
    const res = await fetch(
      `${session.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: session.supabaseAnonKey,
        },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      }
    );

    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_at?: unknown;
    } | null;
    // P2-20: runtime validation of refresh response fields
    if (
      !data ||
      typeof data.access_token !== "string" ||
      data.access_token.length === 0 ||
      (data.refresh_token !== undefined && typeof data.refresh_token !== "string") ||
      (data.expires_at !== undefined && typeof data.expires_at !== "number")
    ) {
      return null;
    }

    const updated: LikedSession = {
      ...session,
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? session.refreshToken,
      expiresAt: (data.expires_at as number) ?? session.expiresAt,
      storedAt: Date.now(),
    };
    await setSession(updated);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token, refreshing automatically if expired.
 * Returns null if no session exists or refresh failed.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSessionRaw();
  if (!session) return null;

  if (!isExpired(session)) return session.accessToken;

  // Try to refresh.
  const refreshed = await refreshAccessToken(session);
  return refreshed;
}

export async function getSession(): Promise<LikedSession | null> {
  const session = await getSessionRaw();
  if (!session) return null;
  if (!isExpired(session)) return session;

  // Try to refresh and return the updated session.
  const refreshed = await refreshAccessToken(session);
  if (refreshed) {
    return await getSessionRaw();
  }
  // Refresh failed — return the expired session so the caller can
  // decide what to do (the API will return 401).
  return session;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSessionRaw();
  if (!session) return false;
  if (!isExpired(session)) return true;
  // Try to refresh before declaring unauthenticated.
  const refreshed = await refreshAccessToken(session);
  return refreshed !== null;
}

export async function signOut(): Promise<void> {
  await chrome.storage.local.remove(LIKED_SESSION_KEY);
}
