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

async function getSessionRaw(): Promise<LikedSession | null> {
  const result = await chrome.storage.local.get(LIKED_SESSION_KEY);
  const session = result[LIKED_SESSION_KEY];
  if (!isLikedSession(session)) return null;
  return session;
}

async function setSession(session: LikedSession): Promise<void> {
  await chrome.storage.local.set({ [LIKED_SESSION_KEY]: session });
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
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    } | null;
    if (!data?.access_token) return null;

    const updated: LikedSession = {
      ...session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? session.refreshToken,
      expiresAt: data.expires_at ?? session.expiresAt,
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
