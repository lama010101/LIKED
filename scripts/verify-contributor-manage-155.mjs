// verify-contributor-manage-155.mjs — rollback-only proof for migration 155
// (owner remove/block/unblock contributor). Applies the migration inside one
// transaction against PROD, exercises positive paths, cross-owner isolation,
// idempotency and the anti-enumeration NOT_FOUND, then ROLLS BACK.
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
const sql = readFileSync(join(root, 'supabase/migrations/155_v2_contributor_manage.sql'), 'utf8');
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
const tables = ['users','user_prefs','contributors','asks','submissions','recommendations','items','notifications','owner_contributor_blocks','email_outbox','enrichment_jobs'];
const baseline = {};
for (const t of tables) baseline[t] = await count(t);
console.log('BASELINE_COUNTS ' + tables.map((t) => `${t}=${baseline[t]}`).join(' '));

async function claimsFor(sub, role) {
  await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, role } : { role })]);
}
async function asUser(uid) {
  await q('RESET ROLE');
  await q('SET LOCAL ROLE authenticated');
  await claimsFor(uid, 'authenticated');
}
async function asAnon() {
  await q('RESET ROLE');
  await q('SET LOCAL ROLE anon');
  await claimsFor(null, 'anon');
}
async function asPostgres() { await q('RESET ROLE'); }
async function callExpecting(fn, uid, contributor, shouldPass, label) {
  await q('SAVEPOINT sp_call');
  try {
    if (uid) await asUser(uid); else await asAnon();
    const r = await one(`SELECT public.${fn}($1) AS j`, [contributor]);
    await asPostgres();
    await q('RELEASE SAVEPOINT sp_call');
    check(label, shouldPass === true, 'accepted ' + JSON.stringify(r?.j ?? {}));
    return r?.j ?? null;
  } catch (e) {
    try { await asPostgres(); } catch {}
    await q('ROLLBACK TO SAVEPOINT sp_call');
    check(label, shouldPass === false, `rejected code=${e.code} msg=${(e.message ?? '').slice(0, 40)}`);
    return null;
  }
}

