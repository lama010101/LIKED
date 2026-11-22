// Single LANGUAGES config (PLAN-V2-002 §6.3/§7.2, PRD §6.8 D18).
// Replaces the three hard-coded lists (i18n/locales.ts, profile.ts,
// SQL set_language — the SQL one moves in a later migration task).
// UI code -> native name -> TMDB `language` tag.

export interface Language {
  code: string;
  nativeName: string;
  tmdbTag: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: "en", nativeName: "English", tmdbTag: "en-US" },
  { code: "fr", nativeName: "Français", tmdbTag: "fr-FR" },
  { code: "es", nativeName: "Español", tmdbTag: "es-ES" },
  { code: "th", nativeName: "ไทย", tmdbTag: "th-TH" },
] as const;

export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const LOCALE_COOKIE = "LIKED_LOCALE";

export function isLanguageCode(v: string | undefined | null): v is string {
  return !!v && LANGUAGE_CODES.includes(v);
}

// Regions that select the es-MX TMDB variant (plan §6.3).
const LATAM_REGIONS = new Set([
  "MX", "AR", "CL", "CO", "PE", "VE", "UY", "PY", "EC", "BO", "CR",
  "DO", "GT", "HN", "NI", "PA", "SV", "CU", "PR", "419",
]);

export function languageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/** TMDB tag for a UI locale; `es` becomes es-MX when the Accept-Language
 *  region is Latin-American (one Spanish UI catalog either way). */
export function tmdbTagFor(code: string, acceptLanguage?: string | null): string {
  const lang = languageByCode(code);
  if (!lang) return LANGUAGES[0].tmdbTag;
  if (lang.code === "es" && acceptLanguage) {
    const first = acceptLanguage.split(",")[0]?.trim() ?? "";
    const region = first.split("-")[1]?.toUpperCase();
    if (region && LATAM_REGIONS.has(region)) return "es-MX";
  }
  return lang.tmdbTag;
}
