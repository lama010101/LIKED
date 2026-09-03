// Apply migration 091_fix_rls_recursion.sql to the LIKED remote DB.
// Uses supabase-js with .env.local credentials. Guards against wrong project.
//
// Usage: node scripts/apply-migration-091.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

import { config } from "dotenv";
import { readFileSync } from "fs";
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

console.log(`OK: Target is LIKED project (${LIKED_REF}).`);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Read the migration SQL
const migrationPath = join(root, "supabase", "migrations", "091_fix_rls_recursion.sql");
const sql = readFileSync(migrationPath, "utf-8");

console.log(`Migration file: ${migrationPath}`);
console.log(`SQL length: ${sql.length} chars\n`);

// Execute via the Supabase SQL API (service role can execute raw SQL)
async function main() {
  // The supabase-js client doesn't have a direct SQL execution method,
  // but we can use the REST API's /rest/v1/rpc endpoint or the pg API.
  // Since we need to run DDL (CREATE FUNCTION, DROP POLICY, CREATE POLICY),
  // we need to use the Supabase SQL endpoint.
  //
  // The service role key grants access to the pg_meta.execute_sql RPC
  // or we can use the PostgREST /pg/query endpoint.
  //
  // Actually, the simplest approach: use the supabase-js .rpc() to call
  // a function that executes the SQL. But we don't have such a function.
  //
  // Alternative: use the Supabase Management API or the pg connection.
  // Since we have pg as a dependency, let's use that directly.

  const { Pool } = require("pg");

  // Build connection string from env
  // Supabase pooler connection: postgresql://postgres.{ref}:{password}@aws-{region}.pooler.supabase.com:{port}/postgres
  // We need the DB password. Let's check if it's in env.
  let connStr = process.env.DATABASE_URL;
  // If DATABASE_URL uses the direct connection (db.{ref}.supabase.co),
  // rewrite to the pooler connection (aws-1-us-west-2.pooler.supabase.com)
  // which is accessible from outside Supabase's network.
  if (connStr && connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
    // Extract password from the connection string
    const pwMatch = connStr.match(/:([^:@]+)@/);
    if (pwMatch) {
      connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pwMatch[1]}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
      console.log("Rewrote DATABASE_URL to use pooler connection.");
    }
  }
  if (!connStr) {
    const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD;
    if (dbPassword) {
      connStr = `postgresql://postgres.${LIKED_REF}:${dbPassword}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
    }
  }

  if (!connStr) {
    console.error("Cannot execute DDL via supabase-js (no raw SQL execution).");
    console.error("Need either DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local");
    console.error("Alternatively, apply the migration manually via Supabase Dashboard SQL Editor:");
    console.error(`  ${SUPABASE_URL}/project/_/sql/new`);
    console.error("\nOr run: supabase db push (if Supabase CLI is configured)");
    console.error("\nMigration file to apply: supabase/migrations/091_fix_rls_recursion.sql");
    process.exit(2);
  }

  const masked = connStr.replace(/:[^:@]+@/, ":***@");
  console.log(`Connecting via: ${masked}\n`);

  const pool = new Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    // Verify we're on the LIKED DB
    const { rows: checkRows } = await client.query(`
      SELECT to_regclass('public.nodes') AS nodes_table,
             to_regclass('public.edges') AS edges_table,
             to_regclass('public.causes') AS causes_table;
    `);
    if (checkRows[0]?.nodes_table !== "nodes" || checkRows[0]?.edges_table !== "edges") {
      console.error("ABORT: Connected DB does not look like LIKED (missing nodes/edges/causes).");
      process.exit(3);
    }
    console.log("OK: Confirmed LIKED DB (nodes/edges/causes present).\n");

    // Execute the migration SQL
    console.log("Applying migration 091_fix_rls_recursion.sql...");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
      console.log("✓ Migration applied successfully!\n");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("✗ Migration failed, rolled back:", err.message);
      process.exit(1);
    }

    // Verify: check that the helper functions exist
    console.log("=== Verification ===");
    const { rows: fns } = await client.query(`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND proname IN ('folder_is_accessible', 'folder_is_owned', 'group_is_member', 'group_is_owned')
      ORDER BY proname;
    `);
    console.log("Helper functions created:");
    for (const f of fns) console.log(`  ✓ ${f.proname}`);

    if (fns.length !== 4) {
      console.error(`⚠ Expected 4 helper functions, found ${fns.length}`);
    }

    // Verify: check policies exist
    const { rows: policies } = await client.query(`
      SELECT polrelid::regclass AS table_name, polname
      FROM pg_policy
      WHERE polname IN ('folders_select_accessible', 'groups_select_member',
                        'folder_edges_select_scoped', 'folder_tree_select_scoped',
                        'folder_admins_select_scoped', 'group_nodes_select_scoped',
                        'group_members_select_scoped', 'group_admins_select_scoped',
                        'group_messages_select_scoped')
      ORDER BY table_name::text, polname;
    `);
    console.log("\nPolicies updated:");
    for (const p of policies) console.log(`  ✓ ${p.table_name}: ${p.polname}`);

    console.log("\n✓ Migration 091 applied and verified on remote DB.");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
