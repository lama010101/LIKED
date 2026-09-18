// FEED-ORDER-001 — before/after comparison of get_feed pipeline order.
// Runs INSIDE ONE TRANSACTION on the live DB: temp tables shadow the real
// tables (pg_temp resolves first), two session-scoped function replicas are
// created — `feed_before` (current order: dedup → cursor+ordering → limit)
// and `feed_after` (spec order: cursor → ordering → dedup → limit) — sharing
// the identical visible_nodes…with_tags prefix. Synthetic seed data only.
// ROLLBACK at the end: nothing persists. Auth gates + SET search_path are
// omitted from both replicas (auth.role() is NULL over pg protocol; the
// search_path pin is required for temp-table shadowing) — neither affects
// the pipeline ordering under test.

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
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// ── Shared pipeline prefix: identical in both replicas ──────────────
const PREFIX = `
  visible_nodes AS (
    SELECT DISTINCT ON (n.id)
      n.id AS node_id, n.url, n.text_content, n.title AS raw_title,
      n.thumbnail_key, n.owner_id, n.language_code AS node_language_code,
      n.origin_user_id, n.origin_created_at, n.created_at,
      CASE WHEN n.owner_id = p_user_id THEN 'own'
           WHEN e.direction = 'sent' THEN 'sent' ELSE 'received' END AS direction,
      e.sender_id
    FROM nodes n
    LEFT JOIN edges e ON e.node_id = n.id AND e.user_id = p_user_id
    WHERE n.deleted_at IS NULL
      AND (n.owner_id = p_user_id OR e.id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM blocks b
        WHERE (b.blocker_id = p_user_id AND b.blocked_id = n.owner_id)
           OR (b.blocker_id = n.owner_id AND b.blocked_id = p_user_id))
  ),
  context_filtered AS (
    SELECT vn.* FROM visible_nodes vn WHERE
      (p_friend_id IS NULL OR EXISTS (SELECT 1 FROM edges e2
        WHERE e2.node_id = vn.node_id AND ((e2.user_id = p_friend_id AND e2.sender_id = p_user_id)
          OR (e2.user_id = p_user_id AND e2.sender_id = p_friend_id))))
      AND (p_folder_id IS NULL OR EXISTS (SELECT 1 FROM folder_edges fe
        WHERE fe.node_id = vn.node_id AND fe.folder_id = p_folder_id))
      AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM group_nodes gn
        WHERE gn.node_id = vn.node_id AND gn.group_id = p_group_id))
      AND (p_exclude_foldered IS FALSE OR NOT EXISTS (
        SELECT 1 FROM folder_edges fe_excl WHERE fe_excl.node_id = vn.node_id))
  ),
  view_filtered AS (
    SELECT cf.* FROM context_filtered cf WHERE
      p_view = 'all'
      OR (p_view = 'mine' AND cf.node_id IN (SELECT id FROM nodes WHERE nodes.origin_user_id = p_user_id))
      OR (p_view = 'received' AND cf.direction = 'received')
  ),
  multi_filtered AS (
    SELECT vf.* FROM view_filtered vf WHERE
      (p_filter_tag_ids IS NULL OR (SELECT COUNT(DISTINCT te.tag_id) FROM tag_edges te
        WHERE te.node_id = vf.node_id AND te.tag_id = ANY(p_filter_tag_ids)) = array_length(p_filter_tag_ids,1))
      AND (p_filter_friend_ids IS NULL OR (SELECT COUNT(DISTINCT shared_friend)
        FROM (SELECT UNNEST(p_filter_friend_ids) AS shared_friend) rf
        WHERE EXISTS (SELECT 1 FROM edges ef WHERE ef.node_id = vf.node_id
          AND (ef.user_id = shared_friend OR ef.sender_id = shared_friend))) = array_length(p_filter_friend_ids,1))
      AND (p_filter_folder_ids IS NULL OR (SELECT COUNT(DISTINCT fe2.folder_id)
        FROM folder_edges fe2 WHERE fe2.node_id = vf.node_id
          AND fe2.folder_id = ANY(p_filter_folder_ids)) = array_length(p_filter_folder_ids,1))
  ),
  search_filtered AS (
    SELECT mf.* FROM multi_filtered mf WHERE
      p_search_query IS NULL
      OR EXISTS (SELECT 1 FROM translations t WHERE t.node_id = mf.node_id
        AND t.language_code = p_language_code
        AND (t.title ILIKE '%'||p_search_query||'%' OR t.description ILIKE '%'||p_search_query||'%'))
      OR mf.raw_title ILIKE '%'||p_search_query||'%'
      OR EXISTS (SELECT 1 FROM tag_edges te2 JOIN tag_translations tt ON tt.tag_id = te2.tag_id
        WHERE te2.node_id = mf.node_id AND tt.language_code = p_language_code
          AND tt.label ILIKE '%'||p_search_query||'%')
  ),
  with_resolved_title AS (
    SELECT sf.*, COALESCE(
      (SELECT t1.title FROM translations t1 WHERE t1.node_id = sf.node_id AND t1.language_code = p_language_code LIMIT 1),
      (SELECT t2.title FROM translations t2 WHERE t2.node_id = sf.node_id AND t2.language_code = sf.node_language_code LIMIT 1),
      sf.raw_title) AS resolved_title
    FROM search_filtered sf
  ),
  with_meta AS (
    SELECT wrt.*, nsc.avg_rating, nsc.view_count, nsc.share_count,
      u.display_name AS sender_name, u.avatar_key AS sender_avatar_key
    FROM with_resolved_title wrt
    LEFT JOIN nodes_sort_cache nsc ON nsc.node_id = wrt.node_id
    LEFT JOIN users u ON u.id = wrt.sender_id
  ),
  with_tags AS (
    SELECT wm.*, (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'tag_id', t.id, 'color_hex', t.color_hex, 'label', COALESCE(
          (SELECT tt1.label FROM tag_translations tt1 WHERE tt1.tag_id = t.id AND tt1.language_code = p_language_code LIMIT 1),
          (SELECT tt2.label FROM tag_translations tt2 WHERE tt2.tag_id = t.id AND tt2.language_code = 'en' LIMIT 1),
          LEFT(t.id::TEXT, 8))) ORDER BY te.created_at ASC), '[]'::jsonb)
      FROM tag_edges te JOIN tags t ON t.id = te.tag_id WHERE te.node_id = wm.node_id) AS tags
    FROM with_meta wm
  )`;

