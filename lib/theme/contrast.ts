// Theme foundation (PLAN-V2-002 §7.3, PRD §6.8/§8/D13): accent presets,
// WCAG 2.1 contrast math, on-accent picker and custom-colour adjustment.
// Pure functions — used by app/layout.tsx (SSR), the theme settings UI
// (P1-09) and scripts/check-contrast.mjs (CI). No imports: the check
// script compiles this file standalone.

export type ThemeSide = "light" | "dark";

export interface AccentPreset {
  light: string; // accent used on light theme
  dark: string; // accent used on dark theme
}

export const ACCENT_PRESETS = {
  orange: { light: "#C2410C", dark: "#FF9552" },
  blue: { light: "#1D4ED8", dark: "#60A5FA" },
  violet: { light: "#6D28D9", dark: "#A78BFA" },
  teal: { light: "#0F766E", dark: "#2DD4BF" },
  green: { light: "#15803D", dark: "#4ADE80" },
  pink: { light: "#BE185D", dark: "#F472B6" },
} as const satisfies Record<string, AccentPreset>;

export type AccentPresetName = keyof typeof ACCENT_PRESETS;
export const ACCENT_PRESET_NAMES = Object.keys(ACCENT_PRESETS) as AccentPresetName[];
export const DEFAULT_ACCENT: AccentPresetName = "orange";

export const ACCENT_RE = /^#[0-9A-Fa-f]{6}$/;
export const MIN_TEXT_RATIO = 4.5; // WCAG AA text
export const MIN_UI_RATIO = 3; // WCAG AA UI components

// Theme surfaces the accent must stay readable against (plan §7.3).
export const SURFACES: Record<ThemeSide, string> = {
  light: "#F2F2F6",
  dark: "#0A0A12",
};
export const ON_ACCENT_CANDIDATES = ["#FFFFFF", "#111111"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// WCAG 2.1 relative luminance.
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// On-accent text: white or near-black, whichever contrasts more.
export function pickOnAccent(accent: string): string {
  let best: string = ON_ACCENT_CANDIDATES[0];
  let bestRatio = -1;
  for (const c of ON_ACCENT_CANDIDATES) {
    const r = contrastRatio(accent, c);
    if (r > bestRatio) {
      bestRatio = r;
      best = c;
    }
  }
  return best;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${to(r)}${to(g)}${to(b)}`;
}

export interface ResolvedAccent {
  accent: string;
  onAccent: string;
}

// Custom #RRGGBB: pick the better on-accent; if its ratio is below 4.5, step
// HSL lightness by 2% (darker on light theme, lighter on dark) until text
// ≥ 4.5 AND accent vs theme surface ≥ 3. Bounded at 100 steps.
export function adjustCustomAccent(input: string, theme: ThemeSide): ResolvedAccent {
  const surface = SURFACES[theme];
  const dir = theme === "light" ? -1 : 1; // light theme darkens, dark theme lightens
  let hex = input.toUpperCase();
  for (let i = 0; i < 100; i++) {
    const onAccent = pickOnAccent(hex);
    const textRatio = contrastRatio(hex, onAccent);
    const uiRatio = contrastRatio(hex, surface);
    if (textRatio >= MIN_TEXT_RATIO && uiRatio >= MIN_UI_RATIO) {
      return { accent: hex, onAccent };
    }
    const [r, g, b] = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    const nl = Math.min(1, Math.max(0, l + dir * 0.02));
    if (nl === l) break;
    hex = hslToHex(h, s, nl);
  }
  const onAccent = pickOnAccent(hex);
  return { accent: hex, onAccent };
}

// Both theme variants of a custom accent (used by layout SSR + settings UI).
export function resolveCustomAccent(input: string): Record<ThemeSide, ResolvedAccent> {
  return {
    light: adjustCustomAccent(input, "light"),
    dark: adjustCustomAccent(input, "dark"),
  };
}
