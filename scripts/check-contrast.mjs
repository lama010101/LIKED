// Contrast gate (PLAN-V2-002 §7.3 / P0-10): asserts the 12 preset pairs and
// runs 1 000 random custom colours through adjustCustomAccent. Fails if any
// output is below 4.5:1 (text) or 3:1 (UI) in either theme.
// Usage: node scripts/check-contrast.mjs
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// lib/theme/contrast.ts is TypeScript; compile it standalone (it has no
// imports) so this script runs on plain node.
const outDir = mkdtempSync(join(tmpdir(), "contrast-"));
execFileSync(
  process.execPath,
  [join(root, "node_modules/typescript/bin/tsc"), "lib/theme/contrast.ts", "--outDir", outDir, "--module", "esnext", "--target", "es2022", "--skipLibCheck"],
  { cwd: root, stdio: "pipe" }
);
const mod = await import(pathToFileURL(join(outDir, "contrast.js")).href);
const {
  ACCENT_PRESETS,
  ACCENT_PRESET_NAMES,
  adjustCustomAccent,
  contrastRatio,
  pickOnAccent,
  MIN_TEXT_RATIO,
  MIN_UI_RATIO,
  SURFACES,
} = mod;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

// 12 preset pairs: text ≥ 4.5 on the picked on-accent, UI ≥ 3 vs #FFFFFF (light) / #0A0A12 (dark)
for (const name of ACCENT_PRESET_NAMES) {
  const p = ACCENT_PRESETS[name];
  for (const side of ["light", "dark"]) {
    const accent = p[side];
    const on = pickOnAccent(accent);
    const text = contrastRatio(accent, on);
    const ui = contrastRatio(accent, side === "light" ? "#FFFFFF" : "#0A0A12");
    check(`preset ${name}/${side}`, text >= MIN_TEXT_RATIO && ui >= MIN_UI_RATIO,
      `accent=${accent} on=${on} text=${text.toFixed(2)} ui=${ui.toFixed(2)}`);
  }
}

// 1 000 random custom colours through the adjust function, both themes
let worstText = Infinity, worstUi = Infinity, bad = [];
for (let i = 0; i < 1000; i++) {
  const hex = "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0").toUpperCase();
  for (const side of ["light", "dark"]) {
    const r = adjustCustomAccent(hex, side);
    const text = contrastRatio(r.accent, r.onAccent);
    const ui = contrastRatio(r.accent, SURFACES[side]);
    worstText = Math.min(worstText, text);
    worstUi = Math.min(worstUi, ui);
    if (text < MIN_TEXT_RATIO || ui < MIN_UI_RATIO) bad.push(`${hex}/${side}`);
  }
}
check("1000 random custom colours (both themes)", bad.length === 0,
  `worstText=${worstText.toFixed(2)} worstUi=${worstUi.toFixed(2)}${bad.length ? " bad=" + bad.slice(0, 5).join(",") : ""}`);

