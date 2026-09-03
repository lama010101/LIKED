import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { Database } from "@/lib/types/database";

/**
 * Bearer-token Supabase client for extension API routes.
 *
 * The Chrome extension holds the user's `access_token` in
 * `chrome.storage.local` (relayed from the LIKED web app via
 * `externally_connectable`) and sends it as
 * `Authorization: Bearer <access_token>` on every request.
 *
 * This helper builds a server client that uses that token to identify the
 * caller via `auth.getUser()`. It does NOT use cookies — extension requests
 * have no cookie jar. Returns `null` when the token is missing or invalid.
 */
export async function getSupabaseClientFromBearer(req: NextRequest): Promise<{
  client: ReturnType<typeof createServerClient<Database>>;
  user: { id: string };
  accessToken: string;
} | null> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const accessToken = match[1];

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No-op: extension routes never set cookies.
        },
      },
    }
  );

  // Pass the token explicitly to auth.getUser() — relying on global.headers
  // alone is unreliable because supabase-js auth calls may not merge them.
  const {
    data: { user },
  } = await client.auth.getUser(accessToken);
  if (!user) return null;
  return { client, user: { id: user.id }, accessToken };
}

/**
 * CORS headers for extension API routes. Reflects the request Origin when it
 * is a `chrome-extension://` origin (the ID varies between dev/profiles, so
 * we pattern-match rather than whitelist a single ID).
 */
export function extensionCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = origin.startsWith("chrome-extension://") ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "false",
    Vary: "Origin",
  };
}

/** Standard 401 response for unauthenticated extension calls. */
export function unauthenticatedResponse(req: NextRequest) {
  return new Response(
    JSON.stringify({ success: false, code: "unauthenticated", message: "Please sign in to LIKED." }),
    {
      status: 401,
      headers: { "content-type": "application/json", ...extensionCorsHeaders(req) },
    }
  );
}

/** Standard OPTIONS preflight response. */
export function optionsResponse(req: NextRequest) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(req) });
}
