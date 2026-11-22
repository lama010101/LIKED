// Language catalog check (PLAN-V2-002 §6.3 / P0-09):
//  (1) key parity across messages/{en,fr,es,th}.json
//  (2) every TMDB tag in lib/i18n/languages.ts exists in TMDB
//      /configuration/primary_translations — SKIPPED (UNVERIFIED) when
//      TMDB_API_READ_ACCESS_TOKEN is absent (task instruction; plan said
//      fail on main/PRs — deviation reported in the task report).
// The DB-side sync (user_prefs.tmdb_lang CHECK / set_language body) is
// deferred to the migration task that recreates set_language (P0-04/144);
// no DB access exists in CI.
// Usage: node scripts/check-languages.mjs
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
if (!token) {
  console.log("SKIPPED (UNVERIFIED): TMDB_API_READ_ACCESS_TOKEN not set — TMDB tag probe not run");
} else {
  try {
    const res = await fetch("https://api.themoviedb.org/3/configuration/primary_translations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const langs = new Set((data.languages ?? []).map((l) => l.iso_639_1));
    const tags = [...new Set([...entries.map((e) => e.tmdbTag), "es-MX"])];
    const missing = tags.filter((t) => !langs.has(t.split("-")[0]));
    check("TMDB primary_translations covers config tags", missing.length === 0,
      "tags=" + tags.join(",") + (missing.length ? " missing-primary=" + missing.join(",") : ""));
  } catch (e) {
    check("TMDB primary_translations fetch", false, String(e).slice(0, 120));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
