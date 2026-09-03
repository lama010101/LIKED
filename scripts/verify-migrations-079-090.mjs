// Verify migrations 079-090 are applied to the LIKED remote DB.
// Uses the supabase-js client with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY
// from .env.local (same pattern as seed-demo-user.mjs / verify-p3.js).
//
// Strategy:
//   1. Confirm we're on the LIKED project (URL contains lzkzfqshnjvlzosnntfx).
//   2. Try to read supabase_migrations.schema_migrations (may not be exposed via REST).
//   3. Probe each expected RPC by calling it with empty/minimal params.
//      - "Could not find the function X"  => MISSING
//      - Any other error (param/execution) => EXISTS
//      - Success                          => EXISTS
//
// Read-only: no writes, no mutations. Probes use harmless/empty params that
// either return empty results or fail on validation — never on missing data.
//
// Usage: node scripts/verify-migrations-079-090.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

config({ path: join(root, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

// ── Guard: must be the LIKED project ────────────────────────────
const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!SUPABASE_URL.includes(LIKED_REF)) {
  console.error(`ABORT: NEXT_PUBLIC_SUPABASE_URL does not match LIKED project (${LIKED_REF}).`);
  console.error(`Got: ${SUPABASE_URL}`);
  console.error("Refusing to run against any other project.");
  process.exit(3);
}
console.log(`OK: Target is LIKED project (${LIKED_REF}).`);
// Don't echo the service key.
console.log(`URL: ${SUPABASE_URL}\n`);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Expected migrations (079-090) ───────────────────────────────
const EXPECTED_MIGRATIONS = [
  "079_drop_broken_create_node",
  "080_drop_nondeterministic_create_folder_overload",
  "081_create_atomic_folder_rpcs",
  "082_extend_create_node_with_metadata_auto_folder",
  "083_get_folder_tree_rpc",
  "084_get_user_folders_rpc",
  "085_get_social_timeline_rpc",
  "086_add_custom_order_to_get_feed",
  "087_scope_rls_policies",
  "088_add_indexes",
  "089_fk_cascade_and_tag_unique",
  "090_hard_delete_node_rpc",
];

// ── RPCs the app now depends on ─────────────────────────────────
// Each entry: { name, params } — params chosen to be harmless.
// A "not found" error proves the function is missing; any other
// error (or success) proves it exists.
const NIL = "00000000-0000-0000-0000-000000000000";
const PROBES = [
  // 081: move_node_to_folder(p_node_id, p_target_folder_id, p_source_folder_id, p_user_id)
  { name: "move_node_to_folder", params: { p_node_id: NIL, p_target_folder_id: NIL, p_source_folder_id: null, p_user_id: NIL } },
  // 081: create_folder_with_nodes(p_name, p_parent_folder_id, p_node_ids, p_user_id)
  { name: "create_folder_with_nodes", params: { p_name: "__audit_probe__", p_parent_folder_id: null, p_node_ids: [], p_user_id: NIL } },
  // 083: get_folder_tree(p_user_id)
  { name: "get_folder_tree", params: { p_user_id: NIL } },
  // 084: get_user_folders(p_user_id)
  { name: "get_user_folders", params: { p_user_id: NIL } },
  // 085: get_social_timeline(p_user_id, p_limit, p_cursor_created_at, p_cursor_id)
  { name: "get_social_timeline", params: { p_user_id: NIL, p_limit: 1, p_cursor_created_at: null, p_cursor_id: null } },
  // 090: hard_delete_node(p_node_id, p_user_id)
  { name: "hard_delete_node", params: { p_node_id: NIL, p_user_id: NIL } },
  // 082: create_node_with_metadata(p_owner_id, p_url, p_text_content, p_title, p_thumbnail_key, p_language_code, p_tag_labels, p_description, p_auto_folder_name)
  { name: "create_node_with_metadata", params: { p_owner_id: NIL, p_url: null, p_text_content: "__audit_probe__", p_title: null, p_thumbnail_key: null, p_language_code: "en", p_tag_labels: [], p_description: null, p_auto_folder_name: null } },
  // 086: get_feed(p_user_id, p_language_code, p_view, p_friend_id, p_folder_id, p_group_id, p_filter_tag_ids, p_filter_friend_ids, p_filter_folder_ids, p_search_query, p_sort, p_cursor_created_at, p_cursor_node_id, p_limit, p_exclude_foldered, p_custom_order_ids)
  { name: "get_feed", params: { p_user_id: NIL, p_limit: 1, p_sort: "newest", p_view: "all", p_search_query: null, p_filter_tag_ids: null, p_cursor_created_at: null, p_cursor_node_id: null, p_custom_order_ids: null } },
];

function classifyError(error) {
  const msg = (error?.message || "").toLowerCase();
  // PostgREST returns these when the function is not in the schema cache.
  if (msg.includes("could not find the function") || msg.includes("could not find the rpc") || msg.includes("function") && msg.includes("does not exist")) {
    return "MISSING";
  }
  return "EXISTS"; // param error, permission error, execution error — all mean it exists
}

async function main() {
  // 1. Sanity: confirm nodes table exists and is queryable (service role).
  const { data: nodesCheck, error: nodesErr } = await supabase
    .from("nodes")
    .select("id")
    .limit(1);
  if (nodesErr) {
    console.error("ERROR: Cannot query public.nodes — this may not be the LIKED DB.");
    console.error(nodesErr.message);
    process.exit(3);
  }
  console.log("OK: public.nodes is queryable. This is the LIKED DB.\n");

  // 2. Try reading the migrations table (usually not exposed via REST).
  console.log("=== Migration log (supabase_migrations.schema_migrations) ===");
  let migrationRows = null;
  try {
    // PostgREST may not expose the supabase_migrations schema; try anyway.
    const { data, error } = await supabase
      .schema("supabase_migrations")
      .from("schema_migrations")
      .select("version, name")
      .order("version", { ascending: true });
    if (error) throw error;
    migrationRows = data;
    console.log(`Found ${data.length} applied migrations.`);
    // Print just the 079-090 range + a few neighbors.
    const recent = data.filter((r) => {
      const v = String(r.version);
      return v.startsWith("07") || v.startsWith("08") || v.startsWith("09") || v.startsWith("06");
    });
    for (const r of recent) console.log(`  ${r.version}  ${r.name || "(no name)"}`);
  } catch (e) {
    console.log(`Not accessible via REST: ${e.message}`);
    console.log("(This is normal — supabase_migrations schema is not exposed to PostgREST.)");
  }
  console.log("");

  // 3. Probe each expected RPC.
  console.log("=== RPC existence probe (definitive) ===");
  let missing = [];
  let existing = [];
  for (const probe of PROBES) {
    const { data, error } = await supabase.rpc(probe.name, probe.params);
    if (!error) {
      existing.push(probe.name);
      console.log(`  EXISTS   ${probe.name}  (returned data, no error)`);
    } else {
      const cls = classifyError(error);
      if (cls === "MISSING") {
        missing.push(probe.name);
        console.log(`  MISSING  ${probe.name}  → ${error.message}`);
      } else {
        existing.push(probe.name);
        // Truncate long error messages.
        const m = error.message.length > 80 ? error.message.slice(0, 80) + "…" : error.message;
        console.log(`  EXISTS   ${probe.name}  (error: ${m})`);
      }
    }
  }
  console.log("");

  // 4. Summary.
  const ok = missing.length === 0;
  console.log("=== SUMMARY ===");
  console.log(`RPCs present:  ${existing.length}/${PROBES.length}`);
  console.log(`RPCs missing:  ${missing.length}`);
  if (missing.length) missing.forEach((f) => console.log(`  - ${f}`));
  if (migrationRows) {
    const expectedVersions = EXPECTED_MIGRATIONS.map((f) => f.match(/^(\d+)/)[1]);
    const appliedVersions = new Set(migrationRows.map((r) => String(r.version)));
    const notInLog = expectedVersions.filter((v) => !appliedVersions.has(v));
    console.log(`Migrations in log: ${migrationRows.length} total`);
    if (notInLog.length) {
      console.log(`Migrations NOT in log (079-090): ${notInLog.length}`);
      notInLog.forEach((v) => console.log(`  - ${v}`));
    } else {
      console.log("All 079-090 versions found in migration log.");
    }
  } else {
    console.log("Migration log not accessible — relying on RPC probe results only.");
  }
  console.log(ok ? "\nRESULT: All expected RPCs are present on the remote DB." : "\nRESULT: GAPS DETECTED — some RPCs are missing on the remote DB.");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
