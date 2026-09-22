// Apply a supabase/migrations/<NNN>_*.sql file to the live LIKED DB and
// record it in supabase_migrations.schema_migrations (version = numeric
// prefix, name = filename minus prefix/.sql, statements = [full SQL]) —
// the convention established by migrations 088–102.
// Idempotent ledger entry: ON CONFLICT (version) DO NOTHING.
// Usage: node scripts/apply-migration.mjs 103
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

const num = process.argv[2];
if (!num || !/^\d+$/.test(num)) {
  console.error("Usage: node scripts/apply-migration.mjs <NNN>");
  process.exit(2);
}

const dir = join(root, "supabase", "migrations");
const file = readdirSync(dir).find((f) => f.startsWith(`${num}_`) && f.endsWith(".sql"));
if (!file) {
  console.error(`No migration file matching ${num}_*.sql in supabase/migrations/`);
  process.exit(2);
}
const sql = readFileSync(join(dir, file), "utf8");
const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "");

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const { rows: check } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (check[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  console.log(`Applying ${file} ...`);
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
     VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
    [num, [sql], name]
  );
  await client.query("COMMIT");
  console.log(`Applied + recorded ${file} (version ${num}).`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`FAILED ${file}: ${e.message}`);
  process.exit(1);
} finally {
  await client.release();
  await pool.end();
}
