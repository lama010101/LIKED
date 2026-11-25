import { NextResponse } from "next/server";
import { processJobs } from "@/lib/enrich/processJobs";
import { authorizeCron } from "../_lib/cronAuth";

/**
 * GET /api/cron/enrich — enrichment worker tick (PLAN-V2-002 §6.6, P0-15).
 *
 * Requires `Authorization: Bearer ${CRON_SECRET}`; when the secret is
 * unset the route fails closed (503) and never runs. Provider calls happen
 * only here (or in the owner kick), never in a submit request path.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 503 ? "cron_unavailable" : "unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const summary = await processJobs();
    return NextResponse.json(summary);
  } catch (err) {
    console.error(
      "[cron/enrich] run failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "enrich_failed" }, { status: 500 });
  }
}
