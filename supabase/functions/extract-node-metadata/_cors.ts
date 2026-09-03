// @ts-nocheck — Deno Edge Function, not part of Node tsc project
// CORS + JSON response utilities — extracted from extract-node-metadata/index.ts

const ALLOWED_ORIGINS = [
  Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
].filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  // Only set Access-Control-Allow-Origin when there's a match (AUDIT-06 P2-16:
  // empty string is not a valid CORS value; omit header entirely for disallowed).
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  const cors = req ? corsHeaders(req) : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
