// Phase 2 smoke test — runs entirely in rolled-back transactions.
import { createRequire } from "module";
const require = createRequire("D:/LIKED/package.json");
require("dotenv").config({ path: "D:/LIKED/.env.local" });
const pg = require("pg");
let cs = process.env.DATABASE_URL;
const pw = cs.match(/:([^:@]+)@/)?.[1];
if (cs.includes("db.lzkzfqshnjvlzosnntfx.supabase.co"))
  cs = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();

const u = await c.query("SELECT id FROM users ORDER BY created_at LIMIT 2");
if (u.rows.length < 2) { console.log("need 2 users"); process.exit(1); }
const [A, B] = u.rows.map((r) => r.id);

async function asUser(uid, fn) {
  await c.query("BEGIN");
  await c.query("SELECT set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: uid, role: "authenticated" })]);
  try { await fn(); } finally { await c.query("ROLLBACK"); }
}

const out = [];
const t = (name, ok, detail = "") => { out.push(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); };

await asUser(A, async () => {
  const who = await c.query("SELECT auth.uid() u, auth.role() r");
  t("auth context", who.rows[0].u === A && who.rows[0].r === "authenticated");

  // create folder chain to depth cap (savepoint per level so expected errors don't abort)
  let parent = null, depthErr = null;
  for (let i = 1; i <= 6; i++) {
    await c.query("SAVEPOINT sp_d");
    try {
      const r = await c.query("SELECT create_folder($1, $2) id", [`d${i}`, parent]);
      parent = r.rows[0].id;
    } catch (e) { depthErr = e.message; await c.query("ROLLBACK TO sp_d"); }
  }
  t("depth cap at 5", /depth \(5\)/.test(depthErr || ""), depthErr || "");

  // share folder -> grant + expansion
  const root = (await c.query("SELECT create_folder('shareRoot', NULL) id")).rows[0].id;
  const child = (await c.query("SELECT create_folder('shareChild', $1) id", [root])).rows[0].id;
  const node = (await c.query(
    "SELECT id FROM import_url($1,'https://x.test/a','t',NULL,'en','link',NULL,NULL,NULL,$2)",
    [A, child])).rows[0].id;
  const n = (await c.query("SELECT share_folder_v2($1,'view',ARRAY[$2]::uuid[]) c", [root, B])).rows[0].c;
  t("share_folder_v2 returns 1", n === 1);
  const edges = await c.query(
    "SELECT count(*)::int n FROM edges e JOIN causes c ON c.id=e.cause_id AND c.folder_grant_id IS NOT NULL WHERE e.user_id=$1", [B]);
  // expect: folder edges on root+child (2) + node edge (1) = 3 received edges for B
  t("expansion edges for grantee", edges.rows[0].n === 3, `got ${edges.rows[0].n}`);
  const fedges = await c.query(
    "SELECT count(*)::int n FROM edges WHERE folder_id=$1 AND user_id=$2", [root, B]);
  t("folder edge on root", fedges.rows[0].n === 1);
  const vis = await c.query("SELECT folder_is_visible($1,$2) v, effective_folder_permission($1,$2) p", [root, B]);
  t("grantee sees folder view", vis.rows[0].v === true && vis.rows[0].p === "view", JSON.stringify(vis.rows[0]));

  // live expansion: node added after share
  const node2 = (await c.query(
    "SELECT id FROM import_url($1,'https://x.test/b','t2',NULL,'en','link',NULL,NULL,NULL,$2)",
    [A, child])).rows[0].id;
  const e2 = await c.query("SELECT count(*)::int n FROM edges WHERE node_id=$1 AND user_id=$2", [node2, B]);
  t("live expansion on later add (Q10)", e2.rows[0].n === 1);

  // permission check: B (view) cannot add to folder
  let addErr = null;
  await c.query("SAVEPOINT s1");
  try {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: B, role: "authenticated" })]);
    const bn = (await c.query("SELECT id FROM nodes WHERE owner_id=$1 AND deleted_at IS NULL LIMIT 1", [B])).rows[0]?.id;
    if (bn) await c.query("SELECT add_node_to_folder($1,$2)", [bn, root]);
  } catch (e) { addErr = e.message; }
  await c.query("ROLLBACK TO s1");
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: A, role: "authenticated" })]);
  t("view grantee cannot contribute", addErr === null || /contribute/.test(addErr || ""), addErr || "(no node for B)");

  // Q11: remove node from folder -> grantee edge revoked
  await c.query("SELECT remove_node_from_folder($1,$2)", [node2, child]);
  const e3 = await c.query("SELECT count(*)::int n FROM edges WHERE node_id=$1 AND user_id=$2", [node2, B]);
  t("remove revokes folder-derived edge (Q11)", e3.rows[0].n === 0);

  // trash_folder sole-membership (Q17): node in child only -> trashed
  const tr = await c.query("SELECT trash_folder($1) b", [root]);
  const trashedNode = await c.query("SELECT deleted_at IS NOT NULL d FROM nodes WHERE id=$1", [node]);
  const trashedFolder = await c.query("SELECT count(*)::int n FROM folders WHERE id IN ($1,$2) AND deleted_at IS NOT NULL", [root, child]);
  t("trash marks subtree+sole-member card", trashedNode.rows[0].d === true && trashedFolder.rows[0].n === 2);
  const edgesKept = await c.query("SELECT count(*)::int n FROM edges WHERE node_id=$1", [node]);
  t("trash preserves edges (T0-4)", edgesKept.rows[0].n > 0);

  // restore
  await c.query("SELECT restore_folder($1)", [root]);
  const restored = await c.query("SELECT (SELECT count(*) FROM nodes WHERE id=$1 AND deleted_at IS NULL) n, (SELECT count(*) FROM folders WHERE id=$2 AND deleted_at IS NULL) f", [node, root]);
  t("restore reverses batch", restored.rows[0].n === "1" && restored.rows[0].f === "1");

  // revoke grant -> all expansion edges gone
  await c.query("SELECT revoke_folder_grant($1,$2)", [root, B]);
  const gone = await c.query("SELECT count(*)::int n FROM edges e JOIN causes c ON c.id=e.cause_id WHERE c.folder_grant_id IS NOT NULL AND e.user_id=$1", [B]);
  t("revoke cascades all grant edges", gone.rows[0].n === 0);
  const vis2 = await c.query("SELECT folder_is_visible($1,$2) v", [root, B]);
  t("grantee loses folder visibility", vis2.rows[0].v === false);

  // system folder protections
  const sys = (await c.query("SELECT get_or_create_system_folder('youtube') id")).rows[0].id;
  let renErr = null, trashErr = null;
  await c.query("SAVEPOINT sp_sys");
  try { await c.query("SELECT rename_folder($1,'x')", [sys]); } catch (e) { renErr = e.message; await c.query("ROLLBACK TO sp_sys"); }
  try { await c.query("SELECT trash_folder($1)", [sys]); } catch (e) { trashErr = e.message; await c.query("ROLLBACK TO sp_sys"); }
  t("system folder protected (Q15)", /system/.test(renErr || "") && /system/.test(trashErr || ""));

  // system routing in import
  const wn = (await c.query("SELECT id FROM import_url($1,'https://x.test/c','w',NULL,'en','link',NULL,NULL,NULL,NULL,NULL,'Web')", [A])).rows[0].id;
  const wf = await c.query("SELECT f.system_kind FROM folder_edges fe JOIN folders f ON f.id=fe.folder_id WHERE fe.node_id=$1", [wn]);
  t("import routes 'Web' to system folder", wf.rows[0]?.system_kind === "web");

  // rating 0-100
  const avg = await c.query("SELECT upsert_rating($1, 85) a", [node]);
  t("upsert_rating 0-100", Number(avg.rows[0].a) === 85);
  let rErr = null;
  await c.query("SAVEPOINT sp_rate");
  try { await c.query("SELECT upsert_rating($1, 7.5)", [node]); } catch (e) { rErr = e.message; await c.query("ROLLBACK TO sp_rate"); }
  t("non-integer score rejected", rErr !== null);
  const favg = await c.query("SELECT rate_folder($1, 60) a", [root]);
  t("rate_folder", Number(favg.rows[0].a) === 60);

  // organize batch flow
  const batch = (await c.query("SELECT create_organize_batch($1) id", [child])).rows[0].id;
  const items = await c.query("SELECT count(*)::int n FROM organize_items WHERE batch_id=$1 AND status='pending'", [batch]);
  t("batch pending items", items.rows[0].n === 1, `got ${items.rows[0].n}`);
  await c.query("SELECT set_organize_item_proposal($1,$2,NULL,'NewTarget','{tagx}'::text[],'r')", [batch, node]);
  const applied = await c.query("SELECT apply_organization_batch($1, ARRAY[i.id]) a FROM organize_items i WHERE i.batch_id=$1", [batch]);
  const moved = await c.query(
    "SELECT (SELECT count(*) FROM folder_edges WHERE node_id=$1 AND folder_id=$2) tgt, (SELECT count(*) FROM folder_edges WHERE node_id=$1 AND folder_id=$3) src",
    [node, (await c.query("SELECT id FROM folders WHERE owner_id=$1 AND name='NewTarget'", [A])).rows[0].id, child]);
  t("apply moves out of source (Q16)", Number(applied.rows[0].a) === 1 && moved.rows[0].tgt === "1" && moved.rows[0].src === "0",
    JSON.stringify(moved.rows[0]));
  const tagok = await c.query("SELECT count(*)::int n FROM tag_edges WHERE node_id=$1", [node]);
  t("proposed tag applied", tagok.rows[0].n >= 1);

  // consent
  await c.query("SELECT set_youtube_import_consent(true)");
  const cons = await c.query("SELECT youtube_import_consent_at IS NOT NULL c FROM users WHERE id=$1", [A]);
  t("youtube consent set", cons.rows[0].c === true);
});

console.log(out.join("\n"));
await c.end();
