"use client";

import { useEffect } from "react";

/**
 * Theme sync (P0-10): LIKED_THEME cookie is the single source of truth
 * (server-rendered onto <html data-theme> by the root layout). This
 * component only resolves it for legacy pages, whose globals.css has no
 * [data-theme="system"] rules: system -> matchMedia once on mount.
 * localStorage "liked.theme" is read once as a migration source and never
 * written again.
 */

export const THEME_COOKIE = "LIKED_THEME";
const LEGACY_KEY = "liked.theme";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)LIKED_THEME=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(theme: ThemePref) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function isThemePref(v: string | null | undefined): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Current preference: cookie wins; a one-time localStorage migration
 *  covers users who set a theme before the cookie existed. */
export function getThemePref(): ThemePref {
  const c = readCookie();
  if (isThemePref(c)) return c;
  const ls = localStorage.getItem(LEGACY_KEY);
  if (ls === "light" || ls === "dark") {
    writeCookie(ls);
    return ls;
  }
  return "system";
}

/** Preference resolved to a concrete theme (system -> OS). */
export function getResolvedTheme(): ResolvedTheme {
  const p = getThemePref();
  return p === "system" ? (systemPrefersDark() ? "dark" : "light") : p;
}

export default function ThemeSync() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getResolvedTheme());
  }, []);
  return null;
}

export function setTheme(t: ResolvedTheme) {
  writeCookie(t);
  document.documentElement.setAttribute("data-theme", t);
}
