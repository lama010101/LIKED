"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ACCENT_PRESET_NAMES,
  ACCENT_PRESETS,
  ACCENT_RE,
  DEFAULT_ACCENT,
  resolveCustomAccent,
  type AccentPresetName,
} from "@/lib/theme/contrast";
import { toast } from "@/lib/store/toastStore";

const THEME_COOKIE = "LIKED_THEME";
const ACCENT_COOKIE = "LIKED_ACCENT";
const ONE_YEAR = 60 * 60 * 24 * 365;
const THEMES = ["system", "light", "dark"] as const;
type ThemeValue = (typeof THEMES)[number];

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

function currentTheme(): ThemeValue {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

function currentAccent(): string {
  return document.documentElement.getAttribute("data-accent") || DEFAULT_ACCENT;
}

function clearInlineAccent() {
  const root = document.documentElement;
  root.style.removeProperty("--v2-accent-lt");
  root.style.removeProperty("--v2-on-lt");
  root.style.removeProperty("--v2-accent-dk");
  root.style.removeProperty("--v2-on-dk");
}

function applyAccent(value: string) {
  const root = document.documentElement;
  if ((ACCENT_PRESET_NAMES as readonly string[]).includes(value)) {
    root.setAttribute("data-accent", value);
    clearInlineAccent();
    return;
  }
  if (!ACCENT_RE.test(value)) return;
  const resolved = resolveCustomAccent(value);
  root.setAttribute("data-accent", "custom");
  root.style.setProperty("--v2-accent-lt", resolved.light.accent);
  root.style.setProperty("--v2-on-lt", resolved.light.onAccent);
  root.style.setProperty("--v2-accent-dk", resolved.dark.accent);
  root.style.setProperty("--v2-on-dk", resolved.dark.onAccent);
}

/** Theme/accent controls shared by owner Settings and the guest appearance
 *  sheet. The cookie is written immediately (guest persistence is device-only;
 *  owners additionally persist through the callback), while the html attributes
 *  are mutated in-place so there is no reload or wrong-theme flash. */
export default function AppearanceControls({
  initialTheme,
  initialAccent,
  persist,
}: {
  initialTheme?: string;
  initialAccent?: string;
  persist?: (patch: { theme?: ThemeValue; accent?: string }) => Promise<void>;
}) {
  const t = useTranslations("appearance");
  const [theme, setTheme] = useState<ThemeValue>(
    initialTheme === "light" || initialTheme === "dark" ? initialTheme : "system"
  );
  const [accent, setAccent] = useState(initialAccent || DEFAULT_ACCENT);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    const attr = currentAccent();
    if (attr === "custom") {
      const cookie = document.cookie.match(/(?:^|;\s*)LIKED_ACCENT=([^;]+)/)?.[1];
      if (cookie && ACCENT_RE.test(cookie)) setAccent(cookie);
    } else {
      setAccent(attr);
    }
  }, []);

  async function save(patch: { theme?: ThemeValue; accent?: string }) {
    if (!persist) return;
    setBusy(true);
    try {
      await persist(patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  function chooseTheme(value: ThemeValue) {
    setTheme(value);
    writeCookie(THEME_COOKIE, value);
    document.documentElement.setAttribute("data-theme", value);
    void save({ theme: value });
  }

  function chooseAccent(value: string) {
    setAccent(value);
    writeCookie(ACCENT_COOKIE, value);
    applyAccent(value);
    void save({ accent: value });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="appearance-controls">
      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-medium">{t("theme")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === theme}
              onClick={() => chooseTheme(value)}
              className={`rounded-xl border px-3 py-2 text-sm ${
                value === theme
                  ? "border-[var(--v2-accent)] bg-[var(--v2-surface-raised)] font-semibold"
                  : "border-[var(--v2-border)]"
              }`}
              data-testid={`theme-${value}`}
            >
              {t(value)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-medium">{t("primaryColor")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {ACCENT_PRESET_NAMES.map((name) => {
            const preset = name as AccentPresetName;
            const selected = accent === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseAccent(preset)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  selected
                    ? "border-[var(--v2-accent)] bg-[var(--v2-surface-raised)] font-semibold"
                    : "border-[var(--v2-border)]"
                }`}
                data-testid={`accent-${preset}`}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: ACCENT_PRESETS[preset].light }}
                />
                {t(preset)}
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <span>{t("custom")}</span>
          <input
            type="color"
            value={ACCENT_RE.test(accent) ? accent : ACCENT_PRESETS.orange.dark}
            aria-label={t("custom")}
            onChange={(event) => chooseAccent(event.target.value.toUpperCase())}
            className="h-9 w-12 cursor-pointer rounded border border-[var(--v2-border)] bg-transparent p-1"
            data-testid="accent-custom"
          />
        </label>
      </fieldset>
    </div>
  );
}
