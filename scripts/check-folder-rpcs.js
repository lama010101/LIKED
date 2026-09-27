const { Pool } = require('pg');

// Connection string candidates from audit-01.js pattern
const CANDIDATES = [
  process.env.DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.DATABASE_URL
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

async function checkFolderRpcs() {
  const { pool, client } = await tryConnect();
  try {
    const { rows } = await client.query(`
      SELECT p.proname AS function_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'add_node_to_folder',
          'remove_node_from_folder',
          'delete_folder',
          'move_folder'
        );
    `);
    console.log('Folder RPCs found:');
    console.table(rows);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

checkFolderRpcs();
