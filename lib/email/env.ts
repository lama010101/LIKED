// Email sender configuration (PLAN-V2-002 §2.11/P0-18, task
// V2-W5-PIPELINE-1125-001). FAIL CLOSED like the ask secrets: when
// RESEND_API_KEY or EMAIL_FROM is unset the cron claims NOTHING and
// answers {sent:0, reason:'email_not_configured'} — no attempts are
// burned while the sending domain is not set up.
export interface EmailConfig {
  apiKey: string;
  from: string;
}

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}