const TAIL_BEFORE = `
  deduped AS (
    SELECT DISTINCT ON (with_tags.node_id) * FROM with_tags
    ORDER BY with_tags.node_id, CASE with_tags.direction WHEN 'received' THEN 1 WHEN 'sent' THEN 2 WHEN 'own' THEN 3 END
  ),
  paginated AS (
    SELECT d.*, COUNT(*) OVER() AS total_count FROM deduped d
    WHERE p_cursor_created_at IS NULL OR (CASE p_sort
      WHEN 'newest' THEN d.created_at < p_cursor_created_at OR (d.created_at = p_cursor_created_at AND d.node_id < p_cursor_node_id)
      WHEN 'oldest' THEN d.created_at > p_cursor_created_at OR (d.created_at = p_cursor_created_at AND d.node_id > p_cursor_node_id)
      WHEN 'most_shared' THEN d.share_count < (SELECT c.share_count FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id)
        OR (d.share_count = (SELECT c.share_count FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id) AND d.node_id < p_cursor_node_id)
      WHEN 'highest_rated' THEN COALESCE(d.avg_rating,-1) < COALESCE((SELECT c.avg_rating FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id),-1)
        OR (COALESCE(d.avg_rating,-1) = COALESCE((SELECT c.avg_rating FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id),-1) AND d.node_id < p_cursor_node_id)
      WHEN 'custom' THEN TRUE ELSE TRUE END)
    ORDER BY
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN array_position(p_custom_order_ids, d.node_id) END ASC NULLS LAST,
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN (array_position(p_custom_order_ids, d.node_id) IS NULL) END ASC,
      CASE p_sort WHEN 'newest' THEN d.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN d.created_at END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN d.share_count END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN d.avg_rating END DESC NULLS LAST,
      CASE p_sort WHEN 'newest' THEN d.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN d.node_id END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN d.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN d.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN d.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN d.node_id END DESC NULLS LAST
    LIMIT p_limit
  )`;

