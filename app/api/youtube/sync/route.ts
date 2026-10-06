import { NextResponse } from "next/server";
import { syncAllConnectedUsers } from "@/lib/youtube/sync";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/youtube/sync — scheduled YouTube likes sync (YT-SYNC-CRON-001).
 *
 * Invoked by Vercel Cron twice daily (vercel.json: 06:00 + 18:00 UTC).
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` — the env var must be
 * set on the project, otherwise every request is rejected (and no sync runs).
 * For every user with an active youtube_connections row, imports their newly
 * liked videos through the same import_url RPC path as the manual sync.
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncAllConnectedUsers();
    if (summary.errors.length > 0) {
      logger.error("[youtube-sync] user errors:", JSON.stringify(summary.errors));
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    logger.error("[youtube-sync] run failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
