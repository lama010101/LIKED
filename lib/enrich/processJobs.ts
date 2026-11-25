// Enrichment worker (PLAN-V2-002 §2.11/§6.6, PRD v2.6 §7, task P0-15).
//
// Claim → provider fetch → class-S apply → finish. Every write goes
// through the migration-143 RPCs (REPO-15); the worker never touches a
// v2 table directly. Concurrency is the RPC's job: enrichment_claim uses
// FOR UPDATE SKIP LOCKED, so two parallel workers never receive the same
// row. Retries/backoff (2^attempts minutes, failed after 5) and the
// items.enrichment_status transition (pending → partial → complete |
// failed) are also owned by the SQL functions, not duplicated here.
//
// Migration 145/149 re-enqueue a stale item as the same 'details' job
// kind; there is no separate refresh marker in enrichment_jobs. The
// DB-backed discriminator is therefore localized[job.param]: absent means
// FIRST fill (item_apply_details), present means REFRESH
// (item_refresh_apply).
//
// This module is called from /api/cron/enrich and from the guest session's
// kick (lib/enrich/kick.ts, not part of this task). It must never be
// called inside a submit request path: submit only enqueues jobs.
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { redactSecrets } from "./redact";
import { fetchTmdbAvailability, fetchTmdbDetails, type TmdbAvailabilityRow } from "./tmdb";
import { fetchYoutubeDetails } from "./youtube";
import {
  readProviderEnv,
  type EnrichDb,
  type EnrichmentItem,
  type EnrichmentJob,
  type ProviderEnv,
} from "./types";

export interface ProcessJobsOptions {
  client?: EnrichDb;
  fetchImpl?: typeof fetch;
  /** Jobs claimed per run (enrichment_claim p_limit). */
  limit?: number;
  /** Injectable credentials; defaults to process.env (names in types.ts). */
  env?: ProviderEnv;
}

export interface ProcessJobsSummary {
  ok: boolean;
  /** Set when the worker did nothing on purpose (e.g. no credentials). */
  reason?: string;
  claimed: number;
  /** Jobs applied successfully (including explicit "unavailable"). */
  done: number;
  /** Provider said the item is gone; display fields were nulled. */
  unavailable: number;
  /** Jobs handed back for retry (or failed after the 5th attempt). */
  errored: number;
}

const MAX_ERROR_LENGTH = 500;

// R2: every string that reaches last_error (enrichment_finish p_error)
// or a log line is secret-redacted first — provider errors can embed
// request URLs (?key=) or credential values. Redact BEFORE truncating
// so a cut can never leave a partial secret behind.
function errorText(err: unknown, secrets: readonly (string | null)[]): string {
  const text = err instanceof Error ? err.message : String(err);
  return redactSecrets(text, secrets).slice(0, MAX_ERROR_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasLocalizedTag(item: EnrichmentItem, tag: string): boolean {
  return isRecord(item.localized) && Object.prototype.hasOwnProperty.call(item.localized, tag);
}

function asJobs(data: unknown): EnrichmentJob[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (j): j is EnrichmentJob =>
      isRecord(j) &&
      typeof j.id === "string" &&
      typeof j.item_id === "string" &&
      (j.job_kind === "details" || j.job_kind === "availability") &&
      typeof j.param === "string"
  );
}

function asItems(data: unknown): EnrichmentItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (i): i is EnrichmentItem =>
      isRecord(i) &&
      typeof i.id === "string" &&
      (i.source === "tmdb" || i.source === "youtube") &&
      typeof i.kind === "string" &&
      typeof i.external_id === "string"
  );
}

