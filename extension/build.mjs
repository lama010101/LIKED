// LIKED Chrome extension build script.
//
// Bundles the service worker and popup entry points with esbuild, injects
// LIKED_API_URL at build time, and copies static assets (manifest.json,
// popup.html, popup.css, icons) into extension/dist/.
//
// Usage:
//   node build.mjs            # one-shot build
//   node build.mjs --watch    # rebuild on change
//
// Env:
//   LIKED_API_URL  base URL of the LIKED web app (default http://localhost:3000)

import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "src");
const DIST = join(__dirname, "dist");
const PUBLIC = join(__dirname, "public");

const LIKED_API_URL = process.env.LIKED_API_URL ?? "http://localhost:3000";
const watch = process.argv.includes("--watch");

const define = {
  LIKED_API_URL: JSON.stringify(LIKED_API_URL),
};

const commonOptions = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome110",
  define,
  logLevel: "info",
};

async function copyStatic() {
  if (existsSync(DIST)) {
    await rm(DIST, { recursive: true, force: true });
  }
  await mkdir(DIST, { recursive: true });
  await mkdir(join(DIST, "icons"), { recursive: true });

  await cp(join(__dirname, "manifest.json"), join(DIST, "manifest.json"));
  await cp(join(SRC, "popup/popup.html"), join(DIST, "popup.html"));
  await cp(join(SRC, "popup/popup.css"), join(DIST, "popup.css"));
  await cp(join(PUBLIC, "icons"), join(DIST, "icons"), { recursive: true });
}

async function main() {
  await copyStatic();

  const entries = [
    { entryPoints: ["src/background/service-worker.ts"], outfile: join(DIST, "background.js") },
    { entryPoints: ["src/popup/popup.ts"], outfile: join(DIST, "popup.js") },
  ];

  if (watch) {
    const ctxs = await Promise.all(
      entries.map((e) =>
        context({ ...e, ...commonOptions, minify: false, sourcemap: "inline" })
      )
    );
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[liked-extension] watching…");
  } else {
    for (const e of entries) {
      await build({ ...e, ...commonOptions, minify: true });
    }
    console.log("[liked-extension] build complete → extension/dist/");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
