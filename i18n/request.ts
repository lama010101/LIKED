import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "./locales";
import { negotiateLocale } from "@/lib/i18n/negotiate";

// Default language, first match wins (PRD D17): (1) saved choice cookie
// LIKED_LOCALE; (2) Accept-Language q-values; (3) English. IP is never
// used for language (REPO-19). No redirects, no URL prefixes.
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const saved = isLocale(raw) ? raw : null;
  const acceptLanguage = saved ? null : (await headers()).get("accept-language");
  const locale = saved ?? negotiateLocale(acceptLanguage);
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
