// Ask-route error codes → HTTP mapping (PLAN-V2-002 §2 error table,
// task P0-08). Routes translate codes; clients never see SQL text.
// ASK_NOT_ACTIVE must stay a single identical 404 body — no oracle
// for unknown / disabled / regenerated tokens (§4.2, threat T1).
import { NextResponse } from "next/server";

export const ASK_ERROR_STATUS = {
  // §2 table
  NOT_AUTHENTICATED: 401,
  FORBIDDEN: 403,
  ASK_NOT_ACTIVE: 404,
  CONTRIBUTOR_INVALID: 401,
  CONTRIBUTOR_BLOCKED: 403,
  SELF_RECOMMEND: 409,
  EMPTY_BATCH: 400,
  TOO_MANY_ITEMS: 400,
  DAILY_CAP: 429,
  INVALID_ITEM: 400,
  INVALID_RATING: 400,
  FIELD_TOO_LONG: 400,
  RATE_LIMITED: 429,
  CAPTCHA_FAILED: 403,
  NOT_FOUND: 404,
  UNSUPPORTED_KIND: 422,
  REAUTH_REQUIRED: 401,
  // route-level additions (not SQL codes)
  ASK_UNAVAILABLE: 503, // missing secrets / upstream failure — fail closed
  BAD_REQUEST: 400, // guard: non-JSON or malformed request
  PAYLOAD_TOO_LARGE: 413, // guard: body > 64 KB (§4.2/T4)
} as const;

export type AskErrorCode = keyof typeof ASK_ERROR_STATUS;

export class AskError extends Error {
  readonly code: AskErrorCode;
  readonly status: number;
  constructor(code: AskErrorCode) {
    super(code);
    this.name = "AskError";
    this.code = code;
    this.status = ASK_ERROR_STATUS[code];
  }
}

export function askErrorResponse(
  code: AskErrorCode | AskError,
  opts?: { retryAfterSeconds?: number }
): NextResponse {
  const c = typeof code === "string" ? code : code.code;
  // Own-property guard: an unknown code can never reach NextResponse.json
  // with an undefined status — fall back to ASK_UNAVAILABLE / 503.
  const safe = (
    Object.hasOwn(ASK_ERROR_STATUS, c) ? c : "ASK_UNAVAILABLE"
  ) as AskErrorCode;
  const headers: Record<string, string> = {};
  if (opts?.retryAfterSeconds != null) {
    headers["Retry-After"] = String(Math.max(0, Math.ceil(opts.retryAfterSeconds)));
  }
  return NextResponse.json({ error: safe }, { status: ASK_ERROR_STATUS[safe], headers });
}

/** Map a PostgREST/Supabase RPC error to the identical-body response.
 *  The class-S functions raise `RAISE EXCEPTION '<CODE>'` so the
 *  message IS the code; ERRCODE 42501 ('not allowed') maps to
 *  FORBIDDEN. Anything unrecognized is a generic 500 — SQL detail
 *  never reaches the client. */
export function mapAskRpcError(
  error: { message?: string; code?: string } | null | undefined
): NextResponse {
  const message = error?.message ?? "";
  if (message && Object.hasOwn(ASK_ERROR_STATUS, message)) {
    return askErrorResponse(message as AskErrorCode);
  }
  if (error?.code === "42501") return askErrorResponse("FORBIDDEN");
  return askErrorResponse("ASK_UNAVAILABLE");
}
