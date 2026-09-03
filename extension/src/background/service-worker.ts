// LIKED Chrome extension — background service worker.
//
// Responsibilities:
//   1. Receive LIKED_SESSION messages relayed from the LIKED web app's
//      /extension/auth page via chrome.runtime.onMessageExternal.
//   2. Store the session in chrome.storage.local under LIKED_SESSION_KEY.
//   3. No history monitoring, no feed polling, no background sync.
//
// Security: only accept messages from origins listed in
// manifest.json's externally_connectable.matches.

const LIKED_SESSION_KEY = "liked_session";
const ALLOWED_ORIGINS = [
  "https://liked.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

interface LikedSessionMessage {
  type: "LIKED_SESSION";
  accessToken: string;
  refreshToken: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  };
  expiresAt: number | null;
}

function isAllowedOrigin(origin: string): boolean {
  // Use URL-based comparison instead of startsWith (AUDIT-06 P3-12:
  // startsWith is vulnerable to origin prefix confusion).
  try {
    const parsed = new URL(origin);
    const normalized = `${parsed.protocol}//${parsed.host}`;
    return ALLOWED_ORIGINS.includes(normalized);
  } catch {
    return false;
  }
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender.origin ?? "";
  if (!isAllowedOrigin(origin)) {
    sendResponse({ ok: false, error: "disallowed_origin" });
    return false;
  }

  if (!message || typeof message !== "object" || message.type !== "LIKED_SESSION") {
    sendResponse({ ok: false, error: "invalid_message" });
    return false;
  }

  const msg = message as LikedSessionMessage;
  if (!msg.accessToken || !msg.user?.id) {
    sendResponse({ ok: false, error: "invalid_payload" });
    return false;
  }

  const session = {
    accessToken: msg.accessToken,
    refreshToken: msg.refreshToken ?? null,
    supabaseUrl: msg.supabaseUrl ?? null,
    supabaseAnonKey: msg.supabaseAnonKey ?? null,
    user: msg.user,
    expiresAt: msg.expiresAt,
    storedAt: Date.now(),
  };

  chrome.storage.local
    .set({ [LIKED_SESSION_KEY]: session })
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((err: unknown) => {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : "storage_failed" });
    });

  // Return true to keep sendResponse alive across the async storage call.
  return true;
});

// Optional: clear session on extension install/update if schema changes.
chrome.runtime.onInstalled.addListener(() => {
  // Intentionally no-op — preserve existing session across updates.
});