try {
  await q("SET idle_in_transaction_session_timeout = '60s'; SET lock_timeout = '10s'; SET statement_timeout = '120s'; SET application_name = 'liked-harness-v2-contributor-155'");
  const z = await q(`SELECT count(*)::int c FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND application_name LIKE 'liked-harness-%' AND state='idle in transaction'`);
  if (z.rows[0].c > 0) { console.log('ABORT zombie harness session present'); process.exit(2); }
  await q('BEGIN'); begun = true;
  await q(sql);

  for (const fn of ['remove_contributor_recommendations', 'block_contributor', 'unblock_contributor']) {
    const def = await one(`SELECT pg_get_functiondef($1::regprocedure) AS d`, [`public.${fn}(uuid)`]);
    check(`${fn} SECURITY DEFINER + search_path`, /SECURITY DEFINER/i.test(def?.d ?? '') && /SET search_path (TO|=) ''?public''?/i.test(def?.d ?? ''));
  }

  // fixture graph: owner A + owner B, one shared contributor who submitted to BOTH
  const stamp = Math.floor(Math.random() * 1e9).toString(36);
  const ownerA = (await one(`INSERT INTO public.users(display_name,normalized_display_name) VALUES ('Fixture155A','fx155a${stamp}') RETURNING id`)).id;
  const ownerB = (await one(`INSERT INTO public.users(display_name,normalized_display_name) VALUES ('Fixture155B','fx155b${stamp}') RETURNING id`)).id;
  await q('INSERT INTO public.user_prefs(user_id,region_code,tmdb_lang) VALUES ($1,$2,$3),($4,$2,$3)', [ownerA,'US','en-US',ownerB]);
  const contrib = (await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES ('Fixture155',decode(repeat('33',32),'hex')) RETURNING id`)).id;
  const stranger = (await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES ('Fixture155X',decode(repeat('44',32),'hex')) RETURNING id`)).id;
  const askA = await one(`INSERT INTO public.asks(owner_id,token) VALUES ($1,encode(gen_random_bytes(24),'base64')) RETURNING id, token`, [ownerA]);
  const askB = await one(`INSERT INTO public.asks(owner_id,token) VALUES ($1,encode(gen_random_bytes(24),'base64')) RETURNING id, token`, [ownerB]);
  const item = (await one(`INSERT INTO public.items(source,kind,external_id,name,fetched_at) VALUES ('tmdb','movie','155000001','Fixture155',now()) RETURNING id`)).id;
  const mkSubmission = async (ask, owner) => {
    const s = (await one('INSERT INTO public.submissions(ask_id,contributor_id,client_batch_id,title_count) VALUES ($1,$2,gen_random_uuid(),1) RETURNING id', [ask, contrib])).id;
    await q('INSERT INTO public.recommendations(owner_id,item_id,contributor_id,submission_id,rating) VALUES ($1,$2,$3,$4,80)', [owner, item, contrib, s]);
    return s;
  };
  await mkSubmission(askA.id, ownerA);
  await mkSubmission(askB.id, ownerB);
  const recsA0 = Number((await one('SELECT count(*)::int c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2', [ownerA, contrib])).c);
  const recsB0 = Number((await one('SELECT count(*)::int c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2', [ownerB, contrib])).c);
  check('fixture: contributor has rows for both owners', recsA0 === 1 && recsB0 === 1, `A=${recsA0} B=${recsB0}`);

  // anonymous calls rejected
  await callExpecting('remove_contributor_recommendations', null, contrib, false, 'anon remove rejected');
  await callExpecting('block_contributor', null, contrib, false, 'anon block rejected');
  await callExpecting('unblock_contributor', null, contrib, false, 'anon unblock rejected');

  // anti-enumeration: unknown id and never-submitted id raise the same NOT_FOUND
  const unknownId = '00000000-0000-4000-8000-000000000999';
  await callExpecting('remove_contributor_recommendations', ownerA, unknownId, false, 'unknown contributor -> NOT_FOUND');
  await callExpecting('remove_contributor_recommendations', ownerA, stranger, false, 'never-submitted contributor -> same NOT_FOUND');

  // cross-owner isolation: owner B blocking removes ONLY B rows
  const blockB = await callExpecting('block_contributor', ownerB, contrib, true, 'owner B block accepted');
  check('block result reports blocked=true', blockB?.blocked === true, JSON.stringify(blockB ?? {}));
  const recsA1 = Number((await one('SELECT count(*)::int c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2', [ownerA, contrib])).c);
  const recsB1 = Number((await one('SELECT count(*)::int c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2', [ownerB, contrib])).c);
  const subsA1 = Number((await one(`SELECT count(*)::int c FROM public.submissions s JOIN public.asks a ON a.id=s.ask_id WHERE a.owner_id=$1 AND s.contributor_id=$2`, [ownerA, contrib])).c);
  check('owner A rows untouched by owner B block (cross-owner isolation)', recsA1 === 1 && subsA1 === 1, `A_recs=${recsA1} A_subs=${subsA1}`);
  check('owner B rows removed by owner B block', recsB1 === 0, `B_recs=${recsB1}`);
  const blockRowB = Number((await one('SELECT count(*)::int c FROM public.owner_contributor_blocks WHERE owner_id=$1 AND contributor_id=$2', [ownerB, contrib])).c);
  check('block row present for owner B only', blockRowB === 1, `B_blocks=${blockRowB}`);

  // idempotency: repeat block is a successful no-op (block row is evidence)
  const blockB2 = await callExpecting('block_contributor', ownerB, contrib, true, 'repeat block idempotent no-op');
  check('repeat block reports zero removed rows', blockB2?.removed_recommendations === 0 && blockB2?.removed_submissions === 0, JSON.stringify(blockB2 ?? {}));
  const blockRowB2 = Number((await one('SELECT count(*)::int c FROM public.owner_contributor_blocks WHERE owner_id=$1 AND contributor_id=$2', [ownerB, contrib])).c);
  check('still exactly one block row after repeat', blockRowB2 === 1, `B_blocks=${blockRowB2}`);

  // unblock removes the block; repeat unblock -> NOT_FOUND (no evidence left for B)
  const unB = await callExpecting('unblock_contributor', ownerB, contrib, true, 'owner B unblock accepted');
  check('unblock reports unblocked=true', unB?.unblocked === true, JSON.stringify(unB ?? {}));
  await callExpecting('unblock_contributor', ownerB, contrib, false, 'repeat unblock -> NOT_FOUND (idempotent end state)');

  // positive remove path for owner A
  const remA = await callExpecting('remove_contributor_recommendations', ownerA, contrib, true, 'owner A remove accepted');
  check('remove reports the deleted rows', remA?.removed_recommendations === 1 && remA?.removed_submissions === 1, JSON.stringify(remA ?? {}));
  const recsA2 = Number((await one('SELECT count(*)::int c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2', [ownerA, contrib])).c);
  check('owner A recommendations gone after remove', recsA2 === 0, `A_recs=${recsA2}`);
  await callExpecting('remove_contributor_recommendations', ownerA, contrib, false, 'repeat remove -> NOT_FOUND (idempotent end state)');

  // owner A cannot act on a contributor who only ever submitted to B (no A relationship)
  const contribBonly = (await one(`INSERT INTO public.contributors(display_name,secret_hash) VALUES ('Fixture155Y',decode(repeat('55',32),'hex')) RETURNING id`)).id;
  const sB = (await one('INSERT INTO public.submissions(ask_id,contributor_id,client_batch_id,title_count) VALUES ($1,$2,gen_random_uuid(),1) RETURNING id', [askB.id, contribBonly])).id;
  await q('INSERT INTO public.recommendations(owner_id,item_id,contributor_id,submission_id) VALUES ($1,$2,$3,$4)', [ownerB, item, contribBonly, sB]);
  await callExpecting('remove_contributor_recommendations', ownerA, contribBonly, false, 'owner A cannot touch B-only contributor (no enumeration)');
  const recsBonly = Number((await one('SELECT count(*)::int c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2', [ownerB, contribBonly])).c);
  check('B-only contributor rows intact after owner A attempt', recsBonly === 1, `recs=${recsBonly}`);
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