// ── Landing pairs (V2-LANDING-001-R2): resolved from app/v2-tokens.css ──
// Text pairs >= 4.5:1, UI pairs >= 3:1, both themes, default (Orange) accent.
import { readFileSync } from "fs";
const css = readFileSync(join(root, "app/v2-tokens.css"), "utf8");
const block = (sel) => {
  // merge every block with this selector (landing tokens are a later block)
  const out = {};
  let i = css.indexOf("\n" + sel + " {");
  while (i !== -1) {
    const body = css.slice(i, css.indexOf("}", i));
    for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    i = css.indexOf("\n" + sel + " {", i + 1);
  }
  return out;
};
const rootVars = block(":root");
const dark = { ...block('[data-ui="v2"]') };
const light = { ...dark, ...block('html[data-theme="light"] [data-ui="v2"]') };
const themes = {
  dark: { ...dark, "--v2-accent": rootVars["--v2-accent-dk"], "--v2-on-accent": rootVars["--v2-on-dk"] },
  light: { ...light, "--v2-accent": rootVars["--v2-accent-lt"], "--v2-on-accent": rootVars["--v2-on-lt"] },
};
for (const [theme, v] of Object.entries(themes)) {
  const g = (k) => v[k];
  const text = [
    ["text on bg", "--v2-text", "--v2-bg"],
    ["text on surface", "--v2-text", "--v2-surface"],
    ["text on surface-raised", "--v2-text", "--v2-surface-raised"],
    ["muted on bg", "--v2-text-muted", "--v2-bg"],
    ["muted on surface", "--v2-text-muted", "--v2-surface"],
    ["muted on surface-raised", "--v2-text-muted", "--v2-surface-raised"],
    ["accent text on bg (eyebrow, H1 highlight)", "--v2-accent", "--v2-bg"],
    ["accent text on surface", "--v2-accent", "--v2-surface"],
    ["on-accent on accent (buttons, badges, band)", "--v2-on-accent", "--v2-accent"],
    ["avatar initial on avatar 1", "--v2-lp-av-on", "--v2-lp-av-1"],
    ["avatar initial on avatar 2", "--v2-lp-av-on", "--v2-lp-av-2"],
    ["avatar initial on avatar 3", "--v2-lp-av-on", "--v2-lp-av-3"],
    ["avatar initial on avatar 4", "--v2-lp-av-on", "--v2-lp-av-4"],
    ["avatar initial on avatar 5", "--v2-lp-av-on", "--v2-lp-av-5"],
    ["bg on text (tooltip, All avatar)", "--v2-bg", "--v2-text"],
  ];
  for (const [name, fg, bg] of text) {
    const r = contrastRatio(g(fg), g(bg));
    check(`landing ${theme} text: ${name}`, r >= MIN_TEXT_RATIO, `${g(fg)} on ${g(bg)} = ${r.toFixed(2)}`);
  }
  const ui = [
    ["accent vs bg (rings, focus)", "--v2-accent", "--v2-bg"],
    ["accent vs surface (ring, badge, slider)", "--v2-accent", "--v2-surface"],
    ["neutral ring vs surface", "--v2-ring-tmdb", "--v2-surface"],
  ];
  for (const [name, a, b] of ui) {
    const r = contrastRatio(g(a), g(b));
    check(`landing ${theme} UI: ${name}`, r >= MIN_UI_RATIO, `${g(a)} vs ${g(b)} = ${r.toFixed(2)}`);
  }
}

