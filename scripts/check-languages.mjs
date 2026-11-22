// Language catalog check (PLAN-V2-002 §6.3 / P0-09):
//  (1) key parity across messages/{en,fr,es,th}.json
//  (2) every TMDB tag in lib/i18n/languages.ts exists in TMDB
//      /configuration/primary_translations — SKIPPED (UNVERIFIED) when
//      TMDB_API_READ_ACCESS_TOKEN is absent (task instruction; plan said
//      fail on main/PRs — deviation reported in the task report).
//      HTTP 401/403 -> FAIL (bad token). Network error, 10s timeout, 429
//      or 5xx -> retried twice, then WARNING + exit 0 (a TMDB outage must
//      not block merges). The payload is parsed tolerantly: a plain array
//      of strings/objects, or an object with an array under `languages`
//      or `results`.
// The DB-side sync (user_prefs.tmdb_lang CHECK / set_language body) is
// deferred to the migration task that recreates set_language (P0-04/144);
// no DB access exists in CI.
// Usage: node scripts/check-languages.mjs
import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TMDB_PRIMARY_TRANSLATIONS_URL =
  "https://api.themoviedb.org/3/configuration/primary_translations";
const TMDB_TIMEOUT_MS = 10_000;
const TMDB_MAX_ATTEMPTS = 3; // initial try + 2 retries

/**
 * Extract language codes from a primary_translations payload.
 * Accepts a plain array (strings or {iso_639_1|iso_639_2|code} objects)
 * or an object carrying an array under `languages` or `results`.
 * @param {unknown} payload
 * @returns {{ ok: true, codes: string[] } | { ok: false, shape: string }}
 */
export function extractLanguageCodes(payload) {
  let items = null;
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object") {
    const inner = payload.languages ?? payload.results;
    if (Array.isArray(inner)) items = inner;
  }
  if (!items) {
    const shape =
      payload === null
        ? "null"
        : typeof payload !== "object"
          ? typeof payload
          : Array.isArray(payload)
            ? `array(len=${payload.length})`
            : `object(keys=${Object.keys(payload).slice(0, 10).join(",")})`;
    return { ok: false, shape };
  }
  const codes = [];
  for (const item of items) {
    if (typeof item === "string") {
      codes.push(item);
    } else if (item && typeof item === "object") {
      const code = item.iso_639_1 ?? item.iso_639_2 ?? item.code;
      if (typeof code === "string") codes.push(code);
    }
  }
  if (codes.length === 0) {
    return { ok: false, shape: `array(len=${items.length}) without language codes` };
  }
  return { ok: true, codes };
}

/**
 * Required tags absent from the response. A tag counts as covered when
 * the response contains the full tag or its primary subtag
 * (e.g. es-MX is covered by "es"), case-insensitive.
 * @param {string[]} codes
 * @param {string[]} requiredTags
 * @returns {string[]}
 */
export function findMissingTags(codes, requiredTags) {
  const covered = new Set();
  for (const code of codes) {
    const lc = String(code).toLowerCase();
    covered.add(lc);
    covered.add(lc.split("-")[0]);
  }
  return requiredTags.filter((tag) => {
    const lt = tag.toLowerCase();
    return !covered.has(lt) && !covered.has(lt.split("-")[0]);
  });
}

/**
 * Fetch primary_translations with retries.
 * @param {string} token
 * @returns {Promise<{ kind: "ok", data: unknown } | { kind: "auth", status: number } | { kind: "http", status: number } | { kind: "badshape", shape: string } | { kind: "unreachable", error: string }>}
 */
