// Behavioral verification of migration 092 (RPC authz gates).
// Signs in as the demo user with the anon/publishable key (so auth.uid() is
// set), then calls RPCs with (a) own user id → must succeed, (b) a different
// user id → must fail with P0003 'Caller does not match user_id'.
//
// Usage: node scripts/verify-rpc-authz-092.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!SUPABASE_URL || !SUPABASE_URL.includes(LIKED_REF)) {
  console.error("ABORT: not the LIKED project");
  process.exit(3);
}

const DEMO_EMAIL = "demo-curator@liked.app";
const DEMO_PASS = process.env.DEMO_TEST_PASSWORD || "DemoCurator2024!";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASS,
});
if (signInErr || !signIn.user) {
  console.error("Sign-in failed:", signInErr?.message);
  console.error("(Set DEMO_TEST_PASSWORD if the demo password differs.)");
  process.exit(2);
}
const me = signIn.user.id;
console.log(`Signed in as demo user: ${me}\n`);

// Find another user id (any user != me)
const { data: others, error: othersErr } = await supabase.from("users").select("id").limit(50);
if (othersErr) { console.error("Cannot list users:", othersErr.message); process.exit(2); }
const victim = others.find((u) => u.id !== me)?.id;
if (!victim) { console.error("No other user found to use as victim"); process.exit(2); }
console.log(`Victim user id: ${victim}\n`);

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗"}  ${label}  ${detail ?? ""}`);
  if (!ok) failures++;
}
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Blocked = the call MUST NOT succeed. Since migration 093, some RPCs are
// revoked from authenticated (permission denied, code 42501) while the rest
// hit the auth.uid() gate (P0003). Either outcome is a pass.
function blocked(result) {
  return !!result.error;
}
function blockedDetail(result) {
  return result.error ? `${result.error.code ?? ""} ${result.error.message ?? ""}` : "NO ERROR — VULNERABLE";
}

// ── get_feed: own id works, victim id raises ──
const ownFeed = await supabase.rpc("get_feed", { p_user_id: me, p_language_code: "en", p_limit: 5 });
check("get_feed(own id) succeeds", !ownFeed.error, ownFeed.error?.message ?? "");
await delay(400);
const victimFeed = await supabase.rpc("get_feed", { p_user_id: victim, p_language_code: "en", p_limit: 5 });
check("get_feed(victim id) blocked", blocked(victimFeed), blockedDetail(victimFeed));

// ── get_social_timeline ──
await delay(400);
const ownTimeline = await supabase.rpc("get_social_timeline", { p_user_id: me, p_language_code: "en", p_cursor_created_at: null, p_cursor_id: null, p_limit: 5 });
check("get_social_timeline(own id) succeeds", !ownTimeline.error, ownTimeline.error?.message ?? "");
await delay(400);
const victimTimeline = await supabase.rpc("get_social_timeline", { p_user_id: victim, p_language_code: "en", p_cursor_created_at: null, p_cursor_id: null, p_limit: 5 });
check("get_social_timeline(victim id) blocked", blocked(victimTimeline), blockedDetail(victimTimeline));

// ── get_friend_bar ──
await delay(400);
const ownBar = await supabase.rpc("get_friend_bar", { p_user_id: me });
check("get_friend_bar(own id) succeeds", !ownBar.error, ownBar.error?.message ?? "");
await delay(400);
const victimBar = await supabase.rpc("get_friend_bar", { p_user_id: victim });
check("get_friend_bar(victim id) blocked", blocked(victimBar), blockedDetail(victimBar));

// ── get_user_folders ──
await delay(400);
const victimFolders = await supabase.rpc("get_user_folders", { p_user_id: victim });
check("get_user_folders(victim id) blocked", blocked(victimFolders), blockedDetail(victimFolders));

// ── get_folder_tree ──
await delay(400);
const victimTree = await supabase.rpc("get_folder_tree", { p_user_id: victim });
check("get_folder_tree(victim id) blocked", blocked(victimTree), blockedDetail(victimTree));

// ── write RPCs (impersonation must be blocked) ──
// hard_delete_node with victim's user id — must be blocked BEFORE deleting anything
await delay(400);
const hardDel = await supabase.rpc("hard_delete_node", { p_node_id: "00000000-0000-0000-0000-000000000001", p_user_id: victim });
check("hard_delete_node(victim id) blocked", blocked(hardDel), blockedDetail(hardDel));

// update_display_name with victim's user id — must be blocked
await delay(400);
const updName = await supabase.rpc("update_display_name", { p_user_id: victim, p_display_name: "HACKED" });
check("update_display_name(victim id) blocked", blocked(updName), blockedDetail(updName));

// direct_share with victim's sharer id — must be blocked
await delay(400);
const share = await supabase.rpc("direct_share", { p_sharer_id: victim, p_node_id: "00000000-0000-0000-0000-000000000001", p_target_user_id: me });
check("direct_share(victim sharer id) blocked", blocked(share), blockedDetail(share));

// ── resource-only functions ──
// delete_folder on a folder owned by victim — must not delete (0 rows affected)
const { data: victimFolderRow } = await supabase.from("folders").select("id").eq("owner_id", victim).limit(1).maybeSingle();
if (victimFolderRow) {
  const del = await supabase.rpc("delete_folder", { p_folder_id: victimFolderRow.id });
  check("delete_folder(victim's folder) no-op", !del.error, del.error?.message ?? "");
  const { data: still } = await supabase.from("folders").select("id").eq("id", victimFolderRow.id).maybeSingle();
  check("victim's folder still exists", !!still, "FOLDER WAS DELETED");
} else {
  console.log("  (no victim-owned folder to test delete_folder)");
}

// set_node_deleted on a victim-owned node — must not change it
const { data: victimNodeRow } = await supabase.from("nodes").select("id").eq("owner_id", victim).limit(1).maybeSingle();
if (victimNodeRow) {
  const td = await supabase.rpc("set_node_deleted", { p_node_id: victimNodeRow.id, p_deleted: true });
  check("set_node_deleted(victim's node) no-op", !td.error, td.error?.message ?? "");
  const { data: nodeAfter } = await supabase.from("nodes").select("deleted_at").eq("id", victimNodeRow.id).maybeSingle();
  check("victim's node NOT trashed", nodeAfter && nodeAfter.deleted_at === null, "NODE WAS TRASHED");
} else {
  console.log("  (no victim-owned node to test set_node_deleted)");
}

console.log(`\n=== RESULT: ${failures === 0 ? "ALL AUTHZ CHECKS PASSED" : failures + " CHECK(S) FAILED"} ===`);
process.exit(failures === 0 ? 0 : 1);
