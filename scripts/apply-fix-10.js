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

async function applyFix10() {
  const { pool, client } = await tryConnect();
  try {
    await client.query('BEGIN');
    try {
      console.log('Dropping stale 3-arg direct_share overload...');
      await client.query('DROP FUNCTION IF EXISTS public.direct_share(uuid, uuid, uuid)');
      console.log('✅ direct_share 3-arg overload dropped');

      console.log('Dropping stale 3-arg group_share overload...');
      await client.query('DROP FUNCTION IF EXISTS public.group_share(uuid, uuid, uuid)');
      console.log('✅ group_share 3-arg overload dropped');

      await client.query('COMMIT');
      console.log('✅ FIX-10 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verification A — only one direct_share overload remains
    console.log('\nVerification A — direct_share overloads:');
    const resultA = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(oid)
      FROM pg_proc
      WHERE proname = 'direct_share'
    `);
    console.table(resultA.rows);
    if (resultA.rows.length === 1 && resultA.rows[0].pronargs === 4) {
      console.log('✅ Exactly 1 direct_share overload with 4 arguments');
    } else {
      console.log('❌ Unexpected direct_share state');
    }

    // Verification B — only one group_share overload remains
    console.log('\nVerification B — group_share overloads:');
    const resultB = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(oid)
      FROM pg_proc
      WHERE proname = 'group_share'
    `);
    console.table(resultB.rows);
    if (resultB.rows.length === 1 && resultB.rows[0].pronargs === 4) {
      console.log('✅ Exactly 1 group_share overload with 4 arguments');
    } else {
      console.log('❌ Unexpected group_share state');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyFix10();
