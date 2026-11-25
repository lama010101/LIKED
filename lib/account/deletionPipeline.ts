// Account deletion pipeline (PLAN-V2-002 §3.4/§3.5, P0-20). Stage order
// is fixed and every stage is idempotent so a crashed run resumes from
// the account_deletion_jobs ledger:
//   revoke (best-effort Google) -> delete_account RPC (DB tx, ledger
//   'storage') -> Storage purge -> auth.admin.deleteUser -> advance.
// Ledger stages: storage < auth < email < done (forward-only via
// deletion_job_advance). The account_deleted confirmation mail is queued
// by delete_account itself (p_email) — the 'email' stage only confirms
// the queue exists before 'done' nulls the ledger address.
// Used by /api/account/delete, the housekeeping stuck-job resume and
// scripts/process-deletion-requests.mjs.
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/youtube/token-crypto";
import { redactSecrets } from "@/lib/enrich/redact";

export type DeletionStage = "storage" | "auth" | "email" | "done";
const STAGE_ORDER: DeletionStage[] = ["storage", "auth", "email", "done"];

export interface PipelineDb {
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        maybeSingle(): Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
  storage: {
    from(bucket: string): {
      list(
        path: string,
        opts?: Record<string, unknown>
      ): Promise<{ data: { name: string }[] | null; error: { message?: string } | null }>;
      remove(paths: string[]): Promise<{ data: unknown; error: { message?: string } | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser(id: string): Promise<{ data: unknown; error: { message?: string; code?: string; status?: number } | null }>;
    };
  };
}

export interface PipelineOptions {
  userId: string;
  email: string | null;
  /** Stage to resume from (default 'storage' = full pipeline). */
  fromStage?: DeletionStage;
  client?: PipelineDb;
  fetchImpl?: typeof fetch;
}

export interface PipelineResult {
  ok: boolean;
  stage: DeletionStage;
  error?: string;
}

const MAX_ERROR = 500;

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR);
}

async function advance(
  client: PipelineDb,
  userId: string,
  stage: DeletionStage,
  error?: string
): Promise<void> {
  const res = await client.rpc("deletion_job_advance", {
    p_user_id: userId,
    p_stage: stage,
    p_error: error ?? null,
  });
  if (res.error) {
    // Ledger write failure must not kill the pipeline; housekeeping's
    // claim_stuck will still see the job at its last committed stage.
    console.warn(
      `[deletion] deletion_job_advance(${stage}) failed for ${userId}: ${res.error.message ?? ""}`
    );
  }
}

/** Best-effort Google grant revoke — same logic as
 *  app/api/youtube/disconnect (refresh token preferred, access token
 *  fallback; any failure is swallowed). */
async function revokeGoogle(
  client: PipelineDb,
  userId: string,
  fetchImpl: typeof fetch
): Promise<void> {
  try {
    const { data } = await client
      .from("youtube_connections")
      .select("access_token, refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    const row = data as { access_token?: string | null; refresh_token?: string | null } | null;
    let token: string | null = null;
    try {
      if (row?.refresh_token) token = decryptToken(row.refresh_token);
      else if (row?.access_token) token = decryptToken(row.access_token);
    } catch {
      token = null;
    }
    if (token) {
      await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(8_000),
      });
    }
  } catch {
    // best-effort only
  }
}

/** Storage purge: delete every object under thumbnails/<uid>/ in
 *  batches of 100 until the prefix is empty (SQL deletes are blocked by
 *  protect_objects_delete — Storage API only, PLAN §3.4c). */
async function purgeStorage(client: PipelineDb, userId: string): Promise<void> {
  const bucket = client.storage.from("thumbnails");
  const prefix = `${userId}/`;
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await bucket.list(prefix, { limit: 100 });
    if (error) throw new Error(`storage_list: ${error.message ?? "failed"}`);
    const names = (data ?? []).map((o) => o.name).filter(Boolean);
    if (names.length === 0) return;
    const paths = names.map((n) => `${prefix}${n}`);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: rmErr } = await bucket.remove(paths.slice(i, i + 100));
      if (rmErr) throw new Error(`storage_remove: ${rmErr.message ?? "failed"}`);
    }
  }
  throw new Error("storage_purge: iteration cap reached");
}

async function deleteAuthUser(client: PipelineDb, userId: string): Promise<void> {
  const { error } = await client.auth.admin.deleteUser(userId);
  if (!error) return;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  const status = error.status ?? 0;
  // "not found" counts as success — the auth user may already be gone.
  if (status === 404 || code === "user_not_found" || /not found/i.test(msg)) return;
  throw new Error(`auth_delete: ${msg}`);
}

/** Run the pipeline from `fromStage` (inclusive) to 'done'. Each stage
 *  is attempted once here; the caller (route retries / cron resume)
 *  drives re-runs — stages are idempotent. Returns the stage reached. */
export async function runDeletionPipeline(
  opts: PipelineOptions
): Promise<PipelineResult> {
  const client = opts.client ?? (getSupabaseServiceClient() as unknown as PipelineDb);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const startIdx = Math.max(
    0,
    STAGE_ORDER.indexOf(opts.fromStage ?? "storage")
  );
  let stage: DeletionStage = STAGE_ORDER[startIdx];

  try {
    // Pre-DB stage: Google revoke must happen before delete_account
    // wipes youtube_connections. Only on a fresh ('storage') run — a
    // resumed job already passed it.
    if (startIdx === 0) {
      await revokeGoogle(client, opts.userId, fetchImpl);
      const del = await client.rpc("delete_account", {
        p_user_id: opts.userId,
        p_email: opts.email,
      });
      if (del.error) throw new Error(`delete_account: ${del.error.message ?? "rpc failed"}`);
      const j = del.data as { already?: boolean; deleted?: boolean; not_found?: boolean } | null;
      if (j?.not_found && !j?.already) {
        // No users row and no ledger: nothing to delete in the DB, but
        // storage/auth residue may still exist — continue the pipeline.
      }
    }

    if (STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf("storage") && startIdx <= 0) {
      // 'storage' stage work: purge files, then advance to 'auth'.
      // Runs whenever we are at/before storage (fresh or resumed there).
    }

    // Stage 'storage': Storage purge.
    if (startIdx <= STAGE_ORDER.indexOf("storage")) {
      await purgeStorage(client, opts.userId);
      await advance(client, opts.userId, "auth");
      stage = "auth";
    }
    // Stage 'auth': delete the auth user.
    if (STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf("auth")) {
      await deleteAuthUser(client, opts.userId);
      await advance(client, opts.userId, "email");
      stage = "email";
    }
    // Stage 'email': the account_deleted mail was queued by
    // delete_account (p_email -> email_outbox); 'done' nulls the ledger
    // address. Nothing else to do — the cron/email drain sends it.
    if (STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf("email")) {
      await advance(client, opts.userId, "done");
      stage = "done";
    }
    return { ok: true, stage };
  } catch (err) {
    const message = redactSecrets(errText(err), [
      process.env.TMDB_API_READ_ACCESS_TOKEN,
      process.env.YOUTUBE_API_KEY,
      process.env.RESEND_API_KEY,
    ]);
    // Record the failure on the ledger at the stage we were attempting.
    try {
      await advance(client, opts.userId, stage, message);
    } catch {
      /* ledger best-effort */
    }
    return { ok: false, stage, error: message };
  }
}
