import { NextResponse } from "next/server";
import { drainEmailOutbox } from "@/lib/email/drain";
import { authorizeCron } from "../_lib/cronAuth";

/**
 * GET /api/cron/email — drains email_outbox via the migration-147
 * class-S functions email_claim/email_finish (PLAN-V2-002 §2.11,
 * P0-18). Bearer CRON_SECRET via the shared fail-closed check: unset
 * secret -> 503, missing/wrong -> 401. When RESEND_API_KEY or
 * EMAIL_FROM is unset the drain claims nothing and answers
 * {sent:0, reason:'email_not_configured'}.
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
    const summary = await drainEmailOutbox();
    return NextResponse.json(summary);
  } catch (err) {
    console.error(
      "[cron/email] run failed:",
      err instanceof Error ? err.message : "unknown error"
    );
    return NextResponse.json({ ok: false, error: "email_failed" }, { status: 500 });
  }
}
