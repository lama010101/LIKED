// READ-ONLY verification part 3: RLS policies on AUDIT-06 P1-7 flagged tables.
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("lzkzfqshnjvlzosnntfx")) { console.error("ABORT"); process.exit(3); }
const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
  connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  const { rows } = await client.query(`
    SELECT c.relname AS table, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           p.polroles::regrole[] AS roles
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname IN ('users','folder_edges','folder_tree','folder_admins','group_nodes','group_members','group_admins','groups','nodes','edges','causes','ratings','nodes_sort_cache','tags','tag_translations','tag_edges','translations','external_sources','external_items_map','direct_chats','messages','group_messages','node_messages','friend_invites','notifications','folders','blocks','activity_log','youtube_connections','node_notes','card_positions','user_node_preferences')
    ORDER BY c.relname, p.polname;`);
  for (const r of rows) {
    const permissive = r.using_expr === 'true' ? '  <<< USING(true)' : '';
    console.log(`${r.table} | ${r.polname} | cmd=${r.polcmd} | roles=${r.roles}${permissive}`);
  }
  console.log(`\nTotal policies listed: ${rows.length}`);
  const { rows: t } = await client.query(`SELECT c.relname, COUNT(*)::int AS n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_get_expr(p.polqual,p.polrelid)='true' GROUP BY c.relname ORDER BY c.relname;`);
  console.log("\nUSING(true) policies by table:", JSON.stringify(t));
} finally { client.release(); await pool.end(); }