const TAIL_AFTER = `
  cursored AS (
    SELECT wt.* FROM with_tags wt
    WHERE p_cursor_created_at IS NULL OR (CASE p_sort
      WHEN 'newest' THEN wt.created_at < p_cursor_created_at OR (wt.created_at = p_cursor_created_at AND wt.node_id < p_cursor_node_id)
      WHEN 'oldest' THEN wt.created_at > p_cursor_created_at OR (wt.created_at = p_cursor_created_at AND wt.node_id > p_cursor_node_id)
      WHEN 'most_shared' THEN wt.share_count < (SELECT c.share_count FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id)
        OR (wt.share_count = (SELECT c.share_count FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id) AND wt.node_id < p_cursor_node_id)
      WHEN 'highest_rated' THEN COALESCE(wt.avg_rating,-1) < COALESCE((SELECT c.avg_rating FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id),-1)
        OR (COALESCE(wt.avg_rating,-1) = COALESCE((SELECT c.avg_rating FROM nodes_sort_cache c WHERE c.node_id = p_cursor_node_id),-1) AND wt.node_id < p_cursor_node_id)
      WHEN 'custom' THEN TRUE ELSE TRUE END)
  ),
  ordered AS (
    SELECT * FROM cursored ORDER BY
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN array_position(p_custom_order_ids, cursored.node_id) END ASC NULLS LAST,
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN (array_position(p_custom_order_ids, cursored.node_id) IS NULL) END ASC,
      CASE p_sort WHEN 'newest' THEN cursored.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN cursored.created_at END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN cursored.share_count END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN cursored.avg_rating END DESC NULLS LAST,
      CASE p_sort WHEN 'newest' THEN cursored.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN cursored.node_id END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN cursored.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN cursored.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN cursored.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN cursored.node_id END DESC NULLS LAST
  ),
  deduped AS (
    SELECT DISTINCT ON (o.node_id) * FROM ordered o
    ORDER BY o.node_id,
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN array_position(p_custom_order_ids, o.node_id) END ASC NULLS LAST,
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN (array_position(p_custom_order_ids, o.node_id) IS NULL) END ASC,
      CASE p_sort WHEN 'newest' THEN o.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN o.created_at END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN o.share_count END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN o.avg_rating END DESC NULLS LAST,
      CASE p_sort WHEN 'newest' THEN o.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN o.node_id END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN o.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN o.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN o.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN o.node_id END DESC NULLS LAST,
      CASE o.direction WHEN 'received' THEN 1 WHEN 'sent' THEN 2 WHEN 'own' THEN 3 END
  ),
  paginated AS (
    SELECT d.*, COUNT(*) OVER() AS total_count FROM deduped d
    ORDER BY
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN array_position(p_custom_order_ids, d.node_id) END ASC NULLS LAST,
      CASE WHEN p_sort='custom' AND p_custom_order_ids IS NOT NULL THEN (array_position(p_custom_order_ids, d.node_id) IS NULL) END ASC,
      CASE p_sort WHEN 'newest' THEN d.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN d.created_at END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN d.share_count END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN d.avg_rating END DESC NULLS LAST,
      CASE p_sort WHEN 'newest' THEN d.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'oldest' THEN d.node_id END ASC NULLS LAST,
      CASE p_sort WHEN 'most_shared' THEN d.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'highest_rated' THEN d.node_id END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN d.created_at END DESC NULLS LAST,
      CASE p_sort WHEN 'custom' THEN d.node_id END DESC NULLS LAST
    LIMIT p_limit
  )`;

const OUT_COLS = `p.node_id, p.url, p.text_content, p.resolved_title AS title, p.thumbnail_key, p.owner_id,
  p.node_language_code AS language_code, p.origin_user_id, p.origin_created_at, p.created_at,
  p.avg_rating, p.view_count, p.share_count, p.direction, p.sender_id, p.sender_name, p.sender_avatar_key, p.tags, p.total_count`;

const mkFn = (name, tail) => `
CREATE FUNCTION ${name}(
  p_user_id uuid, p_language_code text DEFAULT 'en', p_view text DEFAULT 'all',
  p_friend_id uuid DEFAULT NULL, p_folder_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL,
  p_filter_tag_ids uuid[] DEFAULT NULL, p_filter_friend_ids uuid[] DEFAULT NULL, p_filter_folder_ids uuid[] DEFAULT NULL,
  p_search_query text DEFAULT NULL, p_sort text DEFAULT 'newest',
  p_cursor_created_at timestamptz DEFAULT NULL, p_cursor_node_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20, p_exclude_foldered boolean DEFAULT false, p_custom_order_ids uuid[] DEFAULT NULL
) RETURNS TABLE(node_id uuid, url text, text_content text, title text, thumbnail_key text,
  owner_id uuid, language_code text, origin_user_id uuid, origin_created_at timestamptz,
  created_at timestamptz, avg_rating numeric, view_count integer, share_count integer,
  direction text, sender_id uuid, sender_name text, sender_avatar_key text, tags jsonb, total_count bigint)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY WITH ${PREFIX} , ${tail}
  SELECT ${OUT_COLS} FROM paginated p;
END; $$;`;

