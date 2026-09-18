// FEED-ORDER-001-DEPLOY — post-deploy LIVE verification (read-only).
// Calls the live public.get_feed twice (page 1 + cursor page 2) for the
// user with the most nodes and asserts:
//   1. page 1 contains no duplicate node_ids        (dedup executed)
//   2. page 1 is ordered newest-first               (ordering executed)
//   3. page 2 shares zero node_ids with page 1      (cursor applied before
//      dedup/limit — the FEED-ORDER-001 pipeline order)
//   4. live functiondef contains the stage order
//      cursored → ordered → deduped → paginated
// No writes — SELECT only.
import { config } from "dotenv";
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
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

try {
  const { rows: chk } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (chk[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  // Structural check: live functiondef stage order
  const { rows: fd } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_feed' LIMIT 1`);
  const d = fd[0]?.d ?? "";
  const iC = d.indexOf("cursored AS ("), iO = d.indexOf("ordered AS ("),
        iD = d.indexOf("deduped AS ("), iP = d.indexOf("paginated AS (");
  console.log(`live def stage offsets: cursored=${iC} ordered=${iO} deduped=${iD} paginated=${iP}`);
  const structOk = iC > -1 && iO > iC && iD > iO && iP > iD;
  console.log(structOk ? "structure: cursor->ordering->dedup->limit present in live def"
                       : "structure: *** STAGE ORDER MISSING ***");

  // Behavioral check: real cursor pagination on the live function
  const { rows: u } = await client.query(
    `SELECT owner_id AS u, count(*) AS n FROM nodes
     WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
  const uid = u[0].u;
  console.log(`probe user: ${uid} (owns ${u[0].n} nodes)`);

  const feed = (ts, id, lim) => client.query(
    `SELECT node_id, created_at, total_count FROM public.get_feed(
       $1, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       'newest', $2, $3, $4, false, NULL)`,
    [uid, ts, id, lim]);

  const p1 = (await feed(null, null, 5)).rows;
  const last = p1[p1.length - 1];
  const p2 = last ? (await feed(last.created_at, last.node_id, 5)).rows : [];
  console.log(`page1: ${p1.length} rows, total_count=${p1[0]?.total_count ?? "-"}`);
  console.log(`page2: ${p2.length} rows, total_count=${p2[0]?.total_count ?? "-"}`);
  for (const r of [...p1, ...p2])
    console.log(`  ${r.node_id.slice(0, 8)}  ${r.created_at.toISOString()}`);

  const dupes = p1.length - new Set(p1.map(r => r.node_id)).size;
  const ordered = p1.every((r, i) => i === 0 || p1[i - 1].created_at >= r.created_at);
  const overlap = p2.filter(r2 => p1.some(r1 => r1.node_id === r2.node_id)).length;
  const cursorOk = p2.every(r => r.created_at <= last.created_at);
  console.log(`page1 duplicate node_ids: ${dupes} (expect 0)`);
  console.log(`page1 newest-first order: ${ordered} (expect true)`);
  console.log(`page1∩page2 overlap:      ${overlap} (expect 0)`);
  console.log(`page2 all <= cursor ts:   ${cursorOk} (expect true)`);

  const pass = structOk && dupes === 0 && ordered && overlap === 0 && cursorOk;
  console.log(`\nLIVE CHECK: ${pass ? "PASS — get_feed executes cursor->ordering->dedup->limit live" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 2;
} finally {
  client.release();
  await pool.end();
}
