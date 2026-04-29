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

async function applyMigration012() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/012_restore_admin_tables.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 012 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verification A: folder_admins table exists
    console.log('\n=== Verification A: folder_admins table exists ===');
    const verA = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'folder_admins'
    `);
    console.log(JSON.stringify(verA.rows, null, 2));

    // Verification B: group_admins table exists
    console.log('\n=== Verification B: group_admins table exists ===');
    const verB = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'group_admins'
    `);
    console.log(JSON.stringify(verB.rows, null, 2));

    // Verification C: columns on each table
    console.log('\n=== Verification C: columns on each table ===');
    const verC = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('folder_admins', 'group_admins')
      ORDER BY table_name, ordinal_position
    `);
    console.log(JSON.stringify(verC.rows, null, 2));

    if (verA.rows.length === 1 && verB.rows.length === 1 && verC.rows.length > 0) {
      console.log('✅ All verifications passed');
    } else {
      console.log('❌ Verification failed');
      console.log('  - folder_admins table:', verA.rows.length === 1 ? 'PASS' : 'FAIL');
      console.log('  - group_admins table:', verB.rows.length === 1 ? 'PASS' : 'FAIL');
      console.log('  - columns present:', verC.rows.length > 0 ? 'PASS' : 'FAIL');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration012();
