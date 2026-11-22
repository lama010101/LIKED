"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCALE_COOKIE } from "@/lib/i18n/languages";

// Minimal landing language switcher (PRD §6.8 globe + code). Writes the
// LIKED_LOCALE cookie exactly as i18n/request.ts reads it (path "/", 1 year,
// SameSite=Lax), then router.refresh(). No DB call, no RPC, no API route,
// no redirect. Disclosure pattern: button + list of buttons.
function writeLocaleCookie(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export default function LanguageSwitcher() {
  const t = useTranslations("landing.switcher");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(code: string) {
    setOpen(false);
    buttonRef.current?.focus();
    if (code === locale) return;
    writeLocaleCookie(code);
    startTransition(() => router.refresh());
  }

  return (
    <div className="lp-switch" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="lp-switch-btn"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("button", { name: current.nativeName })}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9Z" />
        </svg>
        <span aria-hidden="true">{current.code.toUpperCase()}</span>
      </button>
      {open && (
        <ul id={menuId} className="lp-switch-menu" aria-label={t("menu")}>
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                lang={l.code}
                className="lp-switch-opt"
                aria-pressed={l.code === locale}
                onClick={() => choose(l.code)}
              >
                <span>{l.nativeName}</span>
                {l.code === locale && (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
