#!/usr/bin/env node
/**
 * Packages extension/dist into public/liked-extension.zip
 * so users can download the extension with one click — no Node.js,
 * no git clone, no build required.
 *
 * Run: npm run zip:extension
 *
 * Uses archiver (pure Node.js, cross-platform).
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiver = require("archiver");

import { existsSync, mkdirSync, rmSync, createWriteStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "extension", "dist");
const publicDir = join(root, "public");
const zipPath = join(publicDir, "liked-extension.zip");

if (!existsSync(distDir)) {
  console.error("extension/dist not found. Run `npm run build:extension` first.");
  process.exit(1);
}

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

if (existsSync(zipPath)) {
  rmSync(zipPath);
}

const output = createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`\n✓ Extension packaged: public/liked-extension.zip (${(archive.pointer() / 1024).toFixed(1)} KB)`);
});

archive.on("error", (err) => {
  console.error("Archive error:", err.message);
  process.exit(1);
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
