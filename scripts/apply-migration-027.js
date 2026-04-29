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

async function applyMigration027() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/027_node_deleted.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 027 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verify function exists
    const { rows } = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'set_node_deleted'
    `);
    console.log('pg_proc verification:', rows);
    if (rows.length > 0) {
      console.log('✅ set_node_deleted function confirmed in pg_proc');
    } else {
      console.log('❌ set_node_deleted function not found in pg_proc');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration027();