export async function processJobs(
  opts: ProcessJobsOptions = {}
): Promise<ProcessJobsSummary> {
  const client = opts.client ?? (getSupabaseServiceClient() as unknown as EnrichDb);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const limit = opts.limit ?? 10;
  const env = opts.env ?? readProviderEnv();
  const empty: ProcessJobsSummary = {
    ok: true,
    claimed: 0,
    done: 0,
    unavailable: 0,
    errored: 0,
  };

  // No provider credentials at all: do not claim, do not burn retries.
  // Jobs stay pending and are picked up once the env vars are set.
  if (!env.tmdbToken && !env.youtubeKey) {
    console.warn(
      "[enrich] no provider credentials (TMDB_API_READ_ACCESS_TOKEN / YOUTUBE_API_KEY) — worker no-op"
    );
    return { ...empty, reason: "no_provider_credentials" };
  }

  const claim = await client.rpc("enrichment_claim", { p_limit: limit });
  if (claim.error) throw new Error(`enrichment_claim: ${claim.error.message ?? "rpc failed"}`);
  const jobs = asJobs(claim.data);
  if (jobs.length === 0) return empty;

  const itemIds = Array.from(new Set(jobs.map((j) => j.item_id)));
  const itemQuery = await client
    .from("items")
    .select("id,source,kind,external_id,localized")
    .in("id", itemIds);
  if (itemQuery.error) {
    throw new Error(`items read: ${itemQuery.error.message ?? "query failed"}`);
  }
  const items = new Map(asItems(itemQuery.data).map((i) => [i.id, i]));

  const summary: ProcessJobsSummary = { ...empty, claimed: jobs.length };

  const providerSecrets = [env.tmdbToken, env.youtubeKey] as const;

  const finish = async (job: EnrichmentJob, ok: boolean, error?: string) => {
    const res = await client.rpc("enrichment_finish", {
      p_job_id: job.id,
      p_ok: ok,
      p_error: ok
        ? null
        : redactSecrets(error ?? "unknown error", providerSecrets).slice(
            0,
            MAX_ERROR_LENGTH
          ),
    });
    // A finish failure means the row stayed 'processing' and will be
    // reclaimed as stale after 5 minutes; count it as errored.
    if (res.error) {
      summary.errored += 1;
      console.warn(
        `[enrich] enrichment_finish failed for job ${job.id}: ${redactSecrets(
          res.error.message ?? "",
          providerSecrets
        )}`
      );
      return;
    }
    if (ok) summary.done += 1;
    else summary.errored += 1;
  };

  const markUnavailable = async (item: EnrichmentItem, job: EnrichmentJob): Promise<void> => {
    const res = await client.rpc("item_refresh_apply", {
      p_item_id: item.id,
      p_payload: {},
      p_unavailable: true,
    });
    if (res.error) {
      await finish(job, false, `item_refresh_apply: ${res.error.message ?? "rpc failed"}`);
      return;
    }
    summary.unavailable += 1;
    await finish(job, true);
  };

  const applyDetails = async (
    item: EnrichmentItem,
    job: EnrichmentJob
  ): Promise<void> => {
    if (item.source === "tmdb") {
      if (!env.tmdbToken) {
        await finish(job, false, "credential_missing:TMDB_API_READ_ACCESS_TOKEN");
        return;
      }
      const res = await fetchTmdbDetails(item, job.param, {
        token: env.tmdbToken,
        fetchImpl,
      });
      if (res.status === "error") {
        await finish(job, false, res.message);
        return;
      }
      if (res.status === "unavailable") {
        await markUnavailable(item, job);
        return;
      }
      const firstFill = !hasLocalizedTag(item, job.param);
      const apply = firstFill
        ? await client.rpc("item_apply_details", {
            p_item_id: item.id,
            p_tag: job.param,
            p_payload: res.value,
          })
        : await client.rpc("item_refresh_apply", {
            p_item_id: item.id,
            p_payload: res.value,
            p_unavailable: false,
          });
      if (apply.error) {
        const fn = firstFill ? "item_apply_details" : "item_refresh_apply";
        await finish(job, false, `${fn}: ${apply.error.message ?? "rpc failed"}`);
        return;
      }
      await finish(job, true);
      return;
    }

    if (!env.youtubeKey) {
      await finish(job, false, "credential_missing:YOUTUBE_API_KEY");
      return;
    }
    const res = await fetchYoutubeDetails(item, { key: env.youtubeKey, fetchImpl });
    if (res.status === "error") {
      await finish(job, false, res.message);
      return;
    }
    if (res.status === "unavailable") {
      await markUnavailable(item, job);
      return;
    }
    const apply = await client.rpc("item_apply_details", {
      p_item_id: item.id,
      p_tag: job.param,
      p_payload: res.value,
    });
    if (apply.error) {
      await finish(job, false, `item_apply_details: ${apply.error.message ?? "rpc failed"}`);
      return;
    }
    await finish(job, true);
  };

  const applyAvailability = async (
    item: EnrichmentItem,
    job: EnrichmentJob
  ): Promise<void> => {
    // YouTube items have no watch providers; finish without a call.
    if (item.source !== "tmdb") {
      await finish(job, true);
      return;
    }
    if (!env.tmdbToken) {
      await finish(job, false, "credential_missing:TMDB_API_READ_ACCESS_TOKEN");
      return;
    }
    const res = await fetchTmdbAvailability(item, job.param, {
      token: env.tmdbToken,
      fetchImpl,
    });
    if (res.status === "error") {
      await finish(job, false, res.message);
      return;
    }
    const rows: TmdbAvailabilityRow[] = res.status === "ok" ? res.value : [];
    const apply = await client.rpc("item_apply_availability", {
      p_item_id: item.id,
      p_region: job.param,
      p_rows: rows,
    });
    if (apply.error) {
      await finish(job, false, `item_apply_availability: ${apply.error.message ?? "rpc failed"}`);
      return;
    }
    await finish(job, true);
  };

  for (const job of jobs) {
    const item = items.get(job.item_id);
    if (!item) {
      await finish(job, false, "item_not_found");
      continue;
    }
    try {
      if (job.job_kind === "details") await applyDetails(item, job);
      else await applyAvailability(item, job);
    } catch (err) {
      await finish(job, false, errorText(err, providerSecrets));
    }
  }

  return summary;
}
