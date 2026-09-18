// Apply migration 101_feed_pipeline_order.sql to the LIKED remote DB.
// Transactional with rollback. Guarded to the LIKED ref.
// Usage: node scripts/apply-migration-101.mjs

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

  const sql = readFileSync(join(root, "supabase", "migrations", "101_feed_pipeline_order.sql"), "utf8");
  console.log(`Applying migration 101 (${sql.length} chars)...`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration 101 applied!\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ Failed, rolled back:", e.message);
    process.exit(1);
  }

  // Verify: live get_feed must now contain the spec pipeline stages
  // cursored → ordered → deduped → paginated, in that order.
  const { rows } = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_feed'
    LIMIT 1;
  `);
  const d = rows[0]?.d ?? "";
  const iCursor  = d.indexOf("cursored AS (");
  const iOrdered = d.indexOf("ordered AS (");
  const iDedup   = d.indexOf("deduped AS (");
  const iPage    = d.indexOf("paginated AS (");
  console.log("live get_feed stage offsets:");
  console.log(`  cursored=${iCursor}  ordered=${iOrdered}  deduped=${iDedup}  paginated=${iPage}`);
  const ok = iCursor > -1 && iOrdered > iCursor && iDedup > iOrdered && iPage > iDedup;
  if (!ok) {
    console.error("✗ Pipeline stage order not found in live get_feed");
    process.exit(1);
  }
  console.log("✓ Live get_feed has cursored → ordered → deduped → paginated order.");

  // Smoke-execute once (direct-pg: auth.role() is NULL so the caller gate passes).
  const { rows: smoke } = await client.query(
    `SELECT count(*) AS n FROM public.get_feed(
       (SELECT id FROM public.users LIMIT 1), 'en', 'all',
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'newest', NULL, NULL, 5, false, NULL)`);
  console.log(`✓ Live get_feed executed — returned ${smoke[0].n} rows (limit 5).`);
} finally {
  client.release();
  await pool.end();
}
