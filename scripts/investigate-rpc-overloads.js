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

async function runQueries() {
  const { pool, client } = await tryConnect();
  try {
    console.log('QUERY 1 — All overloads of direct_share:');
    console.log('SELECT proname, pronargs, pg_get_function_arguments(oid), oid FROM pg_proc WHERE proname = \'direct_share\';');
    const result1 = await client.query(
      "SELECT proname, pronargs, pg_get_function_arguments(oid), oid FROM pg_proc WHERE proname = 'direct_share'"
    );
    console.table(result1.rows);
    console.log();

    console.log('QUERY 2 — Full source of each direct_share overload:');
    console.log('SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = \'direct_share\';');
    const result2 = await client.query(
      "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'direct_share'"
    );
    result2.rows.forEach((row, i) => {
      console.log(`--- Overload ${i + 1} (OID: ${result1.rows[i]?.oid}) ---`);
      console.log(row.pg_get_functiondef);
      console.log();
    });

    console.log('QUERY 3 — All overloads of group_share:');
    console.log('SELECT proname, pronargs, pg_get_function_arguments(oid), oid FROM pg_proc WHERE proname = \'group_share\';');
    const result3 = await client.query(
      "SELECT proname, pronargs, pg_get_function_arguments(oid), oid FROM pg_proc WHERE proname = 'group_share'"
    );
    console.table(result3.rows);
    console.log();

    console.log('QUERY 4 — Full source of each group_share overload:');
    console.log('SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = \'group_share\';');
    const result4 = await client.query(
      "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'group_share'"
    );
    result4.rows.forEach((row, i) => {
      console.log(`--- Overload ${i + 1} (OID: ${result3.rows[i]?.oid}) ---`);
      console.log(row.pg_get_functiondef);
      console.log();
    });
  } finally {
    client.release();
    await pool.end();
  }
}

runQueries().catch(console.error);
