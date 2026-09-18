// FEED-ORDER-001 — syntax/compile validation of supabase/migrations/101_feed_pipeline_order.sql
// Creates the exact function body from the migration under a temp name
// (pg_temp.feed_order_check) inside a transaction, executes it once against
// the real schema, then rolls back. Does NOT touch public.get_feed.
import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: not LIKED project"); process.exit(3);
}
const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const sql = readFileSync(join(root, "supabase/migrations/101_feed_pipeline_order.sql"), "utf8");
// Extract the CREATE FUNCTION statement (up to the first "$function$\n;")
const m = sql.match(/CREATE OR REPLACE FUNCTION public\.get_feed[\s\S]*?\$function\$\s*;/);
if (!m) { console.error("could not extract function from migration"); process.exit(2); }
const fnSql = m[0].replace("CREATE OR REPLACE FUNCTION public.get_feed", "CREATE FUNCTION pg_temp.feed_order_check");

try {
  await client.query("BEGIN");
  await client.query(fnSql);
  console.log("CREATE FUNCTION pg_temp.feed_order_check — OK (migration body compiles)");
  const { rows } = await client.query(
    `SELECT count(*) AS n FROM pg_temp.feed_order_check(
       (SELECT id FROM public.users LIMIT 1), 'en', 'all',
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'newest', NULL, NULL, 5, false, NULL)`);
  console.log(`executed against real schema — returned ${rows[0].n} rows (limit 5)`);
  await client.query("ROLLBACK");
  console.log("rolled back — live get_feed untouched");
} catch (e) {
  console.error("ERROR:", e.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 2;
} finally {
  client.release();
  await pool.end();
}
