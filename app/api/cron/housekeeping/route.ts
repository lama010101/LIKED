import { NextResponse } from "next/server";
import { runDeletionPipeline, type DeletionStage, type PipelineDb } from "@/lib/account/deletionPipeline";
import { processJobs } from "@/lib/enrich/processJobs";
import { redactSecrets } from "@/lib/enrich/redact";
import { readProviderEnv, type EnrichDb } from "@/lib/enrich/types";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { authorizeCron } from "../_lib/cronAuth";

/**
 * GET /api/cron/housekeeping — daily global maintenance (PLAN-V2-002
 * §6.5, P0-22). Sequence is fixed: enqueue stale enrichment across all
 * owners (migration-149 draft RPC), drain the worker, purge unreferenced
 * items/cache rows, then resume stuck deletion jobs from their ledger
 * stage. Every v2 write is performed by a class-S RPC.
 */
export const maxDuration = 60;

type HousekeepingDb = EnrichDb & PipelineDb;

type StuckDeletionJob = {
  user_id: string;
  email: string | null;
  stage: DeletionStage;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStuckDeletionJobs(data: unknown): StuckDeletionJob[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is StuckDeletionJob =>
      isRecord(row) &&
      typeof row.user_id === "string" &&
      (typeof row.email === "string" || row.email === null) &&
      (row.stage === "storage" || row.stage === "auth" || row.stage === "email" || row.stage === "done")
  );
}

async function rpcRequired(
  client: HousekeepingDb,
  fn: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const res = await client.rpc(fn, params);
  if (res.error) throw new Error(`${fn}: ${res.error.message ?? "rpc failed"}`);
  return res.data;
}

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 503 ? "cron_unavailable" : "unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const client = getSupabaseServiceClient() as unknown as HousekeepingDb;
    const enqueued = await rpcRequired(client, "enrichment_enqueue_stale", {});
    const enrichment = await processJobs({ client });
    const itemsPurged = await rpcRequired(client, "items_purge_unreferenced", {});
    await rpcRequired(client, "housekeeping_purge", {});

    const stuckRows = asStuckDeletionJobs(
      await rpcRequired(client, "deletion_jobs_claim_stuck", { p_limit: 10 })
    );
    let deletionResumed = 0;
    let deletionFailed = 0;
    for (const row of stuckRows) {
      const result = await runDeletionPipeline({
        userId: row.user_id,
        email: row.email,
        fromStage: row.stage,
        client,
      });
      if (result.ok) deletionResumed += 1;
      else deletionFailed += 1;
    }

    return NextResponse.json({
      ok: true,
      enqueued: typeof enqueued === "number" ? enqueued : 0,
      enrichment,
      itemsPurged: typeof itemsPurged === "number" ? itemsPurged : 0,
      stuckDeletionJobs: stuckRows.length,
      deletionResumed,
      deletionFailed,
    });
  } catch (err) {
    const env = readProviderEnv();
    console.error(
      "[cron/housekeeping] run failed:",
      redactSecrets(err instanceof Error ? err.message : "unknown error", [
        env.tmdbToken,
        env.youtubeKey,
        process.env.RESEND_API_KEY ?? null,
      ])
    );
    return NextResponse.json({ ok: false, error: "housekeeping_failed" }, { status: 500 });
  }
}
