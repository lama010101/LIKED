// MVP2 Q14 — supported locales for the new UIX. en is the fallback.
export const LOCALES = ["en", "fr", "th"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "LIKED_LOCALE";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
