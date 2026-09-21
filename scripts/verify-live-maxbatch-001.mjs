// READ-ONLY verification for MAXBATCH-001.
// Checks: full schema_migrations vs migration files on disk, §5.4 RPC existence,
// get_feed def stage-order markers, youtube-intelligent-import tables.
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync } from "fs";

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
if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
  connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
const q = async (label, sql) => {
  try {
    const { rows } = await client.query(sql);
    console.log(`\n=== ${label} ===`);
    for (const r of rows) console.log(" ", JSON.stringify(r));
    return rows;
  } catch (e) {
    console.log(`\n=== ${label} === ERROR: ${e.message}`);
    return [];
  }
};
try {
  const { rows: check } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (check[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  const rec = await q("schema_migrations ALL recorded", `
    SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC;`);

  const files = readdirSync(join(root, "supabase", "migrations"))
    .filter(f => f.endsWith(".sql"))
    .map(f => f.match(/^(\d+)/)?.[1])
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
  const recSet = new Set(rec.map(r => r.version));
  const fileSet = new Set(files);
  console.log("\n=== files on disk (numeric) ===");
  console.log(" ", files.join(","));
  console.log("\n=== files NOT recorded in schema_migrations ===");
  console.log(" ", files.filter(f => !recSet.has(f)).join(",") || "(none)");
  console.log("\n=== recorded but no file ===");
  console.log(" ", rec.map(r => r.version).filter(v => !fileSet.has(v)).join(",") || "(none)");

  await q("§5.4 access RPCs by name", `
    SELECT proname, pg_get_function_arguments(oid) AS args
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND (proname ILIKE '%access%user%' OR proname ILIKE '%access%')
    ORDER BY proname;`);

  await q("folder/group RPCs (all)", `
    SELECT proname, pg_get_function_arguments(oid) AS args
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND (proname ILIKE '%folder%' OR proname ILIKE '%group%')
    ORDER BY proname;`);

  await q("get_feed def stage markers (101 deployed?)", `
    SELECT proname, oid,
      position('cursor' IN lower(prosrc)) AS pos_cursor_kw,
      position('order by' IN lower(prosrc)) AS pos_orderby,
      position('distinct' IN lower(prosrc)) AS pos_distinct,
      position('limit' IN lower(prosrc)) AS pos_limit,
      length(prosrc) AS len
    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='get_feed';`);

  await q("youtube import tables", `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%youtube%' OR table_name ILIKE '%import%');`);

  await q("row counts (key tables)", `
    SELECT 'nodes' t, count(*) FROM nodes WHERE deleted_at IS NULL
    UNION ALL SELECT 'edges', count(*) FROM edges
    UNION ALL SELECT 'causes', count(*) FROM causes
    UNION ALL SELECT 'users', count(*) FROM users
    UNION ALL SELECT 'folders', count(*) FROM folders
    UNION ALL SELECT 'friend_invites', count(*) FROM friend_invites
    UNION ALL SELECT 'youtube_connections', count(*) FROM youtube_connections
    ORDER BY t;`);
} finally {
  await client.release();
  await pool.end();
}
