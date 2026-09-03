// Apply migration 094_fix_anon_bypass_and_revoke.sql to the LIKED remote DB.
// Transactional with rollback. Guarded to the LIKED ref.
// Usage: node scripts/apply-migration-094.mjs

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: not the LIKED project");
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
  const { rows: check } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (check[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  const sql = readFileSync(join(root, "supabase", "migrations", "094_fix_anon_bypass_and_revoke.sql"), "utf8");
  console.log(`Applying migration 094 (${sql.length} chars)...`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration 094 applied!\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ Failed, rolled back:", e.message);
    process.exit(1);
  }

  // Verify ACLs
  const { rows } = await client.query(`
    SELECT p.proname, p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_feed','get_social_timeline','get_friend_bar','get_user_folders',
                        'get_folder_tree','folder_is_accessible','create_node_with_metadata',
                        'import_url','hard_delete_node','direct_share','delete_folder',
                        'update_display_name','upsert_rating','set_node_deleted','move_node_to_folder')
    ORDER BY p.proname;
  `);
  console.log("ACL verification (reads: authenticated+service_role only; writes: service_role only):");
  for (const r of rows) {
    const acl = r.acl;
    const hasAnon = acl.includes("anon=");
    const hasPublic = /\{=X/.test(acl);
    const hasAuth = acl.includes("authenticated=");
    const hasService = acl.includes("service_role=");
    const note = hasAnon || hasPublic ? "⚠ anon/PUBLIC STILL PRESENT" : "✓ no anon/PUBLIC";
    console.log(`  ${note}  ${r.proname}  [auth:${hasAuth} svc:${hasService}]`);
  }
} finally {
  client.release();
  await pool.end();
}
