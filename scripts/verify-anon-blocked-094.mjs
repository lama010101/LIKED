// Verify migration 094: the BARE anon key (no sign-in) must NOT be able to
// call RPCs with an arbitrary user id. This was the residual P0 hole:
// auth.uid() is NULL for anon, so the 092 gate was bypassed and anon had
// anon/PUBLIC EXECUTE grants.
//
// Usage: node scripts/verify-anon-blocked-094.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL?.includes("lzkzfqshnjvlzosnntfx")) { console.error("ABORT: not LIKED project"); process.exit(3); }

// Bare anon client — NO sign-in (role = anon, auth.uid() = NULL)
const anon = createClient(URL, KEY);
const VICTIM = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗"}  ${label}  ${detail ?? ""}`);
  if (!ok) failures++;
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== Anon-role calls (must ALL be blocked) ===\n");

// Read RPCs — previously leaked any user's data to unauthenticated callers
for (const [label, call] of [
  ["get_feed(victim)", () => anon.rpc("get_feed", { p_user_id: VICTIM, p_language_code: "en", p_limit: 5 })],
  ["get_social_timeline(victim)", () => anon.rpc("get_social_timeline", { p_user_id: VICTIM, p_language_code: "en", p_cursor_created_at: null, p_cursor_id: null, p_limit: 5 })],
  ["get_friend_bar(victim)", () => anon.rpc("get_friend_bar", { p_user_id: VICTIM })],
  ["get_user_folders(victim)", () => anon.rpc("get_user_folders", { p_user_id: VICTIM })],
  ["get_folder_tree(victim)", () => anon.rpc("get_folder_tree", { p_user_id: VICTIM })],
]) {
  const r = await call();
  check(label, !!r.error, r.error ? `${r.error.code ?? ""} ${r.error.message ?? ""}` : "NO ERROR — VULNERABLE");
  await delay(400);
}

// Write RPCs — previously could impersonate any user unauthenticated
const writes = [
  ["create_node_with_metadata(victim owner)", () => anon.rpc("create_node_with_metadata", { p_owner_id: VICTIM, p_title: "anon-test", p_language_code: "en", p_tag_labels: [] })],
  ["update_display_name(victim)", () => anon.rpc("update_display_name", { p_user_id: VICTIM, p_display_name: "HACKED" })],
  ["upsert_rating(victim)", () => anon.rpc("upsert_rating", { p_user_id: VICTIM, p_node_id: "00000000-0000-0000-0000-000000000001", p_score: 10 })],
  ["delete_folder(any)", () => anon.rpc("delete_folder", { p_folder_id: "00000000-0000-0000-0000-000000000001" })],
];
for (const [label, call] of writes) {
  const r = await call();
  check(label, !!r.error, r.error ? `${r.error.code ?? ""} ${r.error.message ?? ""}` : "NO ERROR — VULNERABLE");
  await delay(400);
}

// Also: authenticated RPCs with anon key BUT wrong role should not work — sanity: no-op.
console.log(`\n=== RESULT: ${failures === 0 ? "ALL ANON CALLS BLOCKED" : failures + " VULNERABLE" } ===`);
process.exit(failures === 0 ? 0 : 1);
