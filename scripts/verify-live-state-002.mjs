// READ-ONLY verification part 2 for PLAN-CLASSIFY-001.
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("lzkzfqshnjvlzosnntfx")) { console.error("ABORT: not LIKED"); process.exit(3); }
const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
  connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
const q = async (label, sql) => {
  try { const { rows } = await client.query(sql); console.log(`\n=== ${label} ===`); for (const r of rows) console.log(" ", JSON.stringify(r)); }
  catch (e) { console.log(`\n=== ${label} === ERROR: ${e.message}`); }
};
try {
  await q("ROW COUNTS", `
    SELECT 'users' t, COUNT(*)::int c FROM users
    UNION ALL SELECT 'nodes', COUNT(*)::int FROM nodes
    UNION ALL SELECT 'edges', COUNT(*)::int FROM edges
    UNION ALL SELECT 'causes', COUNT(*)::int FROM causes
    UNION ALL SELECT 'folders', COUNT(*)::int FROM folders
    UNION ALL SELECT 'groups', COUNT(*)::int FROM groups
    UNION ALL SELECT 'group_members', COUNT(*)::int FROM group_members
    UNION ALL SELECT 'tags', COUNT(*)::int FROM tags
    UNION ALL SELECT 'tag_edges', COUNT(*)::int FROM tag_edges
    UNION ALL SELECT 'ratings', COUNT(*)::int FROM ratings
    UNION ALL SELECT 'friend_invites', COUNT(*)::int FROM friend_invites
    UNION ALL SELECT 'notifications', COUNT(*)::int FROM notifications
    UNION ALL SELECT 'youtube_connections', COUNT(*)::int FROM youtube_connections
    UNION ALL SELECT 'node_notes', COUNT(*)::int FROM node_notes
    UNION ALL SELECT 'card_positions', COUNT(*)::int FROM card_positions
    UNION ALL SELECT 'blocks', COUNT(*)::int FROM blocks
    UNION ALL SELECT 'translations', COUNT(*)::int FROM translations
    UNION ALL SELECT 'folder_edges', COUNT(*)::int FROM folder_edges
    UNION ALL SELECT 'folder_tree', COUNT(*)::int FROM folder_tree
    UNION ALL SELECT 'messages', COUNT(*)::int FROM messages
    UNION ALL SELECT 'activity_log', COUNT(*)::int FROM activity_log ORDER BY t;`);
  await q("nodes.node_type constraint check", `
    SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid='public.nodes'::regclass ORDER BY conname;`);
  await q("node_type distribution", `SELECT node_type, COUNT(*)::int FROM nodes GROUP BY node_type ORDER BY 2 DESC;`);
  await q("node_type backfill state", `SELECT COUNT(*)::int AS null_type FROM nodes WHERE node_type IS NULL;`);
  await q("schema_migrations tail", `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8;`);
  await q("nodes triggers", `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='public.nodes'::regclass;`);
  await q("EXECUTE ACL on key RPCs", `
    SELECT p.proname, p.proacl IS NULL AS default_acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_feed','get_social_timeline','direct_share','import_url','unshare','upsert_rating','set_node_deleted','get_friend_bar','get_user_folders','get_visible_tags') ORDER BY p.proname;`);
  await q("youtube_connections RLS policies", `
    SELECT polname, polcmd, polroles::regrole[] FROM pg_policy WHERE polrelid='public.youtube_connections'::regclass;`);
  await q("friend context: get_visible_nodes overloads still live", `
    SELECT oid, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='get_visible_nodes';`);
  await q("causes.cause_type check constraint", `
    SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='public.causes'::regclass AND conname LIKE '%cause%';`);
} finally { client.release(); await pool.end(); }
