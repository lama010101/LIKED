// Client IP extraction + rate-limit key hashing (PLAN-V2-002 §4.3,
// threat T17). Raw IPs are never stored: every rate_limits.key_hash is
// sha256(RATE_LIMIT_PEPPER | scope | value) — the pepper makes the hashes
// non-reversible even for the small IPv4 space.
import { createHash } from "node:crypto";
import { isIP } from "node:net";

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

/** Expand a validated IPv6 literal to its 8 groups ("::" compression
 *  resolved). Returns null on any malformed shape — isIP() has already
 *  screened the input, so this is defense in depth only. */
function expandIpv6Groups(addr: string): string[] | null {
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail =
    halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array<string>(fill).fill("0"), ...tail];
}

/** Value fed to hashRlKey for the per-IP rate-limit bucket (§4.3/T17).
 *  IPv4 passes through verbatim; IPv4-mapped IPv6 (::ffff:a.b.c.d)
 *  collapses to the IPv4; every other IPv6 is expanded ("::" resolved,
 *  zone id stripped, lowercased) and truncated to the first 4 groups —
 *  the /64 prefix — so addresses sharing a subscriber prefix share one
 *  bucket. null or unparseable -> "unknown". The raw IP stays in-memory
 *  only; this normalized form is what gets hashed. */
export function rateLimitIpKey(ip: string | null): string {
  if (ip == null) return "unknown";
  const candidate = ip.trim();
  if (!candidate) return "unknown";
  const kind = isIP(candidate);
  if (kind === 4) return candidate;
  if (kind !== 6) return "unknown";
  const pct = candidate.indexOf("%");
  const bare = (pct === -1 ? candidate : candidate.slice(0, pct)).toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (mapped) return mapped[1];
  const groups = expandIpv6Groups(bare);
  if (!groups) return "unknown";
  return groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":");
}
