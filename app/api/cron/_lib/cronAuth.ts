// Shared cron authentication (PLAN-V2-002 §2.12, task V2-W4-PIPELINE-1124-001).
// Same bearer scheme as app/api/youtube/sync/route.ts, with the CTO's
// fail-closed rule: when CRON_SECRET is unset the route answers 503 and
// never runs (no default secret, never open). Constant-time compare.
import { timingSafeEqual } from "node:crypto";

export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 503 };

export function authorizeCron(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503 };
  const header = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  if (header.length !== expected.length) return { ok: false, status: 401 };
  if (!timingSafeEqual(header, expected)) return { ok: false, status: 401 };
  return { ok: true };
}
