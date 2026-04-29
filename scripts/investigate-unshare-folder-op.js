const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Connection string candidates from audit-01.js pattern
const CANDIDATES = [
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
  'postgresql://postgres:nAvfaukg6D9HiUjf@db.lzkzfqshnjvlzosnntfx.supabase.co:5432/postgres'
];

async function tryConnect() {
  for (const cs of CANDIDATES) {
    const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('Connected via', cs.split('@')[1]);
      return { pool, client };
    } catch (e) {
      console.log('FAIL', cs.split('@')[1], '-', e.code || e.message.slice(0, 80));
      try { client.release(); await pool.end(); } catch {}
    }
  }
  throw new Error('No DB connection succeeded.');
}

async function investigate() {
  const { pool, client } = await tryConnect();
  try {
    console.log('\n=== 1. Check for unshare_folder_op RPC ===');
    const { rows: rpcRows } = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(oid)
      FROM pg_proc
      WHERE proname = 'unshare_folder_op'
    `);
    console.log('Result:', rpcRows);

    console.log('\n=== 2. Check causes table columns ===');
    const { rows: columnRows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'causes'
      ORDER BY ordinal_position
    `);
    console.log('Result:');
    columnRows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

investigate();
