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

async function applyMigration026() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/026_create_tag.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 026 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verify function exists
    const { rows } = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(oid)
      FROM pg_proc
      WHERE proname = 'create_tag_with_translation'
    `);
    console.log('Function verification:', rows);
    if (rows.length === 1 && rows[0].pronargs === 3) {
      console.log('✅ Function create_tag_with_translation exists with 3 arguments');
    } else {
      console.log('❌ Function verification failed:', rows);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration026();
