import { config } from "dotenv";
import type { BrowserContext } from "@playwright/test";

config({ path: ".env.local" });

/**
 * Test credentials — configurable via env vars so tests can run against
 * any environment (local, Vercel preview, Vercel production) with any user.
 *
 * Usage:
 *   BASE_URL=https://liked-zeta.vercel.app \
 *   TEST_EMAIL=e2e-test@liked.app \
 *   TEST_PASSWORD=E2eTestPass123! \
 *   npx playwright test
 *
 * Or for local:
 *   npx playwright test  # defaults to localhost:3001
 */

export const TEST_EMAIL = process.env.TEST_EMAIL ?? "e2e-test@liked.app";
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "E2eTestPass123!";
export const STORAGE_STATE = "e2e/.auth/storageState.json";

/**
 * Known users in the DB (for reference — passwords are not stored here):
 *   e2e-test@liked.app     — E2E test user (password: E2eTestPass123!)
 *   test@liked.app         — test user
 *   deploy@liked.local     — deploy user
 *   laurent.martenot@gmail.com — Google OAuth user
 *   a@a.com                — test user
 *
 * To test with a different user, set TEST_EMAIL + TEST_PASSWORD env vars.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

/** @supabase/ssr session cookie name (chunked at 3180 chars). */
export const AUTH_COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;
const MAX_CHUNK = 3180;

export interface E2ESession {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  user: Record<string, unknown>;
}

/**
 * Obtain a real Supabase session programmatically.
 *
 * The app is Google-OAuth-only (PRD §41.2) — there is no login form to
 * drive in tests. e2e users exist server-side with email/password
 * credentials, so we authenticate via the Supabase token endpoint and
 * inject the resulting session into the browser as @supabase/ssr cookies.
 */
export async function getE2ESession(): Promise<E2ESession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`e2e auth token request failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const session = (await res.json()) as E2ESession;
  session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  return session;
}

/** Serialize a session to the @supabase/ssr cookie set (base64url, chunked). */
export function sessionCookies(
  session: E2ESession,
  url: string
): { name: string; value: string; url: string }[] {
  const value =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  if (value.length <= MAX_CHUNK) {
    return [{ name: AUTH_COOKIE_KEY, value, url }];
  }
  const cookies = [];
  for (let i = 0, idx = 0; i < value.length; i += MAX_CHUNK, idx++) {
    cookies.push({
      name: `${AUTH_COOKIE_KEY}.${idx}`,
      value: value.slice(i, i + MAX_CHUNK),
      url,
    });
  }
  return cookies;
}

/**
 * Inject an authenticated session into a browser context (replaces the
 * removed email/password login form in tests). Returns the session —
 * callers that need the access token can read session.access_token.
 */
export async function injectSession(
  context: BrowserContext,
  origin: string
): Promise<E2ESession> {
  const session = await getE2ESession();
  await context.addCookies(sessionCookies(session, origin));
  return session;
}
