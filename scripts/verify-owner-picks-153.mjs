// verify-owner-picks-153.mjs — rollback harness for migration 153
// (V2-W9-LIBRARY-1128-001, PLAN-V2-002 §2.9, D35-D36). Applies 152+153 in
// one transaction, exercises acceptance cases, always rolls back.
import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });
const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF) || !process.env.DATABASE_URL) {
  console.error("ABORT: LIKED NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL are required");
  process.exit(3);
}
const texts = ["152_v2_promote_recommendation.sql", "153_v2_owner_picks.sql"].map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"));
for (const sqlText of texts) {
  const stripped = sqlText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  if (/\b(commit|rollback|abort)\b/i.test(stripped) || /\b(begin|start)\s+(transaction|work)\b/i.test(stripped)) {
    console.error("REFUSE: migration contains transaction control");
    process.exit(3);
  }
}
const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); ok ? pass++ : fail++; };
const one = async (q, p) => (await client.query(q, p)).rows[0];
const count = async (q, p) => Number((await one(q, p)).c);
async function trySql(q, p) {
  await client.query("SAVEPOINT sp_case");
  try { const r = await client.query(q, p); await client.query("RELEASE SAVEPOINT sp_case"); return { threw:false,message:null,rows:r.rows }; }
  catch(e) { try { await client.query("ROLLBACK TO SAVEPOINT sp_case"); } catch {} return { threw:true,message:e.message??"",rows:[] }; }
}
async function asUser(uid) { await client.query("SET LOCAL ROLE authenticated"); await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub:uid, role:"authenticated" })]); }
async function asService() { await client.query("SET LOCAL ROLE service_role"); await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role:"service_role" })]); }
async function asPostgres() { await client.query("RESET ROLE"); }
async function callAs(uid,q,p) { await asUser(uid); const r=await trySql(q,p); await asPostgres(); return r; }
async function callService(q,p) { await asService(); const r=await trySql(q,p); await asPostgres(); return r; }
const tables=["users","user_prefs","asks","contributors","items","submissions","recommendations","nodes","node_items","folders","folder_edges","edges","causes"];
const baseline={}; for(const t of tables) baseline[t]=await count(`SELECT count(*)::int c FROM public.${t}`);

