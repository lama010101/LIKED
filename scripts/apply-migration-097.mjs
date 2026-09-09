// Apply migration 097_youtube_oauth_tokens.sql to the LIKED remote DB.
// Transactional with rollback. Guarded to the LIKED ref.
// Usage: node scripts/apply-migration-097.mjs

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

  const sql = readFileSync(join(root, "supabase", "migrations", "097_youtube_oauth_tokens.sql"), "utf8");
  console.log(`Applying migration 097 (${sql.length} chars)...`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration 097 applied!\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("✗ Failed, rolled back:", e.message);
    process.exit(1);
  }

  // Verify: youtube_connections must now have exactly 12 columns
  const { rows } = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'youtube_connections'
    ORDER BY ordinal_position;
  `);
  console.log("youtube_connections columns after migration 097:");
  for (const r of rows) {
    console.log(`  ${r.column_name}  ${r.data_type}  nullable=${r.is_nullable}  default=${r.column_default ?? "(null)"}`);
  }
  if (rows.length !== 12) {
    console.error(`✗ Expected 12 columns, found ${rows.length}`);
    process.exit(1);
  }
  console.log("✓ Exactly 12 columns confirmed.");
} finally {
  client.release();
  await pool.end();
}
