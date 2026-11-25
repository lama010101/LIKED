// Enrichment kick (PLAN-V2-002 §6.6, task P0-14).
//
// After a successful submit the route asks the enrichment worker to run
// without blocking the response: inside after(), fire-and-forget
// GET /api/cron/enrich with "Authorization: Bearer ${CRON_SECRET}".
// The secret is referenced by NAME only. The cron route is owned by
// another task: a missing secret, a 404 or any network failure is logged
// and swallowed — a kick can never fail a submit.

import { after } from "next/server";

const KICK_TIMEOUT_MS = 5_000;

export function kickEnrichment(baseUrl?: string): void {
  const secret = process.env.CRON_SECRET;
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
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
