// verify-promote-recommendation-152.mjs — rollback harness for migration 152
// (V2-W9-LIBRARY-1128-001, PLAN-V2-002 §2.7, D33-D34).
// Applies the migration in ONE transaction, exercises acceptance cases, and
// always rolls back. No fixture or migration change is committed.
import { config } from "dotenv";
import { readFileSync } from "fs";
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
if (!process.env.DATABASE_URL) {
  console.error("ABORT: DATABASE_URL is not set");
  process.exit(3);
}
const migration = join(root, "supabase", "migrations", "152_v2_promote_recommendation.sql");
const sqlText = readFileSync(migration, "utf8");
const stripped = sqlText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
if (/\b(commit|rollback|abort)\b/i.test(stripped) || /\b(begin|start)\s+(transaction|work)\b/i.test(stripped)) {
  console.error("REFUSE: migration contains transaction control");
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
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};
const one = async (text, params) => (await client.query(text, params)).rows[0];
const count = async (text, params) => Number((await one(text, params)).c);
async function trySql(text, params) {
  await client.query("SAVEPOINT sp_case");
  try {
    const res = await client.query(text, params);
    await client.query("RELEASE SAVEPOINT sp_case");
    return { threw: false, message: null, rows: res.rows };
  } catch (e) {
    try { await client.query("ROLLBACK TO SAVEPOINT sp_case"); } catch {}
    return { threw: true, message: e.message ?? "", rows: [] };
  }
}
async function asUser(uid) {
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}
async function asPostgres() { await client.query("RESET ROLE"); }
async function callAs(uid, text, params) {
  await asUser(uid);
  const r = await trySql(text, params);
  await asPostgres();
  return r;
}
const residueTables = ["users", "user_prefs", "asks", "contributors", "items", "submissions", "recommendations", "nodes", "node_items", "folders", "folder_edges", "edges", "causes"];
const baseline = {};
for (const t of residueTables) baseline[t] = await count(`SELECT count(*)::int AS c FROM public.${t}`);

