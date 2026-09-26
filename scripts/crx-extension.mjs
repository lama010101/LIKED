#!/usr/bin/env node
/**
 * Packages extension/dist into public/liked-extension.crx (CRX3 format)
 * for Chromium-based browsers that sideload .crx files directly —
 * notably Microsoft Edge Canary on Android ("Extension install by crx"),
 * the only remaining Android browser path after Kiwi's shutdown.
 *
 * The extension is signed with the same pinned private key used for
 * manifest.json's `key` field, so the installed ID stays
 * hpmjmmabgnekmmaaolnaplbomecgglai — matching NEXT_PUBLIC_EXTENSION_ID
 * on the web app, meaning the /extension/auth relay works unchanged.
 *
 * Run: npm run crx:extension
 *
 * Private key location (NEVER committed):
 *   $LIKED_EXTENSION_KEY, else ~/.liked-extension/liked-extension-key.pem
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ChromeExtension = require("crx");

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "extension", "dist");
const crxPath = join(root, "public", "liked-extension.crx");

const EXPECTED_ID = "hpmjmmabgnekmmaaolnaplbomecgglai";
const keyPath =
  process.env.LIKED_EXTENSION_KEY ??
  join(homedir(), ".liked-extension", "liked-extension-key.pem");

if (!existsSync(distDir)) {
  console.error("extension/dist not found. Run `npm run build:extension` first.");
  process.exit(1);
}
if (!existsSync(keyPath)) {
  console.error(`Private key not found at ${keyPath}.`);
  console.error("Set LIKED_EXTENSION_KEY to the extension's private key PEM path.");
  process.exit(1);
}

const crx = new ChromeExtension({ privateKey: readFileSync(keyPath) });

try {
  await crx.load(distDir);
  const buffer = await crx.pack();

  const appId = crx.generateAppId();
  if (appId !== EXPECTED_ID) {
    console.error(`ID mismatch: key produced ${appId}, expected ${EXPECTED_ID}.`);
    console.error("Do NOT ship this file — the auth relay would target the wrong ID.");
    process.exit(1);
  }

  writeFileSync(crxPath, buffer);
  console.log(`✓ CRX packaged: public/liked-extension.crx (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`✓ Extension ID verified: ${appId}`);
} catch (err) {
  console.error("CRX packaging failed:", err.message ?? err);
  process.exit(1);
}
