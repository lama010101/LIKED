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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
