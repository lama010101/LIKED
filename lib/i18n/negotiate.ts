// Accept-Language negotiation (PLAN-V2-002 §7.2 item 2, PRD D17).
// Pure functions — unit-tested in negotiate.test.ts. IP is NEVER used.
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, isLanguageCode } from "./languages";

/** Parse an Accept-Language header into [primarySubtag, q] pairs sorted by
 *  descending q (default q=1; q=0 and "*" are ignored per spec). */
export function parseAcceptLanguage(header: string | null | undefined): [string, number][] {
  if (!header) return [];
  const out: [string, number][] = [];
  for (const part of header.split(",")) {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag?.trim();
    if (!tag || tag === "*") continue;
    let q = 1;
    for (const p of params) {
      const m = p.trim().match(/^q=([0-9.]+)$/i);
      if (m) q = parseFloat(m[1]);
    }
    if (q <= 0) continue;
    const primary = tag.split("-")[0].toLowerCase();
    if (primary) out.push([primary, q]);
  }
  // stable descending q; equal q keeps header order
  return out
    .map((entry, i) => [entry, i] as const)
    .sort((a, b) => b[0][1] - a[0][1] || a[1] - b[1])
    .map(([e]) => e);
}

/** First supported primary subtag in q-order wins; English fallback. */
export function negotiateLocale(header: string | null | undefined): string {
  for (const [sub] of parseAcceptLanguage(header)) {
    if (isLanguageCode(sub)) return sub;
  }
  return DEFAULT_LANGUAGE;
}

export { LANGUAGE_CODES };
