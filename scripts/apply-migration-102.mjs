// Apply migration 102_drop_dead_update_overloads.sql to the LIKED remote DB.
// Transactional with rollback. Guarded to the LIKED ref.
// Usage: node scripts/apply-migration-102.mjs

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

  const sql = readFileSync(join(root, "supabase", "migrations", "102_drop_dead_update_overloads.sql"), "utf8");
  console.log(`Applying migration 102 (${sql.length} chars)...`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration 102 applied!\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ Failed, rolled back:", e.message);
    process.exit(1);
  }

  // Verify: exactly one overload remains for each function.
  const { rows } = await client.query(`
    SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('update_display_name', 'update_avatar_key')
    ORDER BY proname, args;
  `);
  console.log("remaining overloads:");
  for (const r of rows) console.log(`  ${r.proname}(${r.args})`);
  const ok =
    rows.length === 2 &&
    rows.every((r) => r.args === "p_user_id uuid, p_display_name text" || r.args === "p_user_id uuid, p_avatar_key text");
  if (!ok) {
    console.error("✗ Unexpected overloads remain");
    process.exit(1);
  }
  console.log("✓ Only the 2-param atomic overloads remain.");
} finally {
  client.release();
  await pool.end();
}