try {
  await client.query("BEGIN");
  for (const sql of texts) await client.query(sql);
  for(const t of tables) if(t==="owner_picks") baseline.owner_picks=await count(`SELECT count(*)::int c FROM public.owner_picks`);
  const owner=(await one(`INSERT INTO public.users(display_name,normalized_display_name,language_code) VALUES('P153 Owner','p153-owner','en') RETURNING id`)).id;
  const other=(await one(`INSERT INTO public.users(display_name,normalized_display_name,language_code) VALUES('P153 Other','p153-other','en') RETURNING id`)).id;
  await client.query(`INSERT INTO public.user_prefs(user_id,region_code,tmdb_lang) VALUES($1,'US','en-US')`,[owner]);
  const contributor=(await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES('P153 Guest',decode(repeat('c7',32),'hex')) RETURNING id`)).id;
  const zeroContributor=(await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES('P153 Zero',decode(repeat('d8',32),'hex')) RETURNING id`)).id;
  const token="p153tok"+"e".repeat(55);
  const ask=(await one(`INSERT INTO public.asks(owner_id,token,is_active) VALUES($1,$2,true) RETURNING id`,[owner,token])).id;
  const submission=(await one(`INSERT INTO public.submissions(ask_id,contributor_id,title_count) VALUES($1,$2,1) RETURNING id`,[ask,contributor])).id;
  const item=(await one(`INSERT INTO public.items(source,kind,external_id,name,release_date,poster_path,enrichment_status,fetched_at,localized) VALUES('tmdb','movie','153001','P153 Film','2020-01-01','/p153.jpg','complete',now(),'{}') RETURNING id`)).id;
  const rec=(await one(`INSERT INTO public.recommendations(owner_id,item_id,contributor_id,submission_id,rating) VALUES($1,$2,$3,$4,90) RETURNING id`,[owner,item,contributor,submission])).id;
  const promoted=await callAs(owner,`SELECT public.promote_recommendation($1,NULL) r`,[rec]);
  const node=promoted.rows[0]?.r?.node_id;
  check("fixture promoted item",!promoted.threw && Boolean(node),promoted.message??"");

  const badVis=await callAs(owner,`SELECT public.set_pick_visibility($1,'everyone')`,[node]);
  check("bad visibility rejected",badVis.threw && badVis.message.includes("BAD_VISIBILITY"),badVis.message??"");
  const positive=await callAs(owner,`SELECT public.set_pick_visibility($1,'contributors')`,[node]);
  check("set_pick_visibility positive",!positive.threw && await count(`SELECT count(*)::int c FROM public.owner_picks WHERE owner_id=$1 AND node_id=$2 AND visibility='contributors'`,[owner,node])===1,positive.message??"");
  const list=await callAs(owner,`SELECT public.list_my_picks() r`);
  check("list_my_picks returns promoted pick",!list.threw && list.rows[0]?.r?.[0]?.node_id===node && list.rows[0]?.r?.[0]?.name==="P153 Film",list.message??"");
  const guest=await callService(`SELECT public.guest_get_picks($1,$2) r`,[token,contributor]);
  check("eligible contributor receives picks",!guest.threw && guest.rows[0]?.r?.[0]?.name==="P153 Film" && !("node_id" in (guest.rows[0]?.r?.[0]??{})) && !("owner_id" in (guest.rows[0]?.r?.[0]??{})),guest.message??"");
  const zero=await callService(`SELECT public.guest_get_picks($1,$2) r`,[token,zeroContributor]);
  check("zero-submission contributor gets empty",!zero.threw && Array.isArray(zero.rows[0]?.r) && zero.rows[0].r.length===0,zero.message??"");
  const authDenied=await callAs(contributor,`SELECT public.guest_get_picks($1,$2)`,[token,contributor]);
  check("authenticated cannot execute guest_get_picks",authDenied.threw,authDenied.message??"no error");

  const otherItem=(await one(`INSERT INTO public.items(source,kind,external_id,name,enrichment_status,fetched_at,localized) VALUES('tmdb','movie','153002','P153 Other','complete',now(),'{}') RETURNING id`)).id;
  const foreignNode=(await callAs(other,`SELECT ir.id FROM public.import_url($1,'https://example.com/p153','foreign',NULL,'en','link',NULL,NULL,NULL,NULL,NULL,NULL) ir`,[other])).rows[0]?.id;
  await client.query(`INSERT INTO public.node_items(node_id,item_id) VALUES($1,$2)`,[foreignNode,otherItem]);
  const foreign=await callAs(owner,`SELECT public.set_pick_visibility($1,'contributors')`,[foreignNode]);
  check("other owner's node rejected",foreign.threw && foreign.message.includes("NOT_FOUND"),foreign.message??"");
  const unpromotedNode=(await callAs(owner,`SELECT ir.id FROM public.import_url($1,'https://example.com/p153u','unpromoted',NULL,'en','link',NULL,NULL,NULL,NULL,NULL,NULL) ir`,[owner])).rows[0]?.id;
  const unpromoted=await callAs(owner,`SELECT public.set_pick_visibility($1,'contributors')`,[unpromotedNode]);
  check("not-promoted node rejected",unpromoted.threw && unpromoted.message.includes("NOT_FOUND"),unpromoted.message??"");
  const privatize=await callAs(owner,`SELECT public.set_pick_visibility($1,'private')`,[node]);
  check("private deletes row",!privatize.threw && await count(`SELECT count(*)::int c FROM public.owner_picks WHERE owner_id=$1 AND node_id=$2`,[owner,node])===0,privatize.message??"");
  await callAs(owner,`SELECT public.set_pick_visibility($1,'contributors')`,[node]);
  await client.query(`UPDATE public.nodes SET deleted_at=now() WHERE id=$1`,[node]);
  const hidden=await callService(`SELECT public.guest_get_picks($1,$2) r`,[token,contributor]);
  check("deleted node is not exposed",!hidden.threw && hidden.rows[0]?.r?.length===0,hidden.message??"");
  await client.query(`DELETE FROM public.nodes WHERE id=$1`,[node]);
  check("node delete cascades owner_picks",await count(`SELECT count(*)::int c FROM public.owner_picks WHERE node_id=$1`,[node])===0);
} catch(e) {
  check("migration/harness setup executes",false,e.message);
} finally {
  try { await client.query("ROLLBACK"); } catch {}
}
for (const t of tables) {
  const after=await count(`SELECT count(*)::int c FROM public.${t}`);
  const before=t==="owner_picks" ? (baseline.owner_picks ?? after) : baseline[t];
  check(`zero residue ${t}`,after===before,`before=${before} after=${after}`);
}
check("owner_picks rolled back with migration", (await one(`SELECT to_regclass('public.owner_picks') AS r`)).r === null);
await client.release(); await pool.end();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
