// EXEC-READY-001 / DB-7 — backfill supabase_migrations.schema_migrations.
// Every numbered migration file in supabase/migrations/ that is not yet
// recorded gets a row: (version = numeric prefix, name = filename minus
// prefix/.sql, statements = [full file SQL]) — matching the convention
// used for 088–102. Idempotent: ON CONFLICT (version) DO NOTHING.
// Usage: node scripts/record-migrations-backfill.mjs
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, readdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL is not the LIKED project");
  process.exit(3);
}

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  const { rows: chk } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (chk[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  const files = readdirSync(join(root, "supabase", "migrations"))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .map((f) => ({ file: f, version: f.match(/^(\d+)/)[1], name: f.replace(/\.sql$/, "").replace(/^\d+_/, "") }))
    .sort((a, b) => Number(a.version) - Number(b.version));

  const { rows: rec } = await client.query("SELECT version FROM supabase_migrations.schema_migrations");
  const recSet = new Set(rec.map((r) => r.version));
  const missing = files.filter((f) => !recSet.has(f.version));
  console.log(`files: ${files.length}, recorded: ${recSet.size}, missing: ${missing.length}`);
  if (missing.length === 0) { console.log("nothing to do"); process.exit(0); }

  let inserted = 0;
  await client.query("BEGIN");
  try {
    for (const m of missing) {
      const sql = readFileSync(join(root, "supabase", "migrations", m.file), "utf8");
      const r = await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
         VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
        [m.version, [sql], m.name]
      );
      inserted += r.rowCount;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  console.log(`inserted ${inserted} ledger rows`);

  const { rows: after } = await client.query(
    "SELECT COUNT(*)::int AS n FROM supabase_migrations.schema_migrations"
  );
  console.log(`schema_migrations total: ${after[0].n}`);
} finally {
  client.release();
  await pool.end();
}
