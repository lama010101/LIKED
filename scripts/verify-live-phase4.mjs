// READ-ONLY verification of live LIKED DB state for PHASE4-EXEC-TRIAGE-001.
// Probes: N7 RPC existence, N8 policy + ownership-column layout, N9 RPC defs.
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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

  await q("N7 target RPCs (existence)", `
    SELECT proname, oidvectortypes(proargtypes) AS args, prosecdef
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND proname IN
      ('get_folder_tree','get_user_folders','get_unread_notification_count',
       'get_trash_count','get_folder_access_users','get_group_access_users')
    ORDER BY proname`);

  await q("N9 folder RPCs current defs", `
    SELECT proname, oidvectortypes(proargtypes) AS args,
           left(pg_get_functiondef(p.oid), 800) AS def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND proname IN
      ('add_node_to_folder','remove_node_from_folder')
    ORDER BY proname`);

  await q("N8 policies on the 8 reference tables", `
    SELECT tablename, policyname, roles::text, cmd, qual
    FROM pg_policies
    WHERE schemaname='public' AND tablename IN
      ('ratings','nodes_sort_cache','tags','tag_translations','tag_edges',
       'translations','external_sources','external_items_map')
    ORDER BY tablename, policyname`);

  await q("N8 table columns (ownership design)", `
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN
      ('ratings','nodes_sort_cache','tags','tag_translations','tag_edges',
       'translations','external_sources','external_items_map')
    ORDER BY table_name, ordinal_position`);

  await q("N8 row counts", `
    SELECT 'ratings' t, count(*) FROM ratings UNION ALL
    SELECT 'nodes_sort_cache', count(*) FROM nodes_sort_cache UNION ALL
    SELECT 'tags', count(*) FROM tags UNION ALL
    SELECT 'tag_translations', count(*) FROM tag_translations UNION ALL
    SELECT 'tag_edges', count(*) FROM tag_edges UNION ALL
    SELECT 'translations', count(*) FROM translations UNION ALL
    SELECT 'external_sources', count(*) FROM external_sources UNION ALL
    SELECT 'external_items_map', count(*) FROM external_items_map`);

  await q("nodes/folders owner columns (for edge-visible policy design)", `
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('nodes','edges','folders','folder_edges')
      AND column_name IN ('owner_id','user_id','node_id','folder_id','sender_id')
    ORDER BY table_name, column_name`);
} finally {
  await client.release();
  await pool.end();
}