let failedSetup = null;
try {
  await client.query("BEGIN");
  await client.query(sqlText);

  const ownerA = (await one(`INSERT INTO public.users (display_name, normalized_display_name, language_code) VALUES ('P152 Owner A','p152-owner-a','en') RETURNING id`)).id;
  const ownerB = (await one(`INSERT INTO public.users (display_name, normalized_display_name, language_code) VALUES ('P152 Owner B','p152-owner-b','en') RETURNING id`)).id;
  await client.query(`INSERT INTO public.user_prefs (user_id, region_code, tmdb_lang) VALUES ($1,'US','en-US'),($2,'US','en-US')`, [ownerA, ownerB]);
  const contrib = (await one(`INSERT INTO public.contributors (display_name, secret_hash) VALUES ('P152 Friend', decode(repeat('a9',32),'hex')) RETURNING id`)).id;
  const askA = (await one(`INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1,$2,true) RETURNING id`, [ownerA, "p152tok" + "a".repeat(55)])).id;
  const askB = (await one(`INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1,$2,true) RETURNING id`, [ownerB, "p152tok" + "b".repeat(55)])).id;
  const subA = (await one(`INSERT INTO public.submissions (ask_id, contributor_id, title_count) VALUES ($1,$2,6) RETURNING id`, [askA, contrib])).id;
  const subB = (await one(`INSERT INTO public.submissions (ask_id, contributor_id, title_count) VALUES ($1,$2,1) RETURNING id`, [askB, contrib])).id;
  const mkItem = async (externalId, kind, source = kind === "video" || kind === "playlist" ? "youtube" : "tmdb") => (await one(
    `INSERT INTO public.items (source,kind,external_id,name,overview,release_date,poster_path,thumb_url,enrichment_status,fetched_at,localized)
     VALUES ($1,$2,$3,$4,'overview','2020-01-01','/poster.jpg',NULL,'complete',now(),'{}') RETURNING id`,
    [source, kind, externalId, `P152 ${kind} ${externalId}`])).id;
  const mkRec = async (owner, item, sub) => (await one(
    `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating) VALUES ($1,$2,$3,$4,80) RETURNING id`,
    [owner, item, contrib, sub])).id;
  const movie = await mkItem("152001", "movie");
  const series = await mkItem("152002", "series");
  const video = await mkItem("152abcdefgh", "video");
  const channel = await mkItem("UCaaaaaaaaaaaaaaaaaaaaaa", "channel", "youtube");
  const otherMovie = await mkItem("152003", "movie");
  const recMovie = await mkRec(ownerA, movie, subA);
  const recSeries = await mkRec(ownerA, series, subA);
  const recVideo = await mkRec(ownerA, video, subA);
  const recChannel = await mkRec(ownerA, channel, subA);
  const recOtherOwner = await mkRec(ownerB, otherMovie, subB);

  const movieRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL) AS r`, [recMovie]);
  const moviePayload = movieRes.rows[0]?.r;
  check("movie promote positive", !movieRes.threw && /^[0-9a-f-]{36}$/i.test(moviePayload?.node_id ?? "") && moviePayload.already === false, movieRes.message ?? JSON.stringify(moviePayload));
  const movieNode = moviePayload?.node_id;
  check("node_items bridge inserted", movieNode ? await count(`SELECT count(*)::int c FROM public.node_items WHERE node_id=$1 AND item_id=$2`, [movieNode, movie]) === 1 : false);
  check("default From friends folder used", movieNode ? await count(
    `SELECT count(*)::int c FROM public.folder_edges fe JOIN public.folders f ON f.id=fe.folder_id WHERE fe.node_id=$1 AND f.owner_id=$2 AND f.name='From friends'`, [movieNode, ownerA]) === 1 : false);
  check("owner edge has non-null import cause", movieNode ? await count(
    `SELECT count(*)::int c FROM public.edges e JOIN public.causes c ON c.id=e.cause_id WHERE e.node_id=$1 AND e.user_id=$2 AND e.cause_id IS NOT NULL AND c.cause_type='import'`, [movieNode, ownerA]) === 1 : false);
  const movieAgain = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL) AS r`, [recMovie]);
  check("second promote idempotent already:true", !movieAgain.threw && movieAgain.rows[0]?.r?.already === true && movieAgain.rows[0]?.r?.node_id === movieNode, movieAgain.message ?? "");

  const parent = (await callAs(ownerA, `SELECT public.create_folder('P152 parent',NULL,NULL,NULL) AS id`)).rows[0]?.id;
  const d2 = (await callAs(ownerA, `SELECT public.create_folder('P152 d2',$1,NULL,NULL) AS id`, [parent])).rows[0]?.id;
  const d3 = (await callAs(ownerA, `SELECT public.create_folder('P152 d3',$1,NULL,NULL) AS id`, [d2])).rows[0]?.id;
  const d4 = (await callAs(ownerA, `SELECT public.create_folder('P152 d4',$1,NULL,NULL) AS id`, [d3])).rows[0]?.id;
  const d5 = (await callAs(ownerA, `SELECT public.create_folder('P152 d5',$1,NULL,NULL) AS id`, [d4])).rows[0]?.id;
  const seriesRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,$2) AS r`, [recSeries, d5]);
  check("series promote into depth-5 folder", !seriesRes.threw && seriesRes.rows[0]?.r?.already === false, seriesRes.message ?? "");
  check("depth-5 folder membership", seriesRes.rows[0]?.r?.node_id ? await count(`SELECT count(*)::int c FROM public.folder_edges WHERE node_id=$1 AND folder_id=$2`, [seriesRes.rows[0].r.node_id, d5]) === 1 : false);

  const videoRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL) AS r`, [recVideo]);
  const videoNode = videoRes.rows[0]?.r?.node_id;
  check("video promote positive", !videoRes.threw && Boolean(videoNode), videoRes.message ?? "");
  check("promoted video canonical URL/type", videoNode ? (await one(`SELECT url,node_type FROM public.nodes WHERE id=$1`, [videoNode]))?.url === "https://www.youtube.com/watch?v=152abcdefgh" && (await one(`SELECT node_type FROM public.nodes WHERE id=$1`, [videoNode]))?.node_type === "video" : false);
  const posterRows = await callAs(ownerA, `SELECT * FROM public.get_node_item_posters(ARRAY[$1::uuid,$2::uuid])`, [movieNode, videoNode]);
  check("poster RPC resolves TMDB and YouTube thumbnails", !posterRows.threw && posterRows.rows.length === 2 && posterRows.rows.every((r) => /^https:\/\//.test(r.image_url)), posterRows.message ?? "");

  const channelRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL)`, [recChannel]);
  check("channel unsupported", channelRes.threw && channelRes.message.includes("UNSUPPORTED_KIND"), channelRes.message ?? "");
  const foreignRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL)`, [recOtherOwner]);
  check("other owner's recommendation NOT_FOUND", foreignRes.threw && foreignRes.message.includes("NOT_FOUND"), foreignRes.message ?? "");
  const foreignFolder = (await callAs(ownerB, `SELECT public.create_folder('P152 foreign',NULL,NULL,NULL) AS id`)).rows[0]?.id;
  const permItem = await mkItem("152006", "movie");
  const permRec = await mkRec(ownerA, permItem, subA);
  const deniedRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,$2)`, [permRec, foreignFolder]);
  check("folder without contribute permission errors", deniedRes.threw, deniedRes.message ?? "no error");

  const dupItem = await mkItem("152004", "movie");
  const dupRec = await mkRec(ownerA, dupItem, subA);
  const dupUrl = "https://www.themoviedb.org/movie/152004";
  const preNode = (await callAs(ownerA,
    `SELECT ir.id FROM public.import_url($1,$2,'P152 duplicate',NULL,'en','link',NULL,NULL,NULL,NULL,NULL,NULL) ir`,
    [ownerA, dupUrl])).rows[0]?.id;
  const dupRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL) AS r`, [dupRec]);
  check("duplicate canonical URL path reuses node", !dupRes.threw && dupRes.rows[0]?.r?.node_id === preNode && dupRes.rows[0]?.r?.already === true, dupRes.message ?? "");

  const trashItem = await mkItem("152005", "movie");
  const trashRec = await mkRec(ownerA, trashItem, subA);
  const trashUrl = "https://www.themoviedb.org/movie/152005";
  const trashedNode = (await callAs(ownerA,
    `SELECT ir.id FROM public.import_url($1,$2,'P152 trashed',NULL,'en','link',NULL,NULL,NULL,NULL,NULL,NULL) ir`,
    [ownerA, trashUrl])).rows[0]?.id;
  await callAs(ownerA, `SELECT public.set_node_deleted($1,true)`, [trashedNode]);
  const trashRes = await callAs(ownerA, `SELECT public.promote_recommendation($1,NULL) AS r`, [trashRec]);
  check("trashed duplicate node restored", !trashRes.threw && trashRes.rows[0]?.r?.node_id === trashedNode && (await one(`SELECT deleted_at FROM public.nodes WHERE id=$1`, [trashedNode]))?.deleted_at === null, trashRes.message ?? "");

  const anonRes = await (async () => {
    await client.query("SET LOCAL ROLE anon");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    const r = await trySql(`SELECT public.promote_recommendation($1,NULL)`, [recMovie]);
    await asPostgres();
    return r;
  })();
  check("anon cannot execute promote", anonRes.threw, anonRes.message ?? "no error");
} catch (e) {
  failedSetup = e;
  check("migration/harness setup executes", false, e.message);
} finally {
  try { await client.query("ROLLBACK"); } catch {}
}
for (const t of residueTables) {
  const after = await count(`SELECT count(*)::int AS c FROM public.${t}`);
  check(`zero residue ${t}`, after === baseline[t], `before=${baseline[t]} after=${after}`);
}
if (failedSetup) console.error("SETUP ERROR:", failedSetup.message);
await client.release();
await pool.end();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