// ── Landing v2b pairs (V2-LANDING-002-A): warm tokens from app/v2-tokens.css ──
// Same rules: text >= 4.5:1, UI >= 3:1, both themes, default (Orange) accent.
// The page extends this script (no fork). System-theme blocks must equal the
// explicit light/dark blocks so "System" can never drift from them.
{
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = (sel) => {
    const re = new RegExp("(?:^|\\n)[ \\t]*" + esc(sel) + " \\{([^}]*)\\}", "g");
    return [...css.matchAll(re)].map((m) => {
      const o = {};
      for (const d of m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) o[d[1]] = d[2].trim();
      return o;
    });
  };
  const B = '[data-ui="v2"][data-landing="v2b"]';
  const [baseDark] = bodies(B);
  const [explicitDark] = bodies('html[data-theme="dark"] ' + B);
  const [explicitLight] = bodies('html[data-theme="light"] ' + B);
  const [sysLight, sysDark] = bodies('html[data-theme="system"] ' + B);
  check("v2b token blocks present", !!(baseDark && explicitDark && explicitLight && sysLight && sysDark));
  const KEYS = ["--v2-bg", "--v2-surface", "--v2-surface-raised", "--v2-text", "--v2-text-muted", "--v2-border",
    "--v2-ring-tmdb", "--v2-lb-field-border", "--v2-lb-danger", "--v2-lb-success"];
  const same = (a, b) => KEYS.every((k) => a[k] === b[k]);
  check("v2b system-light == explicit light", same(sysLight, explicitLight));
  check("v2b system-dark == explicit dark == base", same(sysDark, explicitDark) && same(baseDark, explicitDark));

  const hexRe = /#[0-9A-Fa-f]{6}/g;
  const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb) => "#" + rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("").toUpperCase();
  const blend = (fg, a, bg) => toHex(toRgb(bg).map((c, i) => c * (1 - a) + fg[i] * a));
  const rgba = (v) => { const m = v.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/); return m ? { rgb: [+m[1], +m[2], +m[3]], a: +m[4] } : null; };
  const scrim = rgba(baseDark["--v2-lb-scrim"]);
  const onPoster = baseDark["--v2-lb-on-poster"];
  check("v2b scrim + on-poster tokens parse", !!scrim && /^#[0-9A-Fa-f]{6}$/.test(onPoster));

  for (const [theme, own, accentKeys] of [
    ["dark", { ...dark, ...baseDark }, ["--v2-accent-dk", "--v2-on-dk"]],
    ["light", { ...light, ...baseDark, ...explicitLight }, ["--v2-accent-lt", "--v2-on-lt"]],
  ]) {
    const v = { ...own, "--v2-accent": rootVars[accentKeys[0]], "--v2-on-accent": rootVars[accentKeys[1]] };
    const g = (k) => v[k];
    // Accent TEXT is only used on bg/surface (never on surface-raised): see v2b.css
    const text = [
      ["text on bg", "--v2-text", "--v2-bg"],
      ["text on surface", "--v2-text", "--v2-surface"],
      ["text on surface-raised", "--v2-text", "--v2-surface-raised"],
      ["muted on bg", "--v2-text-muted", "--v2-bg"],
      ["muted on surface", "--v2-text-muted", "--v2-surface"],
      ["muted on surface-raised", "--v2-text-muted", "--v2-surface-raised"],
      ["accent text on bg (eyebrow, one-liner)", "--v2-accent", "--v2-bg"],
      ["accent text on surface", "--v2-accent", "--v2-surface"],
      ["on-accent on accent (buttons, step number, unseen badge)", "--v2-on-accent", "--v2-accent"],
      ["placeholder (muted) on surface (input)", "--v2-text-muted", "--v2-surface"],
      ["error text on bg", "--v2-lb-danger", "--v2-bg"],
      ["error text on surface", "--v2-lb-danger", "--v2-surface"],
      ["success text on surface", "--v2-lb-success", "--v2-surface"],
      ["avatar initial on avatar 1", "--v2-lp-av-on", "--v2-lp-av-1"],
      ["avatar initial on avatar 2", "--v2-lp-av-on", "--v2-lp-av-2"],
      ["avatar initial on avatar 3", "--v2-lp-av-on", "--v2-lp-av-3"],
    ];
    for (const [name, fg, bg] of text) {
      const r = contrastRatio(g(fg), g(bg));
      check(`v2b ${theme} text: ${name}`, r >= MIN_TEXT_RATIO, `${g(fg)} on ${g(bg)} = ${r.toFixed(2)}`);
    }
    const ui = [
      ["email field border vs bg", "--v2-lb-field-border", "--v2-bg"],
      ["email field border vs surface", "--v2-lb-field-border", "--v2-surface"],
      ["accent vs bg (focus ring, icons)", "--v2-accent", "--v2-bg"],
      ["accent vs surface-raised (badge dot, chevron)", "--v2-accent", "--v2-surface-raised"],
      ["neutral TMDB ring vs surface", "--v2-ring-tmdb", "--v2-surface"],
      ["neutral TMDB ring vs surface-raised", "--v2-ring-tmdb", "--v2-surface-raised"],
    ];
    for (const [name, a, b] of ui) {
      const r = contrastRatio(g(a), g(b));
      check(`v2b ${theme} UI: ${name}`, r >= MIN_UI_RATIO, `${g(a)} vs ${g(b)} = ${r.toFixed(2)}`);
    }
    // Text over images: poster placeholder gradients under the scrim (worst stop).
    for (let n = 1; n <= 6; n++) {
      const stops = (own[`--v2-lp-poster-${n}`] ?? baseDark[`--v2-lp-poster-${n}`] ?? dark[`--v2-lp-poster-${n}`] ?? "").match(hexRe) ?? [];
      let worst = Infinity;
      for (const s of stops) worst = Math.min(worst, contrastRatio(onPoster, blend(scrim.rgb, scrim.a, s)));
      check(`v2b ${theme} text over poster ${n} (scrim)`, stops.length >= 2 && worst >= MIN_TEXT_RATIO, `worst stop = ${worst.toFixed(2)}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
