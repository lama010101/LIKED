// Resend delivery by raw fetch (package*.json FROZEN — no SDK).
// Idempotency-Key = the outbox row id so a retried send can never
// double-deliver; AbortSignal.timeout keeps a hung upstream from
// stalling the cron. Secrets are redacted from every error string
// before it can reach email_outbox.last_error or a log line.
import { redactSecrets } from "@/lib/enrich/redact";

const RESEND_URL = "https://api.resend.com/emails";
export const EMAIL_SEND_TIMEOUT_MS = 8_000;

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendResendEmail(
  email: OutgoingEmail,
  opts: {
    apiKey: string;
    from: string;
    idempotencyKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<SendResult> {
  const html =
    email.html ??
    `<div style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(email.text)}</div>`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": opts.idempotencyKey,
      },
      body: JSON.stringify({
        from: opts.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? EMAIL_SEND_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout =
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    const raw = isTimeout
      ? "provider_timeout"
      : `network: ${err instanceof Error ? err.message : "fetch failed"}`;
    return { ok: false, message: redactSecrets(raw, [opts.apiKey]) };
  }
  if (!res.ok) {
    return {
      ok: false,
      message: redactSecrets(`resend_http_${res.status}`, [opts.apiKey]),
    };
  }
  try {
    const body = (await res.json()) as { id?: string };
    return { ok: true, id: body.id };
  } catch {
    return { ok: true };
  }
}
