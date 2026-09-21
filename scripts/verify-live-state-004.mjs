// READ-ONLY verification of live LIKED DB state for EXEC-READY-001.
// Probes: get_feed params, §5.4 RPCs, create_folder/update_* overloads,
// USING(true) policies, write-RPC existence, invariants, migration record.
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

  await q("get_feed signature(s)", `
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_feed';`);

  await q("get_feed param count", `
    SELECT proname, pronargs, pronargdefaults
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_feed';`);

  await q("§5.4 access RPCs", `
    SELECT proname, pg_get_function_identity_arguments(oid) AS args, prosecdef
    FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('get_folder_access_users','get_group_access_users')
    ORDER BY proname;`);

  await q("create_folder overloads (P1-9)", `
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args,
           position('random()' IN lower(p.prosrc)) AS uses_random
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_folder' ORDER BY p.oid;`);

  await q("update_display_name / update_avatar_key overloads", `
    SELECT proname, p.oid, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('update_display_name','update_avatar_key')
    ORDER BY proname, p.oid;`);

  await q("write RPCs existence (AUDIT-06 residuals)", `
    SELECT proname, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('move_node_to_folder','create_folder_with_nodes',
        'get_or_create_unsorted_folder','get_or_create_named_folder',
        'set_custom_order','create_node_with_metadata','import_url','create_node')
    ORDER BY proname;`);

  await q("create_node_with_metadata params", `
    SELECT pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='create_node_with_metadata';`);

  await q("USING(true) SELECT/ALL policies on public tables", `
    SELECT c.relname AS table, pol.polname AS policy, pol.polcmd AS cmd,
           pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND pg_get_expr(pol.polqual, pol.polrelid)='true'
    ORDER BY c.relname, pol.polname;`);

  await q("RLS disabled tables (should be none)", `
    SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity ORDER BY relname;`);

  await q("INVARIANT: edges NULL cause_id", `
    SELECT COUNT(*) AS null_cause FROM edges WHERE cause_id IS NULL;`);

  await q("INVARIANT: UNIQUE(node_id,user_id) on edges", `
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid='public.edges'::regclass AND contype='u';`);

  await q("INVARIANT: non-deleted nodes missing owner edge", `
    SELECT COUNT(*) AS missing FROM nodes n
    WHERE n.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM edges e WHERE e.node_id=n.id AND e.user_id=n.owner_id);`);

  await q("INVARIANT: soft-deleted nodes keep causes/edges (sample)", `
    SELECT (SELECT COUNT(*) FROM nodes WHERE deleted_at IS NOT NULL) AS deleted_nodes,
           (SELECT COUNT(*) FROM edges e JOIN nodes n ON n.id=e.node_id
             WHERE n.deleted_at IS NOT NULL) AS edges_on_deleted,
           (SELECT COUNT(*) FROM causes c JOIN edges e ON e.cause_id=c.id
             JOIN nodes n ON n.id=e.node_id WHERE n.deleted_at IS NOT NULL) AS causes_on_deleted;`);

  await q("INSERT/UPDATE/DELETE policies on edges/causes for authenticated", `
    SELECT c.relname AS table, pol.polname AS policy, pol.polcmd AS cmd,
           pol.polroles::regrole[] AS roles
    FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('edges','causes')
    ORDER BY c.relname, pol.polname;`);

  await q("schema_migrations latest", `
    SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8;`);

  await q("user_node_preferences rows + RLS", `
    SELECT (SELECT COUNT(*) FROM user_node_preferences) AS rows,
           (SELECT relrowsecurity FROM pg_class WHERE relname='user_node_preferences') AS rls;`);

  await q("EXECUTE grants leaked to anon/PUBLIC on write RPCs", `
    SELECT p.proname, p.proacl::text[] AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proacl IS NOT NULL
      AND EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '%=X%' OR a::text LIKE 'anon%' OR a::text LIKE '%PUBLIC%')
    ORDER BY p.proname LIMIT 40;`);
} finally {
  client.release();
  await pool.end();
}
