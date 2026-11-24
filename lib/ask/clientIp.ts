// Client IP extraction + rate-limit key hashing (PLAN-V2-002 §4.3,
// threat T17). Raw IPs are never stored: every rate_limits.key_hash is
// sha256(RATE_LIMIT_PEPPER | scope | value) — the pepper makes the hashes
// non-reversible even for the small IPv4 space.
import { createHash } from "node:crypto";

/** Client IP = first value of x-forwarded-for, else x-real-ip (§4.3).
 *  Vercel sets these at the edge; spoofing only defeats the IP layer —
 *  the per-contributor/per-token layers still apply. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

/** Deterministic hex key_hash for rate_limits. `scope` separates key
 *  kinds ("ip", "contributor", "token", "user", "pow") so the same raw
 *  value in different buckets cannot collide. */
export function hashRlKey(scope: string, value: string, pepper: string): string {
  return createHash("sha256")
    .update(`${pepper}|${scope}|${value}`, "utf8")
    .digest("hex");
}
