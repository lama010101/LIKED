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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
