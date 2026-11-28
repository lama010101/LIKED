// verify-playlist-151.mjs — rollback-only proof for migration 151 (v2 playlist kind, D32).
// Applies the migration inside one transaction, exercises the widened CHECKs,
// upsert_item, submit_recommendations, get_inbox and the stale-enrichment
// coverage of the 30-day rule, then ROLLS BACK. Zero residue is mandatory.
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
const sql = readFileSync(join(root, 'supabase/migrations/151_v2_playlist_kind.sql'), 'utf8');
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
const tables = ['users','user_prefs','contributors','asks','submissions','recommendations','items','enrichment_jobs','notifications','email_outbox'];
const baseline = {};
for (const t of tables) baseline[t] = await count(t);
console.log('BASELINE_COUNTS ' + tables.map((t) => `${t}=${baseline[t]}`).join(' '));

async function claimsFor(sub, role) {
  await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
}
async function asService() {
  await q('RESET ROLE');
  await q('SET LOCAL ROLE service_role');
  await claimsFor(null, 'service_role');
}
async function asOwner(uid) {
  await q('RESET ROLE');
  await q('SET LOCAL ROLE authenticated');
  await claimsFor(uid, 'authenticated');
}
async function asPostgres() { await q('RESET ROLE'); }

async function insertItemExpecting(kind, source, ext, shouldPass, label) {
  await asPostgres();
  await q('SAVEPOINT sp_item');
  try {
    await q(`INSERT INTO public.items(source,kind,external_id,name,fetched_at) VALUES ($1,$2,$3,'Fixture151',now())`, [source, kind, ext]);
    await q('RELEASE SAVEPOINT sp_item');
    check(label, shouldPass === true, 'insert accepted');
    return true;
  } catch (e) {
    await q('ROLLBACK TO SAVEPOINT sp_item');
    check(label, shouldPass === false, `rejected code=${e.code}`);
    return false;
  }
}

