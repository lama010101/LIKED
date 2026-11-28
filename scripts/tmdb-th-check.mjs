#!/usr/bin/env node
// TMDB provider check for the P0-11 acceptance (PLAN-V2-002 §6.3).
//
//  (1) LIVE primary_translations guard: every tag of lib/i18n/languages.ts
//      (en-US, fr-FR, es-ES, es-MX, th-TH) must be listed by TMDB.
//  (2) Thai provider coverage: >= 20 of 120 popular titles (3 pages of
//      movie + 3 pages of tv, language=th-TH) must carry Thai metadata.
//      Coverage proxy: a Thai original, or a localized title that differs
//      from original_title/original_name (TMDB falls back to the original
//      when no translation exists, so equality means "no Thai metadata").
//
// Reads process.env only — never an .env* file (SECRET-SAFETY). Without
// TMDB_API_READ_ACCESS_TOKEN the check prints SKIPPED (UNVERIFIED) and
// exits 0, the same contract as scripts/check-languages.mjs.
//
// Usage: TMDB_API_READ_ACCESS_TOKEN=... node scripts/tmdb-th-check.mjs

const BASE = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 10_000;
const REQUIRED_TAGS = ["en-US", "fr-FR", "es-ES", "es-MX", "th-TH"];
const REQUIRED_TH_TITLES = 20;
const PAGES = [1, 2, 3];

const token = (process.env.TMDB_API_READ_ACCESS_TOKEN ?? "").trim();

function log(line) {
  process.stdout.write(`${line}\n`);
}

function fail(line) {
  process.stderr.write(`FAIL ${line}\n`);
}

async function get(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("TMDB_AUTH_REJECTED");
  }
  if (!res.ok) throw new Error(`TMDB_HTTP_${res.status}`);
  return res.json();
}

/** A tag is covered by itself or by its primary subtag (same rule as
 *  scripts/check-languages.mjs). */
function missingTags(codes, required) {
  const covered = new Set();
  for (const code of codes) {
    const lc = String(code).toLowerCase();
    covered.add(lc);
    covered.add(lc.split("-")[0]);
  }
  return required.filter((tag) => {
    const lt = tag.toLowerCase();
    return !covered.has(lt) && !covered.has(lt.split("-")[0]);
  });
}

function thaiCovered(row) {
  const original = row.original_title ?? row.original_name ?? "";
  const localized = row.title ?? row.name ?? "";
  if (row.original_language === "th") return true;
  return !!localized && !!original && localized !== original;
}

async function main() {
  if (!token) {
    log("SKIPPED (UNVERIFIED) TMDB_API_READ_ACCESS_TOKEN is not set in this environment.");
    log("SKIPPED (UNVERIFIED) no live primary_translations call was made.");
    log("SKIPPED (UNVERIFIED) no Thai provider-coverage sample was taken.");
    return 0;
  }

  let failures = 0;

  const tags = await get("/configuration/primary_translations");
  const codes = Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [];
  const missing = missingTags(codes, REQUIRED_TAGS);
  if (missing.length) {
    failures += 1;
    fail(`primary_translations missing: ${missing.join(", ")} (returned ${codes.length} tags)`);
  } else {
    log(`PASS primary_translations covers ${REQUIRED_TAGS.join(", ")} (${codes.length} tags returned)`);
  }

  const rows = [];
  for (const media of ["movie", "tv"]) {
    for (const page of PAGES) {
      const payload = await get(`/${media}/popular`, { language: "th-TH", page });
      const results = Array.isArray(payload?.results) ? payload.results : [];
      for (const row of results) rows.push({ media, ...row });
    }
  }
  const covered = rows.filter(thaiCovered);
  const sample = covered.slice(0, 5).map((r) => r.title ?? r.name).join(" | ");
  log(
    `TH provider coverage: ${covered.length}/${rows.length} popular titles carry Thai metadata ` +
      `(threshold ${REQUIRED_TH_TITLES})${sample ? ` e.g. ${sample}` : ""}`
  );
  if (covered.length < REQUIRED_TH_TITLES) {
    failures += 1;
    fail(`Thai coverage below threshold: ${covered.length} < ${REQUIRED_TH_TITLES}`);
  }

  log(failures === 0 ? "PASS tmdb-th-check" : `FAILED tmdb-th-check (${failures} failure(s))`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    // The token is never part of the message (URLs are not logged).
    fail(`tmdb-th-check could not complete: ${message}`);
    process.exit(1);
  });