// ── Seed ──────────────────────────────────────────────────────────
const U  = "11111111-1111-1111-1111-111111111101";
const A  = "11111111-1111-1111-1111-111111111102";
const B  = "11111111-1111-1111-1111-111111111103";
const C  = "11111111-1111-1111-1111-111111111104";
const F1 = "22222222-2222-2222-2222-222222222201";
const F2 = "22222222-2222-2222-2222-222222222202";
const nid = (i) => `33333333-3333-3333-3333-3333333333${String(i).padStart(2, "0")}`;
const eid = (i) => `44444444-4444-4444-4444-4444444444${String(i).padStart(2, "0")}`;
const cid = (i) => `55555555-5555-5555-5555-5555555555${String(i).padStart(2, "0")}`;

// node rows: [i, owner, created_at, deleted]
const nodes = [
  [1, U, "2026-09-15", 0], [2, U, "2026-09-14", 0], [3, U, "2026-09-13", 0],
  [4, U, "2026-09-12", 0], [5, U, "2026-09-11", 0],
  [6, A, "2026-09-10", 0], [7, A, "2026-09-09", 0], [8, A, "2026-09-08", 0],
  [9, A, "2026-09-07", 0], [10, A, "2026-09-06", 0],
  // multi-edge nodes (two received edges from different senders — "dedup-heavy")
  [11, A, "2026-09-16", 0], [12, B, "2026-09-17", 0],
  [13, A, "2026-09-18", 0],            // no edge to U — invisible control
  [14, U, "2026-09-19", 1],            // deleted — invisible control
  [15, A, "2026-09-05", 0],            // folder F1
  [16, U, "2026-09-04", 0],            // own, folder F1
  [17, A, "2026-09-03", 0],            // folder F2
  [18, C, "2026-09-20", 0],            // blocked owner — invisible control
];
// edges to viewer U: [i, node_i, user, direction, sender]
const edges = [
  [1, 6, U, "received", A], [2, 7, U, "received", A], [3, 8, U, "received", A],
  [4, 9, U, "received", A], [5, 10, U, "received", A],
  [6, 11, U, "received", A], [7, 11, U, "received", B],  // node 11: 2 edges
  [8, 12, U, "received", A], [9, 12, U, "received", B],  // node 12: 2 edges
  [10, 15, U, "received", A], [11, 17, U, "received", A],
  [12, 18, U, "received", C],
  [13, 6, A, "sent", A], [14, 11, A, "sent", A],         // sender-side edges
];
const folderEdges = [[15, F1], [16, F1], [17, F2]];
const sortCache = [  // [node_i, avg_rating, view_count, share_count]
  [6, 4.5, 10, 3], [7, 2.0, 5, 1], [8, null, 0, 9], [9, 3.5, 7, 5],
  [11, 5.0, 20, 8], [12, 1.5, 3, 2], [15, 4.0, 12, 4],
];
const blocks = [[U, C]];

