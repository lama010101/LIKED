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

async function verifyFix005() {
  const { pool, client } = await tryConnect();
  try {
    // Verification A: column exists
    console.log('\n=== Verification A: color_hex column exists ===');
    const verA = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'folders'
        AND column_name = 'color_hex'
    `);
    console.log(JSON.stringify(verA.rows, null, 2));

    // Verification B: exactly one create_folder overload with pronargs = 2
    console.log('\n=== Verification B: create_folder overloads ===');
    const verB = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(oid)
      FROM pg_proc
      WHERE proname = 'create_folder'
    `);
    console.log(JSON.stringify(verB.rows, null, 2));

    if (verA.rows.length === 1 && verB.rows.length === 1 && verB.rows[0].pronargs === 2) {
      console.log('✅ All verifications passed');
    } else {
      console.log('❌ Verification failed');
      console.log('  - color_hex column:', verA.rows.length === 1 ? 'PASS' : 'FAIL');
      console.log('  - single overload:', verB.rows.length === 1 ? 'PASS' : 'FAIL');
      console.log('  - pronargs = 2:', verB.rows.length > 0 && verB.rows[0].pronargs === 2 ? 'PASS' : 'FAIL');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyFix005();
