#!/usr/bin/env node
// check-protected-paths.mjs — informational protected-path report.
//
// Usage: node scripts/check-protected-paths.mjs [baseRef]
//   baseRef defaults to origin/main.
//
// Prints every file changed vs <baseRef>...HEAD that matches a glob in
// scripts/protected-paths.txt, then "PROTECTED PATHS TOUCHED: <n>".
// Always exits 0 on success — the merge class is a CTO decision; this
// script only surfaces the touch list. No dependencies.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "origin/main";

const patterns = readFileSync(join(root, "scripts", "protected-paths.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith("#"));

// Minimal glob -> RegExp: '**' crosses '/', '*' stays inside a segment,
// '?' is one non-'/' char, everything else is literal.
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

const matchers = patterns.map((glob) => ({ glob, re: globToRegExp(glob) }));

let changed;
try {
  changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
} catch (e) {
  console.error(`check-protected-paths: git diff ${base}...HEAD failed: ${e.message}`);
  process.exit(2);
}

const touched = changed.filter((f) => matchers.some((m) => m.re.test(f)));
for (const f of touched) console.log(f);
console.log(`PROTECTED PATHS TOUCHED: ${touched.length}`);
process.exit(0);
