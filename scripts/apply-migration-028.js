const fs = require('fs');
const path = require('path');
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

async function applyMigration028() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/028_folder_rename.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 028 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verify function exists
    const { rows } = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname = 'rename_folder'
    `);
    console.log('pg_proc verification:', rows);
    if (rows.length > 0) {
      console.log('✅ rename_folder function confirmed in pg_proc');
    } else {
      console.log('❌ rename_folder function not found in pg_proc');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration028();
