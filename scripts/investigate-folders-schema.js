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

async function investigateFoldersSchema() {
  const { pool, client } = await tryConnect();
  try {
    console.log('\n=== QUERY 1: Current columns on folders table ===');
    const q1 = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'folders'
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(q1.rows, null, 2));

    console.log('\n=== QUERY 2: Does create_folder RPC exist in pg_proc ===');
    const q2 = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'create_folder'
    `);
    console.log(JSON.stringify(q2.rows, null, 2));

    console.log('\n=== QUERY 3: Full source of create_folder if it exists ===');
    const q3 = await client.query(`
      SELECT pg_get_functiondef(oid)
      FROM pg_proc
      WHERE proname = 'create_folder'
    `);
    console.log(JSON.stringify(q3.rows, null, 2));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

investigateFoldersSchema();
