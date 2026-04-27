// AUDIT-01 — read-only DB audit for LIKED. One-shot script.
// Usage: node scripts/audit-01.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Try .env.local first (session pooler), then fall back to scripts' historical password
const CANDIDATES = [
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
  'postgresql://postgres:nAvfaukg6D9HiUjf@db.lzkzfqshnjvlzosnntfx.supabase.co:5432/postgres'
];

async function tryConnect() {
  for (const cs of CANDIDATES) {
    const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    try {
      await c.connect();
      console.log('CONNECTED via', cs.split('@')[1]);
      return c;
    } catch (e) {
      console.log('FAIL', cs.split('@')[1], '-', e.code || e.message.slice(0,80));
      try { await c.end(); } catch {}
    }
  }
  throw new Error('No DB connection succeeded.');
}

function section(t) { console.log('\n\n========== ' + t + ' =========='); }

async function main() {
  const client = await tryConnect();
  const out = [];
  const log = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x, null, 2)).join(' '); console.log(s); out.push(s); };

  try {
    section('A. TABLES + COLUMNS');
    log('-- A. TABLES + COLUMNS --');
    let r = await client.query(`SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`);
    let cur = null;
    for (const row of r.rows) {
      if (row.table_name !== cur) { log('\nTABLE: ' + row.table_name); cur = row.table_name; }
      log(`  ${row.column_name}  ${row.data_type}  ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }

    section('B. INDEXES');
    log('\n-- B. INDEXES --');
    r = await client.query(`SELECT indexname, tablename, indexdef
      FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname`);
    for (const row of r.rows) log(`${row.tablename}.${row.indexname}: ${row.indexdef}`);

    section('C. RLS POLICIES');
    log('\n-- C. RLS POLICIES --');
    r = await client.query(`SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`);
    for (const row of r.rows) log(`${row.tablename} :: ${row.policyname} [${row.cmd}]\n   qual: ${row.qual}\n   check: ${row.with_check}`);

    section('D. FUNCTIONS');
    log('\n-- D. FUNCTIONS --');
    r = await client.query(`SELECT routine_name, routine_type, security_type
      FROM information_schema.routines
      WHERE routine_schema='public'
      ORDER BY routine_name`);
    for (const row of r.rows) log(`${row.routine_name}  [${row.routine_type}]  security=${row.security_type}`);

    section('E. EDGES CONSTRAINTS');
    log('\n-- E. EDGES CONSTRAINTS --');
    try {
      r = await client.query(`SELECT conname, contype, pg_get_constraintdef(oid) AS def
        FROM pg_constraint WHERE conrelid='public.edges'::regclass`);
      for (const row of r.rows) log(`${row.conname} [${row.contype}] :: ${row.def}`);
    } catch (e) { log('edges table not found or query failed: ' + e.message); }

    section('F. INVARIANT COLUMN CHECKS');
    log('\n-- F. INVARIANT CHECKS --');

    // F1 edges.cause_id NOT NULL
    r = await client.query(`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='edges' AND column_name='cause_id'`);
    log('F1 edges.cause_id is_nullable: ' + (r.rows[0]?.is_nullable ?? 'MISSING'));

    // F2 nodes.deleted_at nullable
    r = await client.query(`SELECT is_nullable, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='nodes' AND column_name='deleted_at'`);
    log('F2 nodes.deleted_at: ' + JSON.stringify(r.rows[0] ?? 'MISSING'));

    // F3 nodes_sort_cache columns
    r = await client.query(`SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='nodes_sort_cache' ORDER BY ordinal_position`);
    log('F3 nodes_sort_cache columns:');
    for (const row of r.rows) log('   ' + row.column_name + ' ' + row.data_type);

    // F4 causes table
    r = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='causes' ORDER BY ordinal_position`);
    log('F4 causes columns:');
    for (const row of r.rows) log('   ' + row.column_name + ' ' + row.data_type + ' ' + row.is_nullable);

    // F5 ratings.score numeric(3,1)
    r = await client.query(`SELECT column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ratings' ORDER BY ordinal_position`);
    log('F5 ratings columns:');
    for (const row of r.rows) log('   ' + row.column_name + ' ' + row.data_type + ' p=' + row.numeric_precision + ' s=' + row.numeric_scale);

    section('G. UNIQUE on edges (node_id,user_id) check');
    r = await client.query(`SELECT i.relname AS index_name, ix.indisunique AS is_unique,
        array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS cols
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname='edges' AND t.relnamespace = 'public'::regnamespace
      GROUP BY i.relname, ix.indisunique`);
    for (const row of r.rows) log(`${row.index_name} unique=${row.is_unique} cols=${Array.isArray(row.cols) ? row.cols.join(',') : String(row.cols)}`);

    section('H. RLS enabled per table');
    r = await client.query(`SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname`);
    for (const row of r.rows) log(`${row.relname} rls=${row.relrowsecurity} force=${row.relforcerowsecurity}`);

    section('I. schema_migrations / supabase_migrations');
    try {
      r = await client.query(`SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_name ILIKE '%migration%' ORDER BY table_schema, table_name`);
      log('migration-tracking tables: ' + JSON.stringify(r.rows));
      for (const row of r.rows) {
        try {
          const r2 = await client.query(`SELECT * FROM ${row.table_schema}.${row.table_name} ORDER BY 1`);
          log(`-- contents of ${row.table_schema}.${row.table_name} (${r2.rowCount} rows) --`);
          for (const m of r2.rows) log('   ' + JSON.stringify(m));
        } catch (e) { log('  (could not read: ' + e.message + ')'); }
      }
    } catch (e) { log('migration table check failed: ' + e.message); }

    section('J. row counts');
    const counts = ['users','nodes','causes','edges','ratings','nodes_sort_cache','folders','folder_edges','folder_tree','folder_admins','groups','group_members','group_admins','group_nodes','tags','tag_translations','tag_edges','translations','blocks','notifications','activity_log','friend_invites','user_node_preferences'];
    for (const t of counts) {
      try {
        const cr = await client.query(`SELECT COUNT(*)::int AS n FROM public."${t}"`);
        log(t + ' rows = ' + cr.rows[0].n);
      } catch (e) { log(t + ' MISSING (' + e.message.split('\n')[0] + ')'); }
    }

    fs.writeFileSync(path.join(__dirname, 'audit-01-output.txt'), out.join('\n'));
    console.log('\n=== Wrote scripts/audit-01-output.txt ===');
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
