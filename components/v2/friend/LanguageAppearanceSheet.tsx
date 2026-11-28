"use client";

// Guest "Language and appearance" sheet (PRD §6.8, task P0-13/P0-14).
// Language, theme and accent are device preferences: non-identifying cookies
// (LIKED_LOCALE, LIKED_THEME, LIKED_ACCENT) that the root layout reads — no DB
// call, no account, no redirect. Strings switch on router.refresh().

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCALE_COOKIE } from "@/lib/i18n/languages";
import AppearanceControls from "@/components/v2/theme/AppearanceControls";

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export default function LanguageAppearanceSheet() {
  const t = useTranslations("friend.language");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openSheet() {
    setOpen(true);
  }

  function chooseLanguage(code: string) {
    if (code === locale) return;
    writeCookie(LOCALE_COOKIE, code);
    router.refresh();
  }

  const active = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-label={t("button", { code: active.code.toUpperCase() })}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border)] bg-[var(--v2-surface)] px-3 py-1.5 text-sm text-[var(--v2-text)]"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9Z" />
        </svg>
        <span aria-hidden="true">{active.code.toUpperCase()}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-t-3xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5 text-[var(--v2-text)] sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold">
                {t("title")}
              </h2>
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                className="rounded-full border border-[var(--v2-border)] px-3 py-1 text-sm"
              >
                {t("close")}
              </button>
            </div>
            <p className="mb-4 text-sm text-[var(--v2-text-muted)]">{t("hint")}</p>

            <fieldset className="mb-4">
              <legend className="mb-2 text-sm font-medium">{t("language")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((language) => (
                  <button
                    key={language.code}
                    type="button"
                    aria-pressed={language.code === locale}
                    onClick={() => chooseLanguage(language.code)}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      language.code === locale
                        ? "border-[var(--v2-accent)] bg-[var(--v2-surface-raised)] font-semibold"
                        : "border-[var(--v2-border)]"
                    }`}
                  >
                    {language.nativeName}
                  </button>
                ))}
              </div>
            </fieldset>

            <AppearanceControls />
          </div>
        </div>
      ) : null}
    </>
  );
}
