// Outbox drain for GET /api/cron/email (PLAN-V2-002 §2.11, P0-18).
// Flow per claimed row: render template -> Resend send (Idempotency-Key
// = outbox id) -> email_finish(ok|error). The SQL functions own leasing,
// attempts and the sent/failed transition; this module never touches
// email_outbox directly (REPO-15). With no RESEND_API_KEY/EMAIL_FROM the
// function returns BEFORE email_claim so no attempt is ever burned.
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getEmailConfig, type EmailConfig } from "./env";
import { sendResendEmail } from "./send";
import { renderEmail } from "./templates";
import type { EmailDb, EmailOutboxRow } from "./types";
import { redactSecrets } from "@/lib/enrich/redact";

export interface DrainOptions {
  client?: EmailDb;
  fetchImpl?: typeof fetch;
  /** Injectable credentials; defaults to process.env. Pass `null` to
   *  simulate unconfigured email in tests. */
  env?: EmailConfig | null;
  /** Rows claimed per run (email_claim p_limit). */
  limit?: number;
}

export interface DrainSummary {
  ok: boolean;
  reason?: string;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

function asRows(data: unknown): EmailOutboxRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (r): r is EmailOutboxRow =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as EmailOutboxRow).id === "string" &&
      typeof (r as EmailOutboxRow).kind === "string"
  );
}

export async function drainEmailOutbox(
  opts: DrainOptions = {}
): Promise<DrainSummary> {
  const empty: DrainSummary = {
    ok: true,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  const env = opts.env === undefined ? getEmailConfig() : opts.env;
  if (!env) {
    console.warn(
      "[cron/email] RESEND_API_KEY or EMAIL_FROM unset — claiming nothing"
    );
    return { ...empty, reason: "email_not_configured" };
  }

  const client =
    opts.client ?? (getSupabaseServiceClient() as unknown as EmailDb);
  const claim = await client.rpc("email_claim", {
    p_limit: opts.limit ?? 10,
  });
  if (claim.error) {
    throw new Error(
      `email_claim: ${claim.error.message ?? "rpc failed"}`
    );
  }
  const rows = asRows(claim.data);
  if (rows.length === 0) return empty;

  const summary: DrainSummary = { ...empty, claimed: rows.length };
  const secrets = [env.apiKey];

  const finish = async (id: string, ok: boolean, error?: string) => {
    const res = await client.rpc("email_finish", {
      p_id: id,
      p_ok: ok,
      p_error: ok
        ? null
        : redactSecrets(error ?? "unknown error", secrets).slice(0, 500),
    });
    if (res.error) {
      summary.failed += 1;
      console.warn(
        `[cron/email] email_finish failed for ${id}: ${redactSecrets(
          res.error.message ?? "",
          secrets
        )}`
      );
      return;
    }
    if (ok) summary.sent += 1;
    else summary.failed += 1;
  };

  for (const row of rows) {
    const to = typeof row.to_email === "string" ? row.to_email.trim() : "";
    if (!to) {
      summary.skipped += 1;
      await finish(row.id, false, "missing_to_email");
      continue;
    }
    const rendered = renderEmail(
      row.kind,
      row.language,
      row.payload ?? {}
    );
    if (!rendered) {
      summary.skipped += 1;
      await finish(row.id, false, `unknown_kind:${row.kind}`);
      continue;
    }
    const sent = await sendResendEmail(
      { to, subject: rendered.subject, text: rendered.text },
      {
        apiKey: env.apiKey,
        from: env.from,
        idempotencyKey: row.id,
        fetchImpl: opts.fetchImpl,
      }
    );
    if (sent.ok) {
      await finish(row.id, true);
    } else {
      await finish(row.id, false, sent.message);
    }
  }

  return summary;
}
