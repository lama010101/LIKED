// Static gate for the deletion runbook safety contract. The behavioral
// proof is the fixture run documented in WP-1; this check exists so the
// pre-fix script fails fast without risking a real deletion.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./process-deletion-requests.mjs", import.meta.url), "utf8");
const failures = [];

if (!src.includes('process.argv.includes("--yes")')) {
  failures.push("missing explicit --yes execution gate");
}
if (!/dry run/i.test(src)) {
  failures.push("missing dry-run mode");
}
if (!/eq\("status",\s*"confirmed"\)/.test(src)) {
  failures.push("missing confirmed-only dry-run candidate query");
}
if (/console\.log\([^\n]*\bemail\b/.test(src) || /console\.log\([^\n]*\$\{email\}/.test(src)) {
  failures.push("console output can include email");
}

if (failures.length) {
  console.error(`FAIL process-deletion-requests safety: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS process-deletion-requests safety shape");
