// Route guard for every /api/ask/* handler (PLAN-V2-002 §4.2/§4.3,
// task P0-08). Two layers:
//   1. FAIL CLOSED — missing GUEST_COOKIE_SECRET or RATE_LIMIT_PEPPER
//      => 503 ASK_UNAVAILABLE on every ask route. Never a default secret.
//   2. TRANSPORT — mutating methods (POST/PUT/PATCH/DELETE) require a
//      matching Origin, Content-Type: application/json and a declared
//      body <= 64 KB (§4.2/T4/T10: a cross-site form POST can produce
//      none of these; SameSite=Lax + no CORS do the rest).
// Every /api/ask/* handler MUST call guardAskRequest() and read JSON
// bodies ONLY through readAskJsonBody() below — never request.json(),
// req.json(), .formData() or .text() directly: those bypass the 64 KB
// stream cap (enforced repo-wide by REPO-20).
import { NextResponse } from "next/server";
import { getAskSecrets, type AskSecrets } from "./env";
import { clientIpFromHeaders, hashRlKey, rateLimitIpKey } from "./clientIp";
import { askErrorResponse } from "./errors";

export const ASK_MAX_BODY_BYTES = 64 * 1024;

export interface AskGuardContext {
  secrets: AskSecrets;
  /** Raw client IP — in-memory only, never stored (§4.3/T17). */
  clientIp: string | null;
  /** sha256(pepper|ip|rateLimitIpKey(clientIp)) — safe to pass to rl_hit. */
  ipKeyHash: string;
}

export type AskGuardResult =
  | { ok: true; ctx: AskGuardContext }
  | { ok: false; response: NextResponse };

export type AskJsonBodyResult =
  | { ok: true; body: unknown }
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
  const ipKeyHash = hashRlKey("ip", rateLimitIpKey(clientIp), secrets.rateLimitPepper);
  return { ok: true, ctx: { secrets, clientIp, ipKeyHash } };
}

/** Read + JSON-parse a request body under a hard ASK_MAX_BODY_BYTES cap.
 *  Bytes are counted on the raw stream as they arrive — Content-Length
 *  is never consulted (absent or lying headers cannot smuggle a large
 *  body). Exceeding the cap aborts the read immediately -> 413
 *  PAYLOAD_TOO_LARGE; a missing/empty body, an unreadable stream or
 *  invalid JSON -> 400 BAD_REQUEST. This is the ONLY sanctioned way for
 *  /api/ask/* handlers to obtain a JSON body. */
export async function readAskJsonBody(
  request: Request
): Promise<AskJsonBodyResult> {
  const stream = request.body;
  if (!stream) {
    return { ok: false, response: askErrorResponse("BAD_REQUEST") };
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > ASK_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: askErrorResponse("PAYLOAD_TOO_LARGE") };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, response: askErrorResponse("BAD_REQUEST") };
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (text.length === 0) {
    return { ok: false, response: askErrorResponse("BAD_REQUEST") };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: askErrorResponse("BAD_REQUEST") };
  }
}
