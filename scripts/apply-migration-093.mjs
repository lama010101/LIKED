// Apply migration 093_revoke_authenticated_service_rpcs.sql to the LIKED
// remote DB. Transactional with rollback on error. Guarded to the LIKED ref.
// Usage: node scripts/apply-migration-093.mjs

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

  const sql = readFileSync(join(root, "supabase", "migrations", "093_revoke_authenticated_service_rpcs.sql"), "utf8");
  console.log(`Applying migration 093 (${sql.length} chars)...`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration 093 applied!\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ Failed, rolled back:", e.message);
    process.exit(1);
  }

  // Verify: authenticated role must NO LONGER have EXECUTE on these functions
  const { rows } = await client.query(`
    SELECT DISTINCT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.oid))) AS a
    WHERE n.nspname = 'public'
      AND a.grantee = 'authenticated'::regrole
      AND a.privilege_type = 'EXECUTE'
      AND p.proname IN ('create_node_with_metadata','import_url','hard_delete_node','direct_share',
                        'group_share','share_folder','group_unshare','create_group','delete_folder',
                        'add_node_to_folder','remove_node_from_folder','move_folder','set_custom_order',
                        'create_tag_with_translation','unshare_folder_op','upsert_rating',
                        'update_node_title','update_display_name','update_avatar_key')
    ORDER BY p.proname;
  `);
  if (rows.length === 0) {
    console.log("✓ All 19 target functions revoked from authenticated (0 still granted).");
  } else {
    console.error("✗ Still granted to authenticated:");
    for (const r of rows) console.error("   " + r.proname);
    process.exit(1);
  }
} finally {
  client.release();
  await pool.end();
}
