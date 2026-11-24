// Route guard for every /api/ask/* handler (PLAN-V2-002 §4.2/§4.3,
// task P0-08). Two layers:
//   1. FAIL CLOSED — missing GUEST_COOKIE_SECRET or RATE_LIMIT_PEPPER
//      => 503 ASK_UNAVAILABLE on every ask route. Never a default secret.
//   2. TRANSPORT — mutating methods (POST/PUT/PATCH/DELETE) require a
//      matching Origin, Content-Type: application/json and a declared
//      body <= 64 KB (§4.2/T4/T10: a cross-site form POST can produce
//      none of these; SameSite=Lax + no CORS do the rest).
import { NextResponse } from "next/server";
import { getAskSecrets, type AskSecrets } from "./env";
import { clientIpFromHeaders, hashRlKey } from "./clientIp";
import { askErrorResponse } from "./errors";

export const ASK_MAX_BODY_BYTES = 64 * 1024;

export interface AskGuardContext {
  secrets: AskSecrets;
  /** Raw client IP — in-memory only, never stored (§4.3/T17). */
  clientIp: string | null;
  /** sha256(pepper|ip|<ip|"unknown">) — safe to pass to rl_hit. */
  ipKeyHash: string;
}

export type AskGuardResult =
  | { ok: true; ctx: AskGuardContext }
  | { ok: false; response: NextResponse };

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isAllowedOrigin(origin: string, request: Request): boolean {
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (o.protocol !== "http:" && o.protocol !== "https:") return false;
  const allowed = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host);
    } catch {
      /* misconfigured env — request host still applies */
    }
  }
  try {
    allowed.add(new URL(request.url).host);
  } catch {
    /* request.url is always absolute in Next route handlers */
  }
  return allowed.has(o.host);
}

export function guardAskRequest(request: Request): AskGuardResult {
  const secrets = getAskSecrets();
  if (!secrets) {
    return { ok: false, response: askErrorResponse("ASK_UNAVAILABLE") };
  }

  if (MUTATING_METHODS.has(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    if (!origin || !isAllowedOrigin(origin, request)) {
      return { ok: false, response: askErrorResponse("FORBIDDEN") };
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return { ok: false, response: askErrorResponse("BAD_REQUEST") };
    }
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > ASK_MAX_BODY_BYTES) {
      return { ok: false, response: askErrorResponse("PAYLOAD_TOO_LARGE") };
    }
  }

  const clientIp = clientIpFromHeaders(request.headers);
  const ipKeyHash = hashRlKey("ip", clientIp ?? "unknown", secrets.rateLimitPepper);
  return { ok: true, ctx: { secrets, clientIp, ipKeyHash } };
}
