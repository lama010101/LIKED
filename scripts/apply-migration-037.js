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

async function applyMigration037() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/037_fix_lang_ambiguous.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 037 applied (fix_lang_ambiguous)');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verify function exists and has correct signature
    const { rows } = await client.query(`
      SELECT proname, prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND proname = 'create_node_with_metadata';
    `);
    console.log('Verification — create_node_with_metadata function status:');
    console.table(rows);
    if (rows.length === 1 && rows[0].prosecdef === true) {
      console.log('✅ create_node_with_metadata function is SECURITY DEFINER');
    } else {
      console.log('❌ Verification failed');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration037();
