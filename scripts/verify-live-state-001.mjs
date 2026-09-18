// READ-ONLY verification of live LIKED DB state for PLAN-CLASSIFY-001.
// Queries schema/functions/RLS/counts. Makes no changes.
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

  await q("TABLES (public)", `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;`);

  await q("NODES columns", `
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='nodes' ORDER BY ordinal_position;`);

  await q("EDGES constraints (unique check)", `
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.edges'::regclass AND contype IN ('u','p') ORDER BY conname;`);

  await q("EDGES cause_id nullability", `
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='edges' AND column_name IN ('cause_id','sender_id','direction','depth');`);

  await q("RPC FUNCTIONS (public, non-system)", `
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' ORDER BY p.proname;`);

  await q("get_feed signatures", `
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_feed','get_visible_nodes','search_nodes','get_nodes_in_folder','get_social_timeline','import_url','create_node_with_metadata','create_node','get_friend_bar','get_user_folders','get_folder_tree','get_visible_tags','unshare','direct_share','group_share','share_folder','set_node_deleted','rename_folder','create_folder','move_folder','delete_folder','add_node_to_folder','remove_node_from_folder','upsert_rating','get_node_friend_ratings','set_custom_order','update_display_name','update_avatar_key','create_tag_with_translation','get_trashed_nodes','hard_delete_node','get_unread_notification_count','get_trash_count','grant_folder_admin','grant_group_admin','revoke_folder_admin','revoke_group_admin','is_folder_admin','is_group_admin','create_group','upsert_card_position','get_folder_breadcrumb','get_folder_access_users','get_group_access_users','liked_tag_palette','folder_is_accessible','folder_is_owned','group_is_member','group_is_owned','move_folder');`);

  await q("RLS enabled tables", `
    SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY relname;`);

  await q("ROW COUNTS", `
    SELECT 'users' t, COUNT(*) c FROM users
    UNION ALL SELECT 'nodes', COUNT(*) FROM nodes
    UNION ALL SELECT 'edges', COUNT(*) FROM edges
    UNION ALL SELECT 'causes', COUNT(*) FROM causes
    UNION ALL SELECT 'folders', COUNT(*) FROM folders
    UNION ALL SELECT 'groups', COUNT(*) FROM groups
    UNION ALL SELECT 'tags', COUNT(*) FROM tags
    UNION ALL SELECT 'ratings', COUNT(*) FROM ratings
    UNION ALL SELECT 'friend_invites', COUNT(*) FROM friend_invites
    UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
    UNION ALL SELECT 'youtube_connections', COUNT(*) FROM youtube_connections
    UNION ALL SELECT 'node_notes', COUNT(*) FROM node_notes
    UNION ALL SELECT 'card_positions', COUNT(*) FROM card_positions
    UNION ALL SELECT 'youtube_import_suggestions', COUNT(*) FROM youtube_import_suggestions
    ORDER BY t;`);

  await q("youtube_connections columns", `
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='youtube_connections' ORDER BY ordinal_position;`);

  await q("schema_migrations recorded", `
    SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;`);

  await q("nodes missing owner edge (invariant)", `
    SELECT COUNT(*) AS missing FROM nodes n
    WHERE n.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM edges e WHERE e.node_id=n.id AND e.user_id=n.owner_id);`);

  await q("edges with NULL cause_id", `SELECT COUNT(*) AS bad FROM edges WHERE cause_id IS NULL;`);

  await q("chat tables present?", `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('direct_chats','messages','group_messages','node_messages','external_sources','external_items_map','blocks','translations','tag_translations','tag_edges','folder_edges','folder_tree','folder_admins','group_admins','group_nodes','group_members','user_node_preferences','nodes_sort_cache','activity_log','friend_invites');`);

  await q("Realtime publication", `
    SELECT c.relname FROM pg_publication p JOIN pg_publication_rel pr ON pr.prpubid=p.oid
    JOIN pg_class c ON c.oid=pr.prrelid WHERE p.pubname='supabase_realtime' ORDER BY c.relname;`);

  await q("Extensions", `SELECT extname FROM pg_extension ORDER BY extname;`);

  await q("Edge functions deployed?", `SELECT 'n/a - check via MCP list_edge_functions on wrong project' AS note;`);
} finally {
  client.release();
  await pool.end();
}