async function fetchPrimaryTranslations(token) {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= TMDB_MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TMDB_TIMEOUT_MS);
    try {
      const res = await fetch(TMDB_PRIMARY_TRANSLATIONS_URL, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return { kind: "auth", status: res.status };
      }
      if (res.ok) {
        const text = await res.text();
        try {
          return { kind: "ok", data: JSON.parse(text) };
        } catch {
          return { kind: "badshape", shape: `non-JSON body(${text.slice(0, 200)})` };
        }
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
      } else {
        return { kind: "http", status: res.status };
      }
    } catch (e) {
      lastError =
        e && e.name === "AbortError" ? "timeout 10s" : String(e?.message ?? e);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < TMDB_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { kind: "unreachable", error: lastError };
}

async function main() {
  const { LANGUAGES, tmdbTagFor } = await import(
    join(root, "lib/i18n/languages.ts").replace(/\\/g, "/")
  ).catch(() => ({ LANGUAGES: null, tmdbTagFor: null }));

  // languages.ts is TS — parse the config statically instead of importing.
  const src = readFileSync(join(root, "lib/i18n/languages.ts"), "utf8");
  const entries = [...src.matchAll(/\{ code: "([a-z]+)", nativeName: "[^"]+", tmdbTag: "([^"]+)" \}/g)]
    .map((m) => ({ code: m[1], tmdbTag: m[2] }));

  let pass = 0, fail = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
    ok ? pass++ : fail++;
  };

  // (1) key parity
  const flatten = (o, p = "", out = new Set()) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? p + "." + k : k;
      if (v && typeof v === "object") flatten(v, key, out);
      else out.add(key);
    }
    return out;
  };
  const catalogs = {};
  for (const loc of ["en", "fr", "es", "th"]) {
    catalogs[loc] = flatten(JSON.parse(readFileSync(join(root, "messages", loc + ".json"), "utf8")));
  }
  const enKeys = catalogs.en;
  for (const loc of ["fr", "es", "th"]) {
    const missing = [...enKeys].filter((k) => !catalogs[loc].has(k));
    const extra = [...catalogs[loc]].filter((k) => !enKeys.has(k));
    check(`key parity ${loc} vs en`, missing.length === 0 && extra.length === 0,
      `keys=${catalogs[loc].size} missing=${missing.length} extra=${extra.length}` +
      (missing.length ? " e.g. " + missing.slice(0, 3).join(",") : ""));
  }

  // config sanity: 4 languages, unique codes/tags
  check("LANGUAGES config has en/fr/es/th",
    entries.length === 4 && ["en", "fr", "es", "th"].every((c) => entries.some((e) => e.code === c)),
    entries.map((e) => e.code + ":" + e.tmdbTag).join(", "));

  // (2) TMDB primary_translations probe
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token || !token.trim()) {
    console.log("SKIPPED (UNVERIFIED): TMDB_API_READ_ACCESS_TOKEN not set — TMDB tag probe not run");
  } else {
    const tags = [...new Set([...entries.map((e) => e.tmdbTag), "es-MX"])];
    const outcome = await fetchPrimaryTranslations(token);
    if (outcome.kind === "auth") {
      check("TMDB primary_translations auth", false,
        `HTTP ${outcome.status} — bad or expired TMDB_API_READ_ACCESS_TOKEN`);
    } else if (outcome.kind === "http") {
      check("TMDB primary_translations fetch", false, `HTTP ${outcome.status}`);
    } else if (outcome.kind === "unreachable") {
      console.log(`WARNING  TMDB primary_translations unreachable after ${TMDB_MAX_ATTEMPTS} attempts (${outcome.error}) — probe skipped, not blocking`);
    } else if (outcome.kind === "badshape") {
      check("TMDB primary_translations payload", false, outcome.shape);
    } else {
      const parsed = extractLanguageCodes(outcome.data);
      if (!parsed.ok) {
        check("TMDB primary_translations payload", false, parsed.shape);
      } else {
        const missing = findMissingTags(parsed.codes, tags);
        check("TMDB primary_translations covers config tags", missing.length === 0,
          "tags=" + tags.join(",") + (missing.length ? " missing=" + missing.join(",") : ""));
      }
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  await main();
}
