// Verify migration 087 (scoped RLS policies) is applied on the LIKED remote DB.
// Checks that the old permissive policies are gone and the new scoped ones exist.
// Read-only: queries pg_catalog via the PostgREST-exposed `pg_policies` view.
//
// Usage: node scripts/verify-rls-087.mjs

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
const LIKED_REF = "lzkzfqshnjvlzosnntfx";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
if (!SUPABASE_URL.includes(LIKED_REF)) {
  console.error(`ABORT: URL does not match LIKED project (${LIKED_REF}). Got: ${SUPABASE_URL}`);
  process.exit(3);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Old permissive policies that should be GONE after 087.
const OLD_POLICIES = [
  { table: "users",          policy: "users_select_all" },
  { table: "folder_edges",   policy: "folder_edges_select_authenticated" },
  { table: "folder_tree",    policy: "folder_tree_select_authenticated" },
  { table: "folder_admins",  policy: "folder_admins_select_authenticated" },
  { table: "group_nodes",    policy: "group_nodes_select_authenticated" },
  { table: "group_members",  policy: "group_members_select_authenticated" },
  { table: "group_admins",   policy: "group_admins_select_authenticated" },
];

// New scoped policies that should EXIST after 087.
const NEW_POLICIES = [
  { table: "users",          policy: "users_select_scoped" },
  { table: "folder_edges",   policy: "folder_edges_select_scoped" },
  { table: "folder_tree",    policy: "folder_tree_select_scoped" },
  { table: "folder_admins",  policy: "folder_admins_select_scoped" },
  { table: "group_nodes",    policy: "group_nodes_select_scoped" },
  { table: "group_members",  policy: "group_members_select_scoped" },
  { table: "group_admins",   policy: "group_admins_select_scoped" },
];

async function main() {
  // pg_policies is a built-in Postgres view exposed by PostgREST.
  const { data: policies, error } = await supabase
    .from("pg_policies")
    .select("tablename, policyname, cmd, qual")
    .in("tablename", ["users", "folder_edges", "folder_tree", "folder_admins", "group_nodes", "group_members", "group_admins"])
    .order("tablename", { ascending: true });

  if (error) {
    console.error("Cannot query pg_policies:", error.message);
    console.error("(If pg_policies is not exposed, this check cannot run via REST.)");
    process.exit(2);
  }

  // Build a lookup set: "tablename:policyname"
  const policySet = new Set();
  for (const p of policies) {
    policySet.add(`${p.tablename}:${p.policyname}`);
  }

  console.log("=== Migration 087 RLS policy verification ===\n");

  // Check old policies are gone.
  console.log("Old permissive policies (should be ABSENT):");
  let oldRemaining = [];
  for (const { table, policy } of OLD_POLICIES) {
    const key = `${table}:${policy}`;
    const present = policySet.has(key);
    const status = present ? "STILL PRESENT ⚠" : "removed ✓";
    if (present) oldRemaining.push(`${table}.${policy}`);
    console.log(`  ${status.padEnd(20)} ${table}.${policy}`);
  }
  console.log("");

  // Check new policies exist.
  console.log("New scoped policies (should be PRESENT):");
  let newMissing = [];
  for (const { table, policy } of NEW_POLICIES) {
    const key = `${table}:${policy}`;
    const present = policySet.has(key);
    const status = present ? "present ✓" : "MISSING ⚠";
    if (!present) newMissing.push(`${table}.${policy}`);
    console.log(`  ${status.padEnd(20)} ${table}.${policy}`);
  }
  console.log("");

  // Also show the actual SELECT policy definitions for the key tables.
  console.log("=== Actual SELECT policy definitions (spot check) ===");
  const spotCheck = ["users", "folder_edges", "group_members"];
  for (const table of spotCheck) {
    const selectPolicies = policies.filter((p) => p.tablename === table && p.cmd === "SELECT");
    for (const p of selectPolicies) {
      const qual = p.qual ? p.qual.slice(0, 100) : "(no USING clause)";
      console.log(`  ${table} → ${p.policyname}: ${qual}...`);
    }
  }
  console.log("");

  const ok = oldRemaining.length === 0 && newMissing.length === 0;
  console.log("=== SUMMARY ===");
  console.log(`Old policies still present: ${oldRemaining.length}`);
  if (oldRemaining.length) oldRemaining.forEach((p) => console.log(`  - ${p}`));
  console.log(`New policies missing:       ${newMissing.length}`);
  if (newMissing.length) newMissing.forEach((p) => console.log(`  - ${p}`));
  console.log(ok ? "\nRESULT: Migration 087 is applied — all scoped policies in place." : "\nRESULT: GAPS DETECTED — migration 087 may not be fully applied.");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
