// Enrichment kick (PLAN-V2-002 §6.6, task P0-14).
//
// After a successful submit the route asks the enrichment worker to run
// without blocking the response: inside after(), fire-and-forget
// GET /api/cron/enrich with "Authorization: Bearer ${CRON_SECRET}".
// The secret is referenced by NAME only. The cron route is owned by
// another task: a missing secret, a 404 or any network failure is logged
// and swallowed — a kick can never fail a submit.
//
// The destination is NEVER derived from the request: a spoofed Host or
// x-forwarded-host header must not be able to point the bearer secret at
// an attacker origin (G1). The base URL comes only from
// NEXT_PUBLIC_APP_URL, else https://${VERCEL_URL}, else the kick is
// skipped with a log line.

import { after } from "next/server";

const KICK_TIMEOUT_MS = 5_000;

function enrichmentBaseUrl(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");
  return null;
}

export function kickEnrichment(): void {
  const secret = process.env.CRON_SECRET;
  const base = enrichmentBaseUrl();
  after(async () => {
    if (!secret) {
      console.warn("[enrich/kick] CRON_SECRET is not set — kick skipped");
      return;
    }
    if (!base) {
      console.warn("[enrich/kick] no app base URL — kick skipped");
      return;
    }
    try {
      const res = await fetch(`${base}/api/cron/enrich`, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
      });
      if (res.status === 404) {
        console.warn("[enrich/kick] /api/cron/enrich is not deployed — kick skipped");
      } else if (!res.ok) {
        console.warn(`[enrich/kick] worker answered ${res.status}`);
      }
    } catch (error) {
      console.warn(
        "[enrich/kick] kick failed:",
        error instanceof Error ? error.message : "unknown error"
      );
    }
  });
}