async function seed() {
  const tables = ["nodes","edges","blocks","folder_edges","group_nodes","tag_edges","tags","tag_translations","translations","nodes_sort_cache","users","causes"];
  for (const t of tables)
    await client.query(`CREATE TEMP TABLE ${t} AS SELECT * FROM public.${t} LIMIT 0;`);

  await client.query(
    `INSERT INTO users (id, display_name, avatar_key) VALUES
     ($1,'Viewer',NULL),($2,'Alice',NULL),($3,'Bob',NULL),($4,'Carol',NULL)`,
    [U, A, B, C]);

  for (const [i, owner, day, del] of nodes)
    await client.query(
      `INSERT INTO nodes (id, url, text_content, title, thumbnail_key, owner_id,
         language_code, origin_user_id, origin_created_at, created_at, deleted_at)
       VALUES ($1::uuid, 'https://x/'||$1::text, NULL, 'node '||$1::text, NULL, $2::uuid, 'en', $2::uuid,
         $3::date, $3::date, CASE WHEN $4=1 THEN now() ELSE NULL END)`,
      [nid(i), owner, day, del]);

  for (const [i, ni, user, dir, sender] of edges)
    await client.query(
      `INSERT INTO edges (id, node_id, user_id, cause_id, sender_id, direction, depth, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,now())`,
      [eid(i), nid(ni), user, cid(i), sender, dir]);

  for (const [ni, fid] of folderEdges)
    await client.query(
      `INSERT INTO folder_edges (id, folder_id, node_id, created_at) VALUES (gen_random_uuid(),$1,$2,now())`,
      [fid, nid(ni)]);

  for (const [ni, r, v, s] of sortCache)
    await client.query(
      `INSERT INTO nodes_sort_cache (node_id, avg_rating, view_count, share_count)
       VALUES ($1,$2,$3,$4)`,
      [nid(ni), r, v, s]);

  for (const [blk, blkd] of blocks)
    await client.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)`, [blk, blkd]);
}

async function run(fn, label, params) {
  const { rows } = await client.query(
    `SELECT node_id, direction, sender_id, created_at, total_count FROM ${fn}(
       p_user_id := $1, p_view := $2, p_sort := $3, p_limit := $4,
       p_exclude_foldered := $5, p_folder_id := $6,
       p_cursor_created_at := $7, p_cursor_node_id := $8)`,
    params);
  console.log(`\n--- ${label} (${rows.length} rows) ---`);
  for (const r of rows)
    console.log(`  ${r.node_id.slice(-4)} ${r.direction.padEnd(8)} total=${r.total_count} created=${r.created_at.toISOString().slice(0,10)} sender=${r.sender_id ? r.sender_id.slice(-4) : "-"}`);
  return rows;
}

const cmp = (a, b, keys) => JSON.stringify(a.map(r => keys.map(k => r[k]))) === JSON.stringify(b.map(r => keys.map(k => r[k])));
let pass = true;
const verdict = (ok, label) => { console.log(`  => ${ok ? "IDENTICAL" : "*** DIFFERS ***"} ${label}`); if (!ok) pass = false; };

try {
  await client.query("BEGIN");
  const { rows: chk } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (chk[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  await seed();
  const { rows: [dup] } = await client.query(
    `SELECT count(*) FILTER (WHERE c>1) AS multi FROM (SELECT node_id, count(*) c FROM edges WHERE user_id=$1 GROUP BY 1) s`, [U]);
  console.log(`seeded: ${nodes.length} nodes, ${edges.length} edges (${dup.multi} nodes with >1 edge to viewer)`);

  await client.query(mkFn("feed_before", TAIL_BEFORE));
  await client.query(mkFn("feed_after", TAIL_AFTER));

  // ── Scenario 1: page 1, newest, limit 6 ──
  const s1b = await run("feed_before", "S1 PAGE-1 BEFORE", [U,"all","newest",6,false,null,null,null]);
  const s1a = await run("feed_after",  "S1 PAGE-1 AFTER",  [U,"all","newest",6,false,null,null,null]);
  verdict(cmp(s1b, s1a, ["node_id","direction","created_at","total_count"]), "node set + order + total_count");

  // ── Scenario 2: page 2 after dedup-heavy page 1 (multi-edge nodes on p1) ──
  const last = s1b[s1b.length - 1];
  const s2b = await run("feed_before", "S2 PAGE-2 BEFORE", [U,"all","newest",6,false,null,last.created_at,last.node_id]);
  const s2a = await run("feed_after",  "S2 PAGE-2 AFTER",  [U,"all","newest",6,false,null,last.created_at,last.node_id]);
  verdict(cmp(s2b, s2a, ["node_id","direction","created_at","total_count"]), "page-2 set + order");
  const overlap = s2a.filter(r2 => s1a.some(r1 => r1.node_id === r2.node_id)).length;
  console.log(`  => page1∩page2 overlap = ${overlap} (expect 0)`); if (overlap !== 0) pass = false;

  // ── Scenario 3a: folder-filtered (p_folder_id = F1) ──
  const s3b = await run("feed_before", "S3 FOLDER F1 BEFORE", [U,"all","newest",20,false,F1,null,null]);
  const s3a = await run("feed_after",  "S3 FOLDER F1 AFTER",  [U,"all","newest",20,false,F1,null,null]);
  verdict(cmp(s3b, s3a, ["node_id","direction","created_at","total_count"]), "folder-filtered set + order");

  // ── Scenario 3b: p_exclude_foldered = true ──
  const s4b = await run("feed_before", "S4 EXCL-FOLDERED BEFORE", [U,"all","newest",20,true,null,null,null]);
  const s4a = await run("feed_after",  "S4 EXCL-FOLDERED AFTER",  [U,"all","newest",20,true,null,null,null]);
  verdict(cmp(s4b, s4a, ["node_id","direction","created_at","total_count"]), "exclude-foldered set + order");

  console.log(`\nRESULT: ${pass ? "ALL SCENARIOS IDENTICAL ✓" : "DIFFERENCES FOUND ✗"}`);
  await client.query("ROLLBACK");
  console.log("rolled back — no changes persisted");
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  console.error("ERROR:", e.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 2;
} finally {
  client.release();
  await pool.end();
}
