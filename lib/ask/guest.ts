// Guest identity resolution (PLAN-V2-002 §4.1 steps 1–4, PRD v2.6 §4/D24,
// task P0-08). Order matters: parse + HMAC signature are pure — a forged
// or garbage cookie is rejected with ZERO database calls; only a
// signature-valid cookie triggers guest_verify() to fetch secret_hash.
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  GUEST_COOKIE_NAME,
  guestCookieKeys,
  parseGuestCookieValue,
  secretHashEquals,
  verifyGuestCookieSignature,
} from "./cookie";
import type { AskSecrets } from "./env";
import { AskError } from "./errors";

export interface GuestIdentity {
  contributorId: string;
  /** The cookie secret — needed to re-sign/refresh the cookie. */
  secret: string;
}

/** Read one cookie value out of a raw Cookie header (Request.headers). */
export function readCookieHeader(headers: Headers, name: string): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** guest_verify(p_contributor_id) RETURNS bytea — PostgREST delivers
 *  bytea as a "\x<hex>" string; decode to Buffer for timingSafeEqual.
 *  CONTRIBUTOR_INVALID propagates as AskError (route → 401 + clear). */
export async function guestVerifySecretHash(
  contributorId: string,
  client: ReturnType<typeof getSupabaseServiceClient> = getSupabaseServiceClient()
): Promise<Buffer> {
  const { data, error } = await (client as unknown as {
    rpc: (
      fn: string,
      params: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  }).rpc("guest_verify", { p_contributor_id: contributorId });
  if (error) {
    if (error.message === "CONTRIBUTOR_INVALID") throw new AskError("CONTRIBUTOR_INVALID");
    throw new AskError("ASK_UNAVAILABLE");
  }
  return decodeBytea(data);
}

function decodeBytea(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "string") {
    const hex = data.startsWith("\\x") ? data.slice(2) : data;
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, "hex");
    }
  }
  throw new AskError("ASK_UNAVAILABLE");
}

/** Full §4.1 verification for one request. Returns the guest identity
 *  or null (no valid cookie). Null covers: missing cookie, malformed
 *  value, bad signature, unknown contributor, wrong secret — the route
 *  treats all of them identically (CONTRIBUTOR_INVALID → 401 + clear).
 *  A DB error inside guest_verify propagates as AskError. */
export async function resolveGuestIdentity(
  request: Request,
  secrets: AskSecrets,
  client: ReturnType<typeof getSupabaseServiceClient> = getSupabaseServiceClient()
): Promise<GuestIdentity | null> {
  const raw = readCookieHeader(request.headers, GUEST_COOKIE_NAME);
  const parts = parseGuestCookieValue(raw);
  if (!parts) return null;
  const keys = guestCookieKeys(secrets.cookieSecret, secrets.cookieSecretPrev);
  if (!verifyGuestCookieSignature(parts, keys)) return null;
  const storedHash = await guestVerifySecretHash(parts.contributorId, client);
  if (!secretHashEquals(storedHash, parts.secret)) return null;
  return { contributorId: parts.contributorId, secret: parts.secret };
}
