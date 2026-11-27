// verify-housekeeping-149.mjs — rollback-only proof for migration 149.
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });
const REF = 'lzkzfqshnjvlzosnntfx';
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(REF) || !process.env.DATABASE_URL) {
  console.log('ABORT required env names missing'); process.exit(3);
}
const sql = readFileSync(join(root, 'supabase/migrations/149_v2_housekeeping_enqueue.sql'), 'utf8');
const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
if (/\b(commit|rollback|abort)\b/i.test(stripped) || /\b(begin|start)\s+(transaction|work)\b/i.test(stripped)) {
  console.log('REFUSE migration contains transaction control'); process.exit(3);
}
const { default: pg } = await import('pg');
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${REF}.supabase.co`)) connStr = `postgresql://postgres.${REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
const pool = new pg.Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const client = await pool.connect();
let pass = 0, fail = 0, begun = false;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); ok ? pass++ : fail++; };
const q = (text, params) => client.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0];
const count = async (table) => Number((await one(`SELECT count(*)::int AS c FROM public.${table}`)).c);
const tables = ['users','user_prefs','contributors','asks','submissions','recommendations','items','enrichment_jobs'];
const baseline = {};
for (const t of tables) baseline[t] = await count(t);
console.log('BASELINE_COUNTS ' + tables.map((t) => `${t}=${baseline[t]}`).join(' '));
async function tryCall(role) {
  await q('SAVEPOINT sp_role');
  try {
    await q(`SET LOCAL ROLE ${role}`);
    await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role })]);
    const r = await q('SELECT public.enrichment_enqueue_stale(20,150,10) AS n');
    await q('RESET ROLE');
    await q('RELEASE SAVEPOINT sp_role');
    return { threw: false, code: null, n: r.rows[0]?.n };
  } catch (e) {
    try { await q('RESET ROLE'); } catch {}
    try { await q('ROLLBACK TO SAVEPOINT sp_role'); } catch {}
    return { threw: true, code: e.code ?? null, message: e.message ?? '' };
  }
}
async function serviceCall(a,b,c) {
  await q('RESET ROLE');
  await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })]);
  return Number((await one('SELECT public.enrichment_enqueue_stale($1,$2,$3) AS n', [a,b,c])).n);
}
async function makeGraph() {
  const stamp = Math.floor(Math.random() * 1e9).toString(36);
  const u = (await one(`INSERT INTO public.users(display_name,normalized_display_name) VALUES ('Fixture149','fx149${stamp}') RETURNING id`)).id;
  await q('INSERT INTO public.user_prefs(user_id,region_code,tmdb_lang) VALUES ($1,$2,$3)', [u,'US','en-US']);
  const c = (await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES ('Fixture149',decode(repeat('11',32),'hex')) RETURNING id`)).id;
  const a = (await one(`INSERT INTO public.asks(owner_id,token) VALUES ($1,encode(gen_random_bytes(24),'base64')) RETURNING id`, [u])).id;
  const s = (await one('INSERT INTO public.submissions(ask_id,contributor_id,client_batch_id,title_count) VALUES ($1,$2,gen_random_uuid(),1) RETURNING id', [a,c])).id;
  return { u, c, a, s };
}
async function makeItem(id, submissionId, contributorId, ownerId, ext) {
  await q(`INSERT INTO public.items(id,source,kind,external_id,name,fetched_at,enrichment_status) VALUES ($1,'tmdb','movie',$2,'Fixture149',now()-interval '200 days','pending')`, [id, ext]);
  await q('INSERT INTO public.recommendations(owner_id,item_id,contributor_id,submission_id) VALUES ($1,$2,$3,$4)', [ownerId,id,contributorId,submissionId]);
}
try {
  await q("SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'; SET statement_timeout = '120s'; SET application_name = 'liked-harness-v2-housekeeping-149'");
  const z = await q(`SELECT count(*)::int c FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND application_name LIKE 'liked-harness-%' AND state='idle in transaction'`);
  if (z.rows[0].c > 0) { console.log('ABORT zombie harness session present'); process.exit(2); }
  await q('BEGIN'); begun = true;
  await q(sql);
  const def = await one(`SELECT pg_get_functiondef('public.enrichment_enqueue_stale(integer,integer,integer)'::regprocedure) AS d`);
  check('functiondef SECURITY DEFINER', /SECURITY DEFINER/i.test(def.d));
  check('functiondef search_path=public', /SET search_path = public/i.test(def.d));
  const graph = await makeGraph();
  await q('SAVEPOINT sp_limit_fixture');
  const itemLimit = '00000000-0000-0000-0000-000000149001';
  await makeItem(itemLimit, graph.s, graph.c, graph.u, '149000001');
  const limited = await serviceCall(20,150,1);
  const limitedRows = Number((await one('SELECT count(*)::int c FROM public.enrichment_jobs WHERE item_id=$1', [itemLimit])).c);
  check('p_limit=1 respected with two candidate kinds', limited === 1 && limitedRows === 1, `returned=${limited} rows=${limitedRows}`);
  await q('ROLLBACK TO SAVEPOINT sp_limit_fixture');
  const itemMain = '00000000-0000-0000-0000-000000149002';
  await makeItem(itemMain, graph.s, graph.c, graph.u, '149000002');
  const first = await serviceCall(20,150,20);
  const firstRows = Number((await one('SELECT count(*)::int c FROM public.enrichment_jobs WHERE item_id=$1', [itemMain])).c);
  check('service_role enqueues details and availability for fixture item', first === 2 && firstRows === 2, `returned=${first} rows=${firstRows}`);
  const second = await serviceCall(20,150,20);
  check('second service_role call enqueues 0', second === 0, `returned=${second}`);
  const anon = await tryCall('anon');
  check('anon call rejected', anon.threw && (anon.code === '42501' || /permission denied/i.test(anon.message ?? '')), `code=${anon.code}`);
  const authn = await tryCall('authenticated');
  check('authenticated call rejected', authn.threw && (authn.code === '42501' || /permission denied/i.test(authn.message ?? '')), `code=${authn.code}`);
} catch (e) {
  check('harness completed without exception', false, e.code ?? e.message ?? 'exception');
} finally {
  if (begun) { try { await q('ROLLBACK'); console.log('ROLLBACK issued — transaction discarded, nothing committed'); } catch {} }
  client.release();
  const verify = await pool.connect();
  let residue = 0;
  const after = {};
  for (const t of tables) { after[t] = Number((await verify.query(`SELECT count(*)::int AS c FROM public.${t}`)).rows[0].c); if (after[t] !== baseline[t]) residue++; }
  console.log('AFTER_COUNTS ' + tables.map((t) => `${t}=${after[t]}`).join(' '));
  console.log(`RESIDUE CHECK: ${residue === 0 ? 'zero residue' : 'FAIL residue'}`);
  if (residue !== 0) fail++;
  console.log(`HARNESS RESULT: ${pass} passed, ${fail} failed`);
  verify.release(); await pool.end();
  process.exit(fail ? 1 : 0);
}
