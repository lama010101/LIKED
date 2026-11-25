// Secret redaction for anything persisted (enrichment_jobs.last_error via
// enrichment_finish p_error) or logged (PLAN-V2-002, task
// V2-W5-PIPELINE-1125-001 R2). Provider error strings can embed request
// URLs (?key=<api key>) or echo an Authorization header, so every error
// text that leaves lib/enrich passes through here first. Three shapes are
// masked: `key=`-style query values, `Bearer <token>` headers, and the
// literal credential values themselves (env values are passed in by the
// caller — this module never reads process.env).

const REDACTED = "<redacted>";
// Query parameters that carry credentials in provider URLs. The value is
// masked whatever it looks like; the parameter name is kept for debugging.
const QUERY_SECRET_RE =
  /([?&](?:key|api_key|apikey|access_token|token|sig)=)[^&\s"'<>]+/gi;
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
// Literal env values shorter than this are not masked: a short string
// (e.g. "en", "US") would over-redact innocent error text.
const MIN_LITERAL_LENGTH = 8;

export function redactSecrets(
  text: string,
  secrets: readonly (string | null | undefined)[] = []
): string {
  if (!text) return text;
  let out = text.replace(QUERY_SECRET_RE, `$1${REDACTED}`);
  out = out.replace(BEARER_RE, `$1${REDACTED}`);
  const seen = new Set<string>();
  for (const secret of secrets) {
    if (
      typeof secret !== "string" ||
      secret.length < MIN_LITERAL_LENGTH ||
      seen.has(secret)
    ) {
      continue;
    }
    seen.add(secret);
    out = out.split(secret).join(REDACTED);
  }
  return out;
}
