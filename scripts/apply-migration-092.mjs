// Apply migration 092_fix_rpc_authz.sql to the LIKED remote DB.
// Transactional: BEGIN ... COMMIT, ROLLBACK on any error.
// Guards: URL must contain lzkzfqshnjvlzosnntfx; DB must have nodes/edges/causes.
//
// Usage: node scripts/apply-migration-092.mjs

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL || !SUPABASE_URL.includes(LIKED_REF)) {
  console.error(`ABORT: URL does not match LIKED project (${LIKED_REF}). Got: ${SUPABASE_URL}`);
  process.exit(3);
}

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
  connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}

const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const { rows: check } = await client.query(
    "SELECT to_regclass('public.nodes') AS n, to_regclass('public.edges') AS e, to_regclass('public.causes') AS c;"
  );
  if (check[0]?.n !== "nodes" || check[0]?.e !== "edges") {
    console.error("ABORT: connected DB does not look like LIKED");
    process.exit(3);
  }
  console.log("OK: confirmed LIKED DB.\n");

  const migrationPath = join(root, "supabase", "migrations", "092_fix_rpc_authz.sql");
  const sql = readFileSync(migrationPath, "utf8");
  console.log(`Applying ${migrationPath} (${sql.length} chars)...`);

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration 092 applied successfully!\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("✗ Migration failed, rolled back:", err.message);
    process.exit(1);
  }

  // Verify: gates present in the latest definitions
  // - Gate functions (user-id param) must contain the raise guard
  // - Resource-only functions must contain an auth.uid() ownership check
  const { rows: gates } = await client.query(`
    SELECT p.proname,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('get_feed','get_social_timeline','get_friend_bar','get_user_folders',
                        'create_node_with_metadata','import_url','hard_delete_node','direct_share',
                        'group_share','share_folder','create_group','update_display_name',
                        'update_avatar_key','update_node_title','move_node_to_folder',
                        'set_node_deleted','delete_folder','add_node_to_folder','remove_node_from_folder',
                        'folder_is_accessible','group_is_member','is_folder_admin','is_group_admin')
      AND p.proargnames IS NOT NULL
    ORDER BY p.proname, p.oid;
  `);
  const RESOURCE_ONLY = new Set(["set_node_deleted", "delete_folder", "add_node_to_folder", "remove_node_from_folder"]);
  console.log("Gate verification:");
  let ok = true;
  const seen = new Set();
  for (const g of gates) {
    if (seen.has(g.proname)) continue; // only check first overload
    seen.add(g.proname);
    const isResource = RESOURCE_ONLY.has(g.proname);
    const hasGate = g.def.includes("Caller does not match user_id");
    const hasUidCheck = g.def.includes("auth.uid()");
    const pass = isResource ? hasUidCheck : hasGate;
    if (!pass) ok = false;
    console.log(`  ${pass ? "✓" : "✗"}  ${g.proname}  (${isResource ? "auth.uid() ownership check" : "auth.uid() gate"})`);
  }
  const { rows: cnt } = await client.query(`
    SELECT COUNT(DISTINCT p.proname) AS gated_count
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%Caller does not match user_id%';
  `);
  console.log(`\nTotal functions with the auth.uid() gate: ${cnt[0].gated_count}`);
  if (ok) console.log("✓ All sampled functions protected.");
  else { console.error("✗ Some functions not protected"); process.exit(1); }
} finally {
  client.release();
  await pool.end();
}