try {
  await q("SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'; SET statement_timeout = '120s'; SET application_name = 'liked-harness-v2-playlist-151'");
  const z = await q(`SELECT count(*)::int c FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND application_name LIKE 'liked-harness-%' AND state='idle in transaction'`);
  if (z.rows[0].c > 0) { console.log('ABORT zombie harness session present'); process.exit(2); }
  await q('BEGIN'); begun = true;
  await q(sql);

  const kindDef = await one(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='public.items'::regclass AND conname='items_kind_check'`);
  const idDef = await one(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='public.items'::regclass AND conname='items_identity_format'`);
  check('items_kind_check includes playlist', /playlist/.test(kindDef?.d ?? ''));
  check('items_identity_format includes the playlist pattern', /PL\|OL\|UU\|FL/.test(idDef?.d ?? ''));

  // valid playlist ids for every supported prefix
  for (const ext of ['PLMlG3wbBwCVZ4N44bIm-K_DWRgv8NWNiu', 'OLAK5uy_kxPjoHDQETdNxIqtest00', 'UU38IQsAvIsxxjztdMZQtwHA00', 'FLabcd12345xy']) {
    await insertItemExpecting('playlist', 'youtube', ext, true, `accepts ${ext.slice(0,2)}… playlist id`);
  }
  // rejected families and malformed ids
  for (const [ext, label] of [
    ['RDDQw4w9WgXcQ', 'rejects RD mix id'],
    ['LL', 'rejects LL liked-list id'],
    ['WL', 'rejects WL watch-later id'],
    ['PLshort', 'rejects short playlist id'],
    ['dQw4w9WgXcQ', 'rejects bare video-shaped id as playlist'],
  ]) {
    await insertItemExpecting('playlist', 'youtube', ext, false, label);
  }
  await insertItemExpecting('playlist', 'tmdb', '12345', false, 'rejects playlist kind for tmdb source');
  // existing kinds unaffected
  await insertItemExpecting('movie', 'tmdb', '603', true, 'movie insert still accepted');
  await insertItemExpecting('video', 'youtube', 'dQw4w9WgXcQ', true, 'video insert still accepted');
  await insertItemExpecting('channel', 'youtube', 'UC38IQsAvIsxxjztdMZQtwHA', true, 'channel insert still accepted');

  // upsert_item (service_role) accepts a playlist item
  await asService();
  const up = await one(`SELECT * FROM public.upsert_item('youtube','playlist','PLMlG3wbBwCVZ4N44bIm-K_DWRgv8NWNiu','{"name":"Fixture151 playlist","creator_name":"Fixture151 channel"}'::jsonb)`);
  check('upsert_item accepts kind=playlist', !!up?.id, up?.id ?? 'no row');
  const plItemId = up.id;
  await asPostgres();

  // owner + contributor graph, then submit_recommendations with the playlist item
  const stamp = Math.floor(Math.random() * 1e9).toString(36);
  const owner = (await one(`INSERT INTO public.users(display_name,normalized_display_name) VALUES ('Fixture151','fx151${stamp}') RETURNING id`)).id;
  await q('INSERT INTO public.user_prefs(user_id,region_code,tmdb_lang) VALUES ($1,$2,$3)', [owner,'US','en-US']);
  const contrib = (await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES ('Fixture151',decode(repeat('22',32),'hex')) RETURNING id`)).id;
  const ask = await one(`INSERT INTO public.asks(owner_id,token) VALUES ($1,encode(gen_random_bytes(24),'base64')) RETURNING id, token`, [owner]);
  await asService();
  const sub = await one(`SELECT public.submit_recommendations($1,$2,gen_random_uuid(),$3::jsonb) AS j`, [
    ask.token, contrib, JSON.stringify([{ item_id: plItemId, rating: 80, comment: 'fixture' }]),
  ]);
  check('submit_recommendations accepts a playlist item', !!sub?.j, sub?.j ? '' : 'no result');
  const jobs = Number((await one(`SELECT count(*)::int c FROM public.enrichment_jobs WHERE item_id=$1`, [plItemId])).c);
  check('submit enqueues enrichment jobs for the playlist item', jobs >= 1, `jobs=${jobs}`);

  // get_inbox as the owner returns the playlist card
  await asOwner(owner);
  const inbox = await one('SELECT public.get_inbox() AS j');
  const cards = inbox?.j?.cards ?? [];
  const card = cards.find((c) => c.item_id === plItemId);
  check('get_inbox returns the playlist item', !!card, `cards=${cards.length}`);
  check('playlist card carries kind=playlist', card?.kind === 'playlist', `kind=${card?.kind}`);
  check('playlist card sql type stays youtube (W8 filter grouping)', card?.type === 'youtube', `type=${card?.type}`);
  await asPostgres();

  // 30-day rule coverage: a stale playlist item is an enrichment candidate
  const staleItem = (await one(`INSERT INTO public.items(source,kind,external_id,name,fetched_at,enrichment_status) VALUES ('youtube','playlist','PLstale151fixture00AA','Fixture151 stale',now()-interval '25 days','complete') RETURNING id`)).id;
  const sub2 = (await one('INSERT INTO public.submissions(ask_id,contributor_id,client_batch_id,title_count) VALUES ($1,$2,gen_random_uuid(),1) RETURNING id', [ask.id, contrib])).id;
  await q('INSERT INTO public.recommendations(owner_id,item_id,contributor_id,submission_id) VALUES ($1,$2,$3,$4)', [owner, staleItem, contrib, sub2]);
  await asService();
  await q('SELECT public.enrichment_enqueue_stale(20,150,200) AS n');
  const staleJobs = Number((await one(`SELECT count(*)::int c FROM public.enrichment_jobs WHERE item_id=$1`, [staleItem])).c);
  check('stale playlist item is enqueued under the youtube 30-day rule', staleJobs >= 1, `jobs=${staleJobs}`);
  await asPostgres();
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
