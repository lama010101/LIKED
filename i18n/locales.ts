// MVP2 Q14 — supported locales for the new UIX. en is the fallback.
// Single source of truth: lib/i18n/languages.ts (P0-09).
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGE_CODES, LOCALE_COOKIE } from "@/lib/i18n/languages";

export const LOCALES = LANGUAGE_CODES;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = DEFAULT_LANGUAGE as Locale;
export { LOCALE_COOKIE };

export function isLocale(v: string | undefined | null): v is Locale {
  return isLanguageCode(v) && (LOCALES as readonly string[]).includes(v ?? "");
}
