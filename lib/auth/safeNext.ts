// safeNext (PLAN-V2-002 §5.2, closes T15 open redirect): only local absolute
// paths are allowed as post-auth `next` targets — anything else falls back.
// Blocks `@evil.example`, `//evil.example`, `https://evil.example`, `/\evil`.
const SAFE_NEXT_RE = /^\/(?!\/)/;

export function safeNext(
  next: string | null | undefined,
  fallback = "/feed"
): string {
  if (next && SAFE_NEXT_RE.test(next) && !next.includes("\\")) return next;
  return fallback;
}
